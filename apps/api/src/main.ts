import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { JsonLogger } from "./common/json-logger";
import { requestLogger } from "./common/request-logger";
import { Env, loadEnv } from "./config/env";

async function bootstrap() {
  let env: Env;
  try {
    env = loadEnv();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const logger = new JsonLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    bodyParser: true,
  });

  app.use(requestLogger(logger));
  app.use(helmet());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useBodyParser("json", { limit: env.BODY_LIMIT });
  app.useBodyParser("urlencoded", { limit: env.BODY_LIMIT, extended: true });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
  logger.log({ message: `API chạy tại cổng ${env.API_PORT}` });
}

bootstrap();
