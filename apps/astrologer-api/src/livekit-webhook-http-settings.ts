import type { NestExpressApplication } from "@nestjs/platform-express";

export function configureLiveKitWebhookHttpSettings(app: NestExpressApplication): void {
  app.useBodyParser("raw", {
    type: "application/webhook+json",
    limit: "1mb"
  });
}
