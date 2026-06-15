import { z } from "@elevenhouse/validation";

const publicApiRuntimeConfigSchema = z.object({
  PUBLIC_API_PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_API_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  PUBLIC_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

export type PublicApiRuntimeConfig = {
  readonly port: number;
  readonly sessionTtlSeconds: number;
  readonly sessionCookieSecure: boolean;
};

export function createPublicApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): PublicApiRuntimeConfig {
  const config = publicApiRuntimeConfigSchema.parse(source);

  return {
    port: config.PUBLIC_API_PORT,
    sessionTtlSeconds: config.PUBLIC_API_SESSION_TTL_SECONDS,
    sessionCookieSecure: config.PUBLIC_API_SESSION_COOKIE_SECURE
  };
}
