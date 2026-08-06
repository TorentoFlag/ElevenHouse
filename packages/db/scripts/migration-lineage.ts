import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const rootSnapshotId = "00000000-0000-0000-0000-000000000000";

export type MigrationArtifact = {
  readonly index: number;
  readonly tag: string;
  readonly sqlPath: string;
  readonly snapshotPath: string;
  readonly snapshotId: string;
  readonly previousSnapshotId: string;
  readonly digest: string;
  readonly journalWhen: string;
};

export type MigrationManifest = ReadonlyMap<string, string>;

export type MigrationLineage = {
  readonly artifacts: readonly MigrationArtifact[];
  readonly manifest: MigrationManifest;
};

type DrizzleSnapshot = {
  readonly id: string;
  readonly prevId: string;
  readonly version: string;
  readonly dialect: string;
  readonly tables: Record<string, unknown>;
};

type DrizzleJournal = {
  readonly version: string;
  readonly dialect: string;
  readonly entries: readonly {
    readonly idx: number;
    readonly version: string;
    readonly when: number;
    readonly tag: string;
    readonly breakpoints: boolean;
  }[];
};

export async function readMigrationLineage(directory: string): Promise<MigrationLineage> {
  const sqlFiles = regularFiles(directory, /^\d{4}_.+\.sql$/);
  const metadataDirectory = join(directory, "meta");
  const snapshotFiles = regularFiles(metadataDirectory, /^\d{4}_snapshot\.json$/);
  const journal = parseJournal(readFileSync(join(metadataDirectory, "_journal.json"), "utf8"));

  assertContiguousIndexes(sqlFiles, "MIGRATION_LINEAGE_INDEX_GAP");
  assertContiguousIndexes(snapshotFiles, "MIGRATION_LINEAGE_INDEX_GAP");
  if (sqlFiles.length !== snapshotFiles.length || sqlFiles.length !== journal.entries.length) {
    throw new Error("MIGRATION_LINEAGE_JOURNAL_MISMATCH");
  }

  const artifacts: MigrationArtifact[] = [];
  for (const [index, sqlFile] of sqlFiles.entries()) {
    const snapshotFile = snapshotFiles[index];
    const entry = journal.entries[index];
    const tag = sqlFile.slice(0, -".sql".length);
    if (!snapshotFile || !entry || snapshotFile.slice(0, 4) !== sqlFile.slice(0, 4) || entry.idx !== index || entry.tag !== tag) {
      throw new Error("MIGRATION_LINEAGE_JOURNAL_MISMATCH");
    }
    if (entry.version !== "7" || !Number.isSafeInteger(entry.when) || entry.breakpoints !== true) {
      throw new Error("MIGRATION_LINEAGE_JOURNAL_MISMATCH");
    }
    const snapshotPath = join(metadataDirectory, snapshotFile);
    const snapshot = parseSnapshot(readFileSync(snapshotPath, "utf8"));
    const previousSnapshotId = index === 0 ? rootSnapshotId : artifacts[index - 1]!.snapshotId;
    if (snapshot.prevId !== previousSnapshotId) {
      throw new Error("MIGRATION_LINEAGE_SNAPSHOT_PARENT");
    }
    const sqlPath = join(directory, sqlFile);
    artifacts.push({
      index,
      tag,
      sqlPath,
      snapshotPath,
      snapshotId: snapshot.id,
      previousSnapshotId: snapshot.prevId,
      digest: sha256(readFileSync(sqlPath)),
      journalWhen: String(entry.when)
    });
  }

  return {
    artifacts,
    manifest: new Map(artifacts.map((artifact) => [artifact.sqlPath, artifact.digest]))
  };
}

export function assertLineageMatchesManifest(
  lineage: MigrationLineage,
  manifest: MigrationManifest
): void {
  for (const artifact of lineage.artifacts) {
    if (manifest.get(artifact.sqlPath) !== sha256(readFileSync(artifact.sqlPath))) {
      throw new Error("MIGRATION_LINEAGE_ARTIFACT_CHANGED");
    }
  }
}

export function assertLinearLineage(lineage: MigrationLineage): void {
  if (lineage.artifacts.length === 0) throw new Error("MIGRATION_LINEAGE_INDEX_GAP");
  for (const [index, artifact] of lineage.artifacts.entries()) {
    const previousSnapshotId = index === 0 ? rootSnapshotId : lineage.artifacts[index - 1]!.snapshotId;
    if (artifact.index !== index || artifact.previousSnapshotId !== previousSnapshotId) {
      throw new Error("MIGRATION_LINEAGE_SNAPSHOT_PARENT");
    }
  }
}

function regularFiles(directory: string, pattern: RegExp): string[] {
  return readdirSync(directory)
    .filter((entry) => pattern.test(entry) && statSync(join(directory, entry)).isFile())
    .sort();
}

function assertContiguousIndexes(files: readonly string[], errorCode: string): void {
  if (files.length === 0) throw new Error(errorCode);
  for (const [offset, file] of files.entries()) {
    if (Number.parseInt(file.slice(0, 4), 10) !== offset) throw new Error(errorCode);
  }
}

function parseJournal(source: string): DrizzleJournal {
  const journal = JSON.parse(source) as Partial<DrizzleJournal>;
  if (journal.version !== "7" || journal.dialect !== "postgresql" || !Array.isArray(journal.entries)) {
    throw new Error("MIGRATION_LINEAGE_JOURNAL_MISMATCH");
  }
  return journal as DrizzleJournal;
}

function parseSnapshot(source: string): DrizzleSnapshot {
  const snapshot = JSON.parse(source) as Partial<DrizzleSnapshot>;
  if (
    typeof snapshot.id !== "string" ||
    typeof snapshot.prevId !== "string" ||
    snapshot.version !== "7" ||
    snapshot.dialect !== "postgresql" ||
    snapshot.tables === null ||
    typeof snapshot.tables !== "object"
  ) {
    throw new Error("MIGRATION_LINEAGE_SNAPSHOT_INVALID");
  }
  return snapshot as DrizzleSnapshot;
}

function sha256(source: Buffer): string {
  return createHash("sha256").update(source).digest("hex");
}
