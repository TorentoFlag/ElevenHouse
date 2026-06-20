import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createLogger } from "@elevenhouse/observability";
import { AppModule } from "./app.module";
import { configureAstrologerApiHttpSettings } from "./http-app-settings";

async function bootstrap() {
  const logger = createLogger("astrologer-api");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>("astrologerApi.port");

  configureAstrologerApiHttpSettings(app, configService);
  app.enableShutdownHooks();
  await app.listen(port);

  logger.info("astrologer-api listening", { port });
}

void bootstrap();
