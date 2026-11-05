import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-32-chars",
  S3_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY: "a",
  S3_SECRET_KEY: "b",
  S3_BUCKET: "qlcv-files",
};

describe("parseEnv", () => {
  it("chấp nhận cấu hình hợp lệ và điền giá trị mặc định", () => {
    const env = parseEnv(valid);
    expect(env.API_PORT).toBe(3000);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:5173"]);
    expect(env.SMTP_HOST).toBe("127.0.0.1");
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.ATTACHMENT_ALLOWED_MIME).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
    expect(env.ATTACHMENT_MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(env.ATTACHMENT_UPLOAD_URL_SECONDS).toBe(300);
  });

  it("báo lỗi dễ hiểu khi thiếu biến bắt buộc", () => {
    const thieu: Record<string, string | undefined> = { ...valid };
    delete thieu.DATABASE_URL;
    expect(() => parseEnv(thieu)).toThrow(/DATABASE_URL/);
  });

  it("báo lỗi khi cổng sai", () => {
    expect(() => parseEnv({ ...valid, API_PORT: "99999" })).toThrow(/API_PORT/);
  });

  it("dùng bí mật mặc định trong development nhưng bắt buộc cấu hình riêng ở production", () => {
    const development = { ...valid, JWT_ACCESS_SECRET: undefined };
    expect(parseEnv(development).JWT_ACCESS_SECRET).toContain(
      "development-only",
    );
    expect(() => parseEnv({ ...development, NODE_ENV: "production" })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it("tách nhiều địa chỉ CORS", () => {
    const env = parseEnv({
      ...valid,
      CORS_ORIGINS: "http://a.com, http://b.com",
    });
    expect(env.CORS_ORIGINS).toEqual(["http://a.com", "http://b.com"]);
  });

  it("từ chối wildcard origin khi API bật credentials", () => {
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: "*" })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it("chuẩn hóa danh sách MIME và kiểm tra hạn mức tệp", () => {
    const env = parseEnv({
      ...valid,
      ATTACHMENT_ALLOWED_MIME: "image/jpeg, application/pdf,image/jpeg",
      ATTACHMENT_MAX_FILE_BYTES: "1024",
    });
    expect(env.ATTACHMENT_ALLOWED_MIME).toEqual([
      "image/jpeg",
      "application/pdf",
    ]);
    expect(env.ATTACHMENT_MAX_FILE_BYTES).toBe(1024);
    expect(() =>
      parseEnv({ ...valid, ATTACHMENT_PROJECT_QUOTA_BYTES: "0" }),
    ).toThrow(/ATTACHMENT_PROJECT_QUOTA_BYTES/);
  });
});
