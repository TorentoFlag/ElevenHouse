import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("finance-core package boundary", () => {
  it("exposes only curated server-side finance subpaths", () => {
    const packageRoot = resolveDomainPackageRoot(process.cwd());
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    const rootIndex = readFileSync(resolve(packageRoot, "src/index.ts"), "utf8");

    expect(manifest.exports["./finance-core"]).toEqual({
      types: "./dist/finance-core/index.d.ts",
      import: "./dist/finance-core/index.js",
      require: "./dist/finance-core/index.js"
    });
    expect(manifest.exports["./finance-core/reconciliation"]).toEqual({
      types: "./dist/finance-core/reconciliation.d.ts",
      import: "./dist/finance-core/reconciliation.js",
      require: "./dist/finance-core/reconciliation.js"
    });
    expect(manifest.exports).not.toHaveProperty("./finance-core/*");
    expect(rootIndex).toContain(
      'export * from "./finance-core/client-order-capture-purpose-dispatch";'
    );
    expect(rootIndex).toContain(
      'export * from "./finance-core/ports/client-order-capture-purpose-dispatch-uow";'
    );
    expect(rootIndex).not.toMatch(/export \* from "\.\/finance-core";/);
  });

  it("keeps the finance domain boundary out of browser applications", () => {
    const packageRoot = resolveDomainPackageRoot(process.cwd());
    const repositoryRoot = resolve(packageRoot, "../..");
    const offenders = ["landing", "client-web", "astrologer-web", "admin-web"].flatMap((app) =>
      findTypeScriptFiles(resolve(repositoryRoot, "apps", app, "src")).filter((file) =>
        readFileSync(file, "utf8").includes("@elevenhouse/domain/finance-core")
      )
    );

    expect(offenders).toEqual([]);
  });
});

function resolveDomainPackageRoot(currentDirectory: string): string {
  for (const candidate of [currentDirectory, resolve(currentDirectory, "packages/domain")]) {
    const manifestPath = resolve(candidate, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: unknown };
    if (manifest.name === "@elevenhouse/domain") return candidate;
  }
  throw new Error("Could not resolve @elevenhouse/domain package root");
}

function findTypeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findTypeScriptFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
