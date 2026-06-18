import { z } from "@elevenhouse/validation";

const opsApiRuntimeConfigSchema = z.object({
  OPS_API_PORT: z.coerce.number().int().positive().default(3002),
  REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379")
});

export type OpsApiRuntimeConfig = {
  readonly port: number;
  readonly redisUrl: string;
};

export function createOpsApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): OpsApiRuntimeConfig {
  const config = opsApiRuntimeConfigSchema.parse(source);

  return {
    port: config.OPS_API_PORT,
    redisUrl: config.REDIS_URL
  };
}
