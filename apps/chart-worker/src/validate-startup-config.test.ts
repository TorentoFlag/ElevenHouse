import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateChartWorkerStartupConfig } from "./validate-startup-config";

describe("validateChartWorkerStartupConfig", () => {
  it("validates every configuration authority used before chart-worker starts", () => {
    const source = parseEnvironmentExample(
      readFileSync("deployment/env/.env.production.example", "utf8")
    );

    expect(() =>
      validateChartWorkerStartupConfig({ ...source, NODE_ENV: "production" })
    ).not.toThrow();
    expect(() =>
      validateChartWorkerStartupConfig({
        ...source,
        NODE_ENV: "production",
        DATABASE_URL: "https://wrong.example/elevenhouse"
      })
    ).toThrow("Unsupported database protocol");
    expect(() =>
      validateChartWorkerStartupConfig({
        ...source,
        NODE_ENV: "production",
        CHART_ENGINE_EXPECTED_EPHEMERIS: "moshier"
      })
    ).toThrow("moshier is not allowed in production");
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
