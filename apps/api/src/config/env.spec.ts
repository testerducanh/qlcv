import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
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
  });

  it("báo lỗi dễ hiểu khi thiếu biến bắt buộc", () => {
    const thieu: Record<string, string | undefined> = { ...valid };
    delete thieu.DATABASE_URL;
    expect(() => parseEnv(thieu)).toThrow(/DATABASE_URL/);
  });

  it("báo lỗi khi cổng sai", () => {
    expect(() => parseEnv({ ...valid, API_PORT: "99999" })).toThrow(/API_PORT/);
  });

  it("tách nhiều địa chỉ CORS", () => {
    const env = parseEnv({
      ...valid,
      CORS_ORIGINS: "http://a.com, http://b.com",
    });
    expect(env.CORS_ORIGINS).toEqual(["http://a.com", "http://b.com"]);
  });
});
