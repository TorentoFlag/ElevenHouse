import { createPostgresConnectionConfig } from "@elevenhouse/db/connection";
import { resolveChartExecutionProfile } from "@elevenhouse/domain";
import { createChartWorkerRuntimeConfig } from "./runtime-config";

export function validateChartWorkerStartupConfig(
  source: Record<string, string | undefined> = process.env
): void {
  createPostgresConnectionConfig(source);
  createChartWorkerRuntimeConfig(source);
  resolveChartExecutionProfile(source);
}

if (require.main === module) {
  validateChartWorkerStartupConfig();
}
