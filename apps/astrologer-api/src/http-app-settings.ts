import type { ConfigService } from "@nestjs/config";

export type AstrologerApiHttpApp = {
  readonly set: (setting: "trust proxy", value: boolean) => void;
  readonly enableCors: (options: { readonly origin: string[]; readonly credentials: true }) => void;
};

export function configureAstrologerApiHttpSettings(
  app: AstrologerApiHttpApp,
  configService: ConfigService
): void {
  app.set("trust proxy", configService.getOrThrow<boolean>("astrologerApi.trustProxy"));
  const allowedOrigins = configService.getOrThrow<readonly string[]>(
    "astrologerApi.allowedOrigins"
  );

  app.enableCors({
    origin: [...allowedOrigins],
    credentials: true
  });
}
