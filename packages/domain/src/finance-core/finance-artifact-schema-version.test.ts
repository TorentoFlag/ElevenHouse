import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = resolveDomainPackageRoot(process.cwd());

describe("finance artifact schema version representation", () => {
  it("uses numeric schemaVersion 1 in every production finance-core artifact", () => {
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

    const offenders = parsed.fileNames
      .filter((fileName) => relative(packageRoot, fileName).startsWith("src/finance-core/"))
      .flatMap((fileName) =>
        readFileSync(fileName, "utf8")
          .split(/\r?\n/u)
          .map((line, index) => ({ fileName, line, lineNumber: index + 1 }))
      )
      .filter(({ line }) => /schemaVersion[^\r\n]*["']1["']/u.test(line))
      .map(
        ({ fileName, line, lineNumber }) =>
          `${relative(packageRoot, fileName)}:${lineNumber}:${line.trim()}`
      );

    expect(offenders).toEqual([]);
  });
});

function resolveDomainPackageRoot(currentDirectory: string): string {
  for (const candidate of [currentDirectory, resolve(currentDirectory, "packages/domain")]) {
    const manifestPath = resolve(candidate, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      readonly name?: unknown;
    };
    if (manifest.name === "@elevenhouse/domain") return candidate;
  }
  throw new Error("Could not resolve @elevenhouse/domain package root");
}
