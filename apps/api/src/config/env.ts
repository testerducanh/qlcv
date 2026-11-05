import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32)
      .default("qlcv-development-only-secret-do-not-use-in-production"),
    WEB_BASE_URL: z.string().url().default("http://localhost:5173"),
    SMTP_HOST: z.string().min(1).default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().email().default("no-reply@qlcv.local"),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    ATTACHMENT_ALLOWED_MIME: z
      .string()
      .default("image/jpeg,image/png,image/webp,application/pdf")
      .transform((value) => [
        ...new Set(
          value
            .split(",")
            .map((mime) => mime.trim().toLowerCase())
            .filter(Boolean),
        ),
      ])
      .refine(
        (types) =>
          types.every((mime) =>
            [
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/gif",
              "image/avif",
              "application/pdf",
              "application/zip",
            ].includes(mime),
          ),
        "Danh sách chỉ được chứa MIME có kiểm tra chữ ký tệp",
      ),
    ATTACHMENT_MAX_FILE_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .default(25 * 1024 * 1024),
    ATTACHMENT_MAX_PER_TASK: z.coerce.number().int().min(1).default(100),
    ATTACHMENT_PROJECT_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .default(5 * 1024 * 1024 * 1024),
    ATTACHMENT_ORGANIZATION_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .default(100 * 1024 * 1024 * 1024),
    ATTACHMENT_UPLOAD_URL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(900)
      .default(300),
    ATTACHMENT_DOWNLOAD_URL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(300)
      .default(120),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((s) =>
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      )
      .refine(
        (origins) => !origins.includes("*"),
        "CORS_ORIGINS phải là danh sách origin tin cậy, không hỗ trợ wildcard",
      ),
    BODY_LIMIT: z.string().default("1mb"),
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === "production" &&
      config.JWT_ACCESS_SECRET ===
        "qlcv-development-only-secret-do-not-use-in-production"
    ) {
      context.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message: "Phải cấu hình JWT_ACCESS_SECRET riêng trong production.",
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(
      `Cấu hình môi trường không hợp lệ:\n${lines.join("\n")}\n` +
        "Hãy kiểm tra file .env (mẫu: .env.example).",
    );
  }
  return result.data;
}

export function loadEnv(): Env {
  for (const p of [".env", "../../.env"]) {
    const file = resolve(process.cwd(), p);
    if (existsSync(file)) {
      process.loadEnvFile(file);
      break;
    }
  }
  return parseEnv(process.env);
}
