import { z } from "@elevenhouse/validation";

const publicApiRuntimeConfigSchema = z.object({
  PUBLIC_API_PORT: z.coerce.number().int().positive().default(3001)
});

export type PublicApiRuntimeConfig = {
  readonly port: number;
};

export function createPublicApiRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): PublicApiRuntimeConfig {
  const config = publicApiRuntimeConfigSchema.parse(source);

  return {
    port: config.PUBLIC_API_PORT
  };
}
