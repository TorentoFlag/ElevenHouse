import { z } from "@elevenhouse/validation";

const opsApiRuntimeConfigSchema = z.object({
  OPS_API_PORT: z.coerce.number().int().positive().default(3002)
});

export type OpsApiRuntimeConfig = {
  readonly port: number;
};

export function createOpsApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): OpsApiRuntimeConfig {
  const config = opsApiRuntimeConfigSchema.parse(source);

  return {
    port: config.OPS_API_PORT
  };
}
