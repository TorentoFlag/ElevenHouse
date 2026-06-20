import type { ConfigService } from "@nestjs/config";

export type PublicApiHttpApp = {
  readonly set: (setting: "trust proxy", value: boolean) => void;
  readonly enableCors: (options: {
    readonly origin: string[];
    readonly credentials: true;
  }) => void;
};

export function configurePublicApiHttpSettings(
  app: PublicApiHttpApp,
  configService: ConfigService
): void {
  app.set("trust proxy", configService.getOrThrow<boolean>("publicApi.trustProxy"));
  const allowedOrigins = configService.getOrThrow<readonly string[]>("publicApi.allowedOrigins");

  app.enableCors({
    origin: [...allowedOrigins],
    credentials: true
  });
}
