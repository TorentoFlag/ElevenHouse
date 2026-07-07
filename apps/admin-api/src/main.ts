import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createLogger } from "@elevenhouse/observability";
import { AppModule } from "./app.module";
import { configureAdminApiHttpSettings } from "./http-app-settings";

async function bootstrap() {
  const logger = createLogger("admin-api");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>("adminApi.port");

  configureAdminApiHttpSettings(app, configService);
  app.enableShutdownHooks();
  await app.listen(port);

  logger.info("admin-api listening", { port });
}

void bootstrap();
