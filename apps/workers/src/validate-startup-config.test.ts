import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateWorkersStartupConfig } from "./validate-startup-config";

describe("validateWorkersStartupConfig", () => {
  it("validates every configuration authority used before workers starts", () => {
    const source = parseEnvironmentExample(
      readFileSync("deployment/env/.env.production.example", "utf8")
    );

    expect(() =>
      validateWorkersStartupConfig({ ...source, NODE_ENV: "production" })
    ).not.toThrow();
    expect(() =>
      validateWorkersStartupConfig({
        ...source,
        NODE_ENV: "production",
        WORKERS_FLOW_EXECUTION_ERROR_BACKOFF_MAX_MS: undefined
      })
    ).toThrow("WORKERS_FLOW_EXECUTION_ERROR_BACKOFF_MAX_MS");
    expect(() =>
      validateWorkersStartupConfig({
        ...source,
        NODE_ENV: "production",
        DATABASE_URL: "https://wrong.example/elevenhouse"
      })
    ).toThrow("Unsupported database protocol");
  });
});

function parseEnvironmentExample(source: string): Record<string, string> {
  return Object.fromEntries(
    source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}
