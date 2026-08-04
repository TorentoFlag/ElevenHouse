import { createPostgresConnectionConfig } from "@elevenhouse/db/connection";
import { resolveChartExecutionProfile } from "@elevenhouse/domain";
import { createWorkersRuntimeConfig } from "./runtime-config";

export function validateWorkersStartupConfig(
  source: Record<string, string | undefined> = process.env
): void {
  createPostgresConnectionConfig(source);
  createWorkersRuntimeConfig(source);
  resolveChartExecutionProfile(source);
}

if (require.main === module) {
  validateWorkersStartupConfig();
}
