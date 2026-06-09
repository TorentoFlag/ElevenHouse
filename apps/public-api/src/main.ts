import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { createLogger } from "@elevenhouse/observability";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = createLogger("public-api");
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>("publicApi.port");

  app.enableShutdownHooks();
  await app.listen(port);

  logger.info("public-api listening", { port });
}

void bootstrap();
