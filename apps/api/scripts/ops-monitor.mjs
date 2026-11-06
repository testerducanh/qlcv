import Redis from "ioredis";
import nodemailer from "nodemailer";
import process from "node:process";

const required = ["OPS_MONITOR_TOKEN", "OPS_ALERT_EMAIL", "REDIS_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(
    `Missing operations monitor configuration: ${missing.join(", ")}`,
  );
}

const apiUrl =
  process.env.OPS_API_URL || "http://127.0.0.1:3000/health/operations";
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "127.0.0.1",
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === "true",
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  ...(process.env.SMTP_USER && process.env.SMTP_PASSWORD
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
    : {}),
});

async function sendAlert(subject, text) {
  await mailer.sendMail({
    from: process.env.SMTP_FROM || "no-reply@qlcv.local",
    to: process.env.OPS_ALERT_EMAIL,
    subject: `[QLCV vận hành] ${subject}`,
    text,
  });
}

async function checkOperations() {
  let incident;
  try {
    const response = await globalThis.fetch(apiUrl, {
      headers: { authorization: `Bearer ${process.env.OPS_MONITOR_TOKEN}` },
      signal: globalThis.AbortSignal.timeout(8000),
    });
    const body = await response.json();
    if (!response.ok || body?.status !== "ok") {
      const workerStatus = body?.worker?.status || "unknown";
      const queueStatus = body?.queue?.status || "unknown";
      incident = {
        key: "qlcv:ops:alert:degraded",
        message: `Trạng thái dịch vụ suy giảm (HTTP ${response.status}; worker ${workerStatus}; hàng đợi ${queueStatus}).`,
      };
    }
  } catch {
    incident = {
      key: "qlcv:ops:alert:unreachable",
      message:
        "Không kết nối được API giám sát hoặc API trả phản hồi không hợp lệ; kiểm tra API, mạng và token monitor.",
    };
  }

  if (incident) {
    const firstOccurrence = await redis.set(
      incident.key,
      new Date().toISOString(),
      "EX",
      1800,
      "NX",
    );
    if (firstOccurrence === "OK") {
      try {
        await sendAlert("Cần kiểm tra dịch vụ", incident.message);
      } catch (error) {
        await redis.del(incident.key);
        throw error;
      }
      globalThis.console.error(incident.message);
    } else {
      globalThis.console.error(
        `${incident.message} Cảnh báo đã gửi trong 30 phút qua.`,
      );
    }
    return;
  }

  const recoveredKeys = [
    "qlcv:ops:alert:degraded",
    "qlcv:ops:alert:unreachable",
  ];
  const recovered = [];
  for (const key of recoveredKeys) {
    if ((await redis.del(key)) > 0) recovered.push(key);
  }
  if (recovered.length) {
    await sendAlert(
      "Dịch vụ đã phục hồi",
      "API, worker và hàng đợi đã trở lại trạng thái khỏe mạnh.",
    );
  }
  globalThis.console.info("Operations monitor check passed");
}

try {
  await checkOperations();
} finally {
  mailer.close();
  await redis.quit();
}
