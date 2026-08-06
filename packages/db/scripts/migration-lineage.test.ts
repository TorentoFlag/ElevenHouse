import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { assertLineageMatchesManifest, readMigrationLineage } from "./migration-lineage";

describe("migration lineage", () => {
  it("reads a contiguous generated lineage and detects a changed SQL artifact", async () => {
    const directory = await createLineageDirectory();

    try {
      await writeGeneratedLineage(directory, ["0000_identity", "0001_products"]);

      const lineage = await readMigrationLineage(directory);

      expect(lineage.artifacts.map((artifact) => artifact.tag)).toEqual([
        "0000_identity",
        "0001_products"
      ]);
      expect(lineage.artifacts[1]?.previousSnapshotId).toBe("snapshot-0");
      expect(() => assertLineageMatchesManifest(lineage, lineage.manifest)).not.toThrow();

      await writeFile(join(directory, "0001_products.sql"), "CREATE TABLE products (id uuid);\n", "utf8");

      expect(() => assertLineageMatchesManifest(lineage, lineage.manifest)).toThrow(
        "MIGRATION_LINEAGE_ARTIFACT_CHANGED"
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a skipped migration index", async () => {
    const directory = await createLineageDirectory();

    try {
      await writeGeneratedLineage(directory, ["0000_identity", "0002_products"]);

      await expect(readMigrationLineage(directory)).rejects.toThrow("MIGRATION_LINEAGE_INDEX_GAP");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a divergent snapshot parent", async () => {
    const directory = await createLineageDirectory();

    try {
      await writeGeneratedLineage(directory, ["0000_identity", "0001_products"], "other-parent");

      await expect(readMigrationLineage(directory)).rejects.toThrow(
        "MIGRATION_LINEAGE_SNAPSHOT_PARENT"
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a journal tag without a matching SQL artifact", async () => {
    const directory = await createLineageDirectory();

    try {
      await writeGeneratedLineage(directory, ["0000_identity"]);
      await writeFile(
        join(directory, "meta", "_journal.json"),
        JSON.stringify({
          version: "7",
          dialect: "postgresql",
          entries: [
            { idx: 0, version: "7", when: 1, tag: "0000_identity", breakpoints: true },
            { idx: 1, version: "7", when: 2, tag: "0001_missing", breakpoints: true }
          ]
        }),
        "utf8"
      );

      await expect(readMigrationLineage(directory)).rejects.toThrow("MIGRATION_LINEAGE_JOURNAL_MISMATCH");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function createLineageDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "elevenhouse-migration-lineage-"));
  await mkdir(join(directory, "meta"));
  return directory;
}

async function writeGeneratedLineage(
  directory: string,
  tags: readonly string[],
  secondSnapshotParent?: string
): Promise<void> {
  await Promise.all(
    tags.map(async (tag, index) => {
      await writeFile(join(directory, `${tag}.sql`), `CREATE TABLE table_${index} (id uuid);\n`, "utf8");
      await writeFile(
        join(directory, "meta", `${tag.slice(0, 4)}_snapshot.json`),
        JSON.stringify({
          id: `snapshot-${index}`,
          prevId:
            index === 0
              ? "00000000-0000-0000-0000-000000000000"
              : (secondSnapshotParent ?? `snapshot-${index - 1}`),
          version: "7",
          dialect: "postgresql",
          tables: {}
        }),
        "utf8"
      );
    })
  );
  await writeFile(
    join(directory, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: tags.map((tag, index) => ({
        idx: index,
        version: "7",
        when: index + 1,
        tag,
        breakpoints: true
      }))
    }),
    "utf8"
  );
}
