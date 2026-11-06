import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const envPath = resolve(repoRoot, ".env");
const composePath = resolve(repoRoot, "infra", "docker-compose.yml");
const formatMagic = Buffer.from("QLCVPG1\n");
const saltLength = 16;
const ivLength = 12;
const tagLength = 16;
const headerLength = formatMagic.length + saltLength + ivLength;

try {
  process.loadEnvFile(envPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

function requireConfiguration() {
  const passphrase = process.env.QLCV_BACKUP_PASSPHRASE;
  if (!passphrase || passphrase.length < 32) {
    throw new Error(
      "QLCV_BACKUP_PASSPHRASE must contain at least 32 characters",
    );
  }
  const user = process.env.POSTGRES_USER;
  const database = process.env.POSTGRES_DB;
  if (!user || !database) {
    throw new Error("POSTGRES_USER and POSTGRES_DB must be configured");
  }
  return { passphrase, user, database };
}

function dockerComposeArgs(...args) {
  return [
    "compose",
    "--env-file",
    envPath,
    "-f",
    composePath,
    "exec",
    "-T",
    "postgres",
    ...args,
  ];
}

function runDocker(args, { input, collect = true } = {}) {
  const child = spawn("docker", dockerComposeArgs(...args), {
    cwd: repoRoot,
    stdio: [input ? "pipe" : "ignore", collect ? "pipe" : "ignore", "pipe"],
    windowsHide: true,
  });
  const output = [];
  const errors = [];
  if (collect) child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => errors.push(chunk));
  const exit = new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolvePromise(code));
  });
  const inputComplete = input
    ? pipeline(input, child.stdin)
    : Promise.resolve();
  return Promise.all([exit, inputComplete]).then(([code]) => {
    if (code !== 0) {
      throw new Error(
        `Docker command failed (${code}): ${Buffer.concat(errors)
          .toString("utf8")
          .slice(-2000)}`,
      );
    }
    return Buffer.concat(output);
  });
}

async function digestFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function createBackup(destination) {
  const { passphrase, user, database } = requireConfiguration();
  const outputPath = resolve(destination);
  const temporaryPath = `${outputPath}.${randomBytes(6).toString("hex")}.partial`;
  await mkdir(dirname(outputPath), { recursive: true });

  const salt = randomBytes(saltLength);
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(
    "aes-256-gcm",
    scryptSync(passphrase, salt, 32),
    iv,
  );
  const output = createWriteStream(temporaryPath, { flags: "wx" });
  try {
    output.write(Buffer.concat([formatMagic, salt, iv]));
    const dump = spawn(
      "docker",
      dockerComposeArgs(
        "pg_dump",
        "-U",
        user,
        "-d",
        database,
        "--format=custom",
        "--no-owner",
        "--no-acl",
      ),
      { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    const errors = [];
    dump.stderr.on("data", (chunk) => errors.push(chunk));
    const exit = new Promise((resolvePromise, reject) => {
      dump.once("error", reject);
      dump.once("close", resolvePromise);
    });
    await pipeline(dump.stdout, cipher, output);
    const exitCode = await exit;
    if (exitCode !== 0) {
      throw new Error(
        `PostgreSQL backup failed (${exitCode}): ${Buffer.concat(errors)
          .toString("utf8")
          .slice(-2000)}`,
      );
    }
    await appendFile(temporaryPath, cipher.getAuthTag());
    await rename(temporaryPath, outputPath);
    const metadata = {
      format: "qlcv-postgres-aes-256-gcm-v1",
      createdAt: new Date().toISOString(),
      bytes: (await stat(outputPath)).size,
      sha256: await digestFile(outputPath),
    };
    const manifestPath = `${outputPath}.json`;
    const manifestTemp = `${manifestPath}.partial`;
    await writeFile(manifestTemp, `${JSON.stringify(metadata, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(manifestTemp, manifestPath);
    globalThis.console.info(
      `Encrypted PostgreSQL backup created: ${outputPath}`,
    );
    globalThis.console.info(`SHA-256: ${metadata.sha256}`);
  } catch (error) {
    output.destroy();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function decryptBackup(path) {
  const { passphrase } = requireConfiguration();
  const info = await stat(path);
  if (info.size < headerLength + tagLength + 1) {
    throw new Error("Backup file is too small or truncated");
  }
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(headerLength);
    const tag = Buffer.alloc(tagLength);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, info.size - tagLength);
    if (!header.subarray(0, formatMagic.length).equals(formatMagic)) {
      throw new Error("Unsupported or invalid backup format");
    }
    const salt = header.subarray(
      formatMagic.length,
      formatMagic.length + saltLength,
    );
    const iv = header.subarray(formatMagic.length + saltLength);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      scryptSync(passphrase, salt, 32),
      iv,
    );
    decipher.setAuthTag(tag);
    const ciphertext = createReadStream(path, {
      start: headerLength,
      end: info.size - tagLength - 1,
    });
    return { stream: ciphertext.pipe(decipher), decipher };
  } finally {
    await handle.close();
  }
}

async function verifyRestore(path) {
  const { user } = requireConfiguration();
  const backupPath = resolve(path);
  const manifestPath = `${backupPath}.json`;
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.sha256 !== (await digestFile(backupPath))) {
      throw new Error("Backup SHA-256 does not match its manifest");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    globalThis.console.warn(
      "Backup manifest is missing; GCM authentication will still be checked.",
    );
  }

  const targetDatabase = `qlcv_restore_verify_${randomBytes(6).toString("hex")}`;
  let created = false;
  try {
    await runDocker(["createdb", "-U", user, "-O", user, targetDatabase]);
    created = true;
    const { stream } = await decryptBackup(backupPath);
    await runDocker(
      [
        "pg_restore",
        "-U",
        user,
        "--dbname",
        targetDatabase,
        "--no-owner",
        "--no-acl",
      ],
      { input: stream, collect: false },
    );
    const result = await runDocker([
      "psql",
      "-U",
      user,
      "-d",
      targetDatabase,
      "-At",
      "-c",
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
    ]);
    const tableCount = Number(result.toString("utf8").trim());
    if (!Number.isInteger(tableCount) || tableCount < 1) {
      throw new Error("Restored database contains no public tables");
    }
    const migrationCount = await runDocker([
      "psql",
      "-U",
      user,
      "-d",
      targetDatabase,
      "-At",
      "-c",
      "SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL",
    ]);
    const migrations = Number(migrationCount.toString("utf8").trim());
    if (!Number.isInteger(migrations) || migrations < 1) {
      throw new Error("Restored database has no completed Prisma migrations");
    }
    globalThis.console.info(
      `Restore verification passed in isolated database: ${tableCount} tables, ${migrations} migrations.`,
    );
  } finally {
    if (created) {
      await runDocker(["dropdb", "--if-exists", "-U", user, targetDatabase]);
      globalThis.console.info(
        "Temporary restore-verification database removed.",
      );
    }
  }
}

const [action, file] = process.argv.slice(2);
try {
  if (action === "backup" && file) await createBackup(file);
  else if (action === "verify-restore" && file) await verifyRestore(file);
  else {
    throw new Error(
      "Usage: node backup-postgres.mjs backup <encrypted-file> | verify-restore <encrypted-file>",
    );
  }
} catch (error) {
  globalThis.console.error(
    error instanceof Error
      ? error.message
      : "PostgreSQL backup operation failed",
  );
  process.exitCode = 1;
}
