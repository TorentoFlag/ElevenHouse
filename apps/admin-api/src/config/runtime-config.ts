import { z } from "@elevenhouse/validation";

const adminApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADMIN_API_PORT: z.coerce.number().int().positive().default(3003),
  ADMIN_API_TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ADMIN_API_SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ADMIN_API_SESSION_COOKIE_NAME: z.string().trim().min(1).default("elevenhouse_admin_session"),
  ADMIN_API_CSRF_SECRET: z.string().trim().min(32).optional(),
  ADMIN_API_CSRF_COOKIE_NAME: z.string().trim().min(1).default("elevenhouse_admin_csrf"),
  ADMIN_API_CSRF_HEADER_NAME: z.string().trim().min(1).default("x-csrf-token"),
  ADMIN_API_CSRF_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  ADMIN_API_ALLOWED_ORIGINS: z.string().trim().optional()
});

export type AdminApiRuntimeConfig = {
  readonly port: number;
  readonly trustProxy: boolean;
  readonly sessionCookieSecure: boolean;
  readonly sessionCookieName: string;
  readonly csrfSecret: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly csrfTokenTtlSeconds: number;
  readonly allowedOrigins: readonly string[];
};

export function createAdminApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): AdminApiRuntimeConfig {
  const config = adminApiRuntimeConfigSchema.parse(source);
  const allowedOrigins = parseAllowedOrigins(config.ADMIN_API_ALLOWED_ORIGINS);

  if (config.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("ADMIN_API_ALLOWED_ORIGINS is required in production");
  }
  if (config.NODE_ENV === "production" && !config.ADMIN_API_CSRF_SECRET) {
    throw new Error("ADMIN_API_CSRF_SECRET is required in production");
  }

  return {
    port: config.ADMIN_API_PORT,
    trustProxy: config.ADMIN_API_TRUST_PROXY,
    sessionCookieSecure: config.ADMIN_API_SESSION_COOKIE_SECURE,
    sessionCookieName: config.ADMIN_API_SESSION_COOKIE_NAME,
    csrfSecret:
      config.ADMIN_API_CSRF_SECRET ??
      "development-admin-csrf-secret-32-bytes-minimum",
    csrfCookieName: config.ADMIN_API_CSRF_COOKIE_NAME,
    csrfHeaderName: config.ADMIN_API_CSRF_HEADER_NAME,
    csrfTokenTtlSeconds: config.ADMIN_API_CSRF_TOKEN_TTL_SECONDS,
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ["http://localhost:5175"]
  };
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}
