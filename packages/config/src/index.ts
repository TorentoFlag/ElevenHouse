import { z, type ZodType } from "@elevenhouse/validation";

export const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

export function parseEnv<T>(schema: ZodType<T>, source: NodeJS.ProcessEnv = process.env): T {
  return schema.parse(source);
}
