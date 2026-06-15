import { z } from "@elevenhouse/validation";
import { publicSessionCookieName } from "@elevenhouse/auth";

const localPublicSessionCookieName = "elevenhouse_public_session";

const publicApiRuntimeConfigSchema = z.object({
  PUBLIC_API_PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_API_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PUBLIC_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLIC_API_SESSION_COOKIE_NAME: z.string().trim().min(1).optional()
});

export type PublicApiRuntimeConfig = {
  readonly port: number;
  readonly sessionTtlSeconds: number;
  readonly sessionCookieSecure: boolean;
  readonly sessionCookieName: string;
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

  return {
    port: config.PUBLIC_API_PORT,
    sessionTtlSeconds: config.PUBLIC_API_SESSION_TTL_SECONDS,
    sessionCookieSecure: config.PUBLIC_API_SESSION_COOKIE_SECURE,
    sessionCookieName
  };
}
