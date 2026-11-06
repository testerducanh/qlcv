import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { NestFactory } from "@nestjs/core";
import openapiTS, { astToString } from "openapi-typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "../../..");
const openApiPath = resolve(rootDir, "packages/api-client/openapi.json");
const typesPath = resolve(rootDir, "packages/api-client/src/generated.d.ts");

Object.assign(process.env, {
  NODE_ENV: "test",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://openapi:openapi@127.0.0.1:5432/openapi",
  REDIS_URL: "redis://127.0.0.1:1",
  JWT_ACCESS_SECRET: "openapi-generation-secret-long-enough-for-tests",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "openapi",
  S3_SECRET_KEY: "openapi",
  S3_BUCKET: "openapi",
});

const { AppModule } = await import("../dist/app.module.js");
const app = await NestFactory.create(AppModule, { logger: false });

try {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("QLCV API")
      .setDescription("OpenAPI cho API quản lý tổ chức, dự án và xác thực.")
      .setVersion("1.0")
      .addBearerAuth()
      .addCookieAuth("qlcv_refresh", { type: "apiKey", in: "cookie" })
      .build(),
  );
  const declaration = astToString(await openapiTS(document));
  await mkdir(dirname(openApiPath), { recursive: true });
  await mkdir(dirname(typesPath), { recursive: true });
  await writeFile(openApiPath, `${JSON.stringify(document, null, 2)}\n`);
  await writeFile(typesPath, declaration);
} finally {
  app.get("REDIS").disconnect();
  await app.close();
}
