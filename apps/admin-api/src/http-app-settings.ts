import type { ConfigService } from "@nestjs/config";

export type AdminApiHttpApp = {
  readonly set: (setting: "trust proxy", value: boolean) => void;
  readonly enableCors: (options: {
    readonly origin: string[];
    readonly credentials: true;
  }) => void;
};

export function configureAdminApiHttpSettings(
  app: AdminApiHttpApp,
  configService: ConfigService
): void {
  app.set("trust proxy", configService.getOrThrow<boolean>("adminApi.trustProxy"));
  const allowedOrigins = configService.getOrThrow<readonly string[]>("adminApi.allowedOrigins");

  app.enableCors({
    origin: [...allowedOrigins],
    credentials: true
  });
}
