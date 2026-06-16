import { z } from "@elevenhouse/validation";
import { publicSessionCookieName } from "@elevenhouse/auth";

const localPublicSessionCookieName = "elevenhouse_public_session";

const publicApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_API_PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_API_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PUBLIC_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLIC_API_SESSION_COOKIE_NAME: z.string().trim().min(1).optional(),
  PUBLIC_API_PASSWORDLESS_CODE_SECRET: z.string().trim().min(1).optional(),
  PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  PUBLIC_API_PASSWORDLESS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER: z.enum(["dev"]).default("dev")
});

export type PublicApiRuntimeConfig = {
  readonly port: number;
  readonly sessionTtlSeconds: number;
  readonly sessionCookieSecure: boolean;
  readonly sessionCookieName: string;
  readonly passwordlessCodeSecret: string;
  readonly passwordlessCodeTtlSeconds: number;
  readonly passwordlessResendCooldownSeconds: number;
  readonly passwordlessMaxAttempts: number;
  readonly authCodeDeliveryProvider: "dev";
};

export function createPublicApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): PublicApiRuntimeConfig {
  const config = publicApiRuntimeConfigSchema.parse(source);
  const sessionCookieName =
    config.PUBLIC_API_SESSION_COOKIE_NAME ??
    (config.PUBLIC_API_SESSION_COOKIE_SECURE
      ? publicSessionCookieName
      : localPublicSessionCookieName);

  if (sessionCookieName.startsWith("__Host-") && !config.PUBLIC_API_SESSION_COOKIE_SECURE) {
    throw new Error("__Host-prefixed public session cookies require Secure=true");
  }

  if (config.NODE_ENV === "production" && !config.PUBLIC_API_PASSWORDLESS_CODE_SECRET) {
    throw new Error("PUBLIC_API_PASSWORDLESS_CODE_SECRET is required in production");
  }

  if (
    config.NODE_ENV === "production" &&
    config.PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER === "dev"
  ) {
    throw new Error("Dev auth code delivery is not allowed in production");
  }

  return {
    port: config.PUBLIC_API_PORT,
    sessionTtlSeconds: config.PUBLIC_API_SESSION_TTL_SECONDS,
    sessionCookieSecure: config.PUBLIC_API_SESSION_COOKIE_SECURE,
    sessionCookieName,
    passwordlessCodeSecret:
      config.PUBLIC_API_PASSWORDLESS_CODE_SECRET ??
      "elevenhouse-dev-passwordless-code-secret",
    passwordlessCodeTtlSeconds: config.PUBLIC_API_PASSWORDLESS_CODE_TTL_SECONDS,
    passwordlessResendCooldownSeconds:
      config.PUBLIC_API_PASSWORDLESS_RESEND_COOLDOWN_SECONDS,
    passwordlessMaxAttempts: config.PUBLIC_API_PASSWORDLESS_MAX_ATTEMPTS,
    authCodeDeliveryProvider: config.PUBLIC_API_AUTH_CODE_DELIVERY_PROVIDER
  };
}
