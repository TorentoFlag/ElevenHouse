import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = resolveDomainPackageRoot(process.cwd());

describe("finance-core production compilation boundary", () => {
  it("excludes test-support modules from the domain build root set", () => {
    const configPath = resolve(packageRoot, "tsconfig.build.json");
    const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
    expect(loaded.error).toBeUndefined();

    const parsed = ts.parseJsonConfigFileContent(
      loaded.config as object,
      ts.sys,
      packageRoot,
      undefined,
      configPath
    );
    expect(parsed.errors).toEqual([]);

    const financeCoreFiles = parsed.fileNames
      .map((fileName) => relative(packageRoot, fileName))
      .filter((fileName) => fileName.startsWith("src/finance-core/"));
    const leakedTestSupport = financeCoreFiles.filter((fileName) =>
      /-(?:test-fixture|test-fixtures|test-assertions|test-primitives)\.ts$/.test(fileName)
    );

    expect(financeCoreFiles.length).toBeGreaterThan(0);
    expect(leakedTestSupport).toEqual([]);
  });
});

function resolveDomainPackageRoot(currentDirectory: string): string {
  for (const candidate of [currentDirectory, resolve(currentDirectory, "packages/domain")]) {
    const manifestPath = resolve(candidate, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { readonly name?: unknown };
    if (manifest.name === "@elevenhouse/domain") return candidate;
  }
  throw new Error("Could not resolve @elevenhouse/domain package root");
}
