import { z } from "@elevenhouse/validation";

const adminApiRuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADMIN_API_PORT: z.coerce.number().int().positive().default(3003),
  ADMIN_API_TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ADMIN_API_ALLOWED_ORIGINS: z.string().trim().optional()
});

export type AdminApiRuntimeConfig = {
  readonly port: number;
  readonly trustProxy: boolean;
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

  return {
    port: config.ADMIN_API_PORT,
    trustProxy: config.ADMIN_API_TRUST_PROXY,
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ["http://localhost:5175"]
  };
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}
