import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { buildCandidateLineage, type PhasePlan } from "./rebuild-forward-migration-lineage";

describe("forward migration lineage builder", () => {
  it("builds phase migrations in a private output directory", async () => {
    const packageDirectory = join(process.cwd(), "packages/db");
    const outputDirectory = await mkdtemp(join(tmpdir(), "elevenhouse-lineage-candidate-"));
    const sourceManifestPath = join(outputDirectory, "source-manifest.json");
    const phasePlan: readonly PhasePlan[] = [
      { index: 0, name: "identity", schemaModules: ["identity"] },
      { index: 1, name: "outbox", schemaModules: ["identity", "outbox"] }
    ];

    try {
      await writeFile(sourceManifestPath, "source-v1\n", "utf8");

      const lineage = await buildCandidateLineage({
        packageDirectory,
        outputDirectory: join(outputDirectory, "candidate"),
        sourceManifestPaths: [sourceManifestPath],
        phasePlan
      });

      expect(lineage.artifacts.map((artifact) => artifact.index)).toEqual([0, 1]);
      expect(lineage.artifacts.map((artifact) => artifact.tag)).toEqual([
        "0000_identity",
        "0001_outbox"
      ]);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("refuses to build when the captured source manifest changes", async () => {
    const packageDirectory = join(process.cwd(), "packages/db");
    const outputDirectory = await mkdtemp(join(tmpdir(), "elevenhouse-lineage-candidate-"));
    const sourceManifestPath = join(outputDirectory, "source-manifest.json");

    try {
      await writeFile(sourceManifestPath, "source-v1\n", "utf8");
      const sourceManifest = await buildCandidateLineage.captureSourceManifest([sourceManifestPath]);
      await writeFile(sourceManifestPath, "source-v2\n", "utf8");

      await expect(
        buildCandidateLineage({
          packageDirectory,
          outputDirectory: join(outputDirectory, "candidate"),
          sourceManifestPaths: [sourceManifestPath],
          sourceManifest,
          phasePlan: [{ index: 0, name: "identity", schemaModules: ["identity"] }]
        })
      ).rejects.toThrow("MIGRATION_LINEAGE_SOURCE_CHANGED");
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("refuses a phase that Drizzle does not materialize", async () => {
    const packageDirectory = join(process.cwd(), "packages/db");
    const outputDirectory = await mkdtemp(join(tmpdir(), "elevenhouse-lineage-candidate-"));
    const sourceManifestPath = join(outputDirectory, "source-manifest.json");

    try {
      await writeFile(sourceManifestPath, "source-v1\n", "utf8");

      await expect(
        buildCandidateLineage({
          packageDirectory,
          outputDirectory: join(outputDirectory, "candidate"),
          sourceManifestPaths: [sourceManifestPath],
          phasePlan: [
            { index: 0, name: "identity", schemaModules: ["identity"] },
            { index: 1, name: "identity_again", schemaModules: ["identity"] }
          ]
        })
      ).rejects.toThrow("MIGRATION_LINEAGE_PHASE_EMPTY:identity_again");
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs each phase-owned augmenter against only that generated migration", async () => {
    const packageDirectory = join(process.cwd(), "packages/db");
    const outputDirectory = await mkdtemp(join(tmpdir(), "elevenhouse-lineage-candidate-"));
    const sourceManifestPath = join(outputDirectory, "source-manifest.json");

    try {
      await writeFile(sourceManifestPath, "source-v1\n", "utf8");
      const lineage = await buildCandidateLineage({
        packageDirectory,
        outputDirectory: join(outputDirectory, "candidate"),
        sourceManifestPaths: [sourceManifestPath],
        phasePlan: [
          {
            index: 0,
            name: "identity",
            schemaModules: ["identity"],
            augmenters: [async (migrationPath) => appendFile(migrationPath, "\n-- test phase augmenter\n", "utf8")]
          }
        ]
      });

      expect(await readFile(lineage.artifacts[0]!.sqlPath, "utf8")).toContain("-- test phase augmenter");
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
