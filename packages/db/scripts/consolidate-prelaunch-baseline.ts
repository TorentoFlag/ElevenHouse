import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { normalizeBaselineIndexOrder } from "./normalize-baseline-index-order";

const statementBreakpoint = "--> statement-breakpoint";
const zeroSnapshotId = "00000000-0000-0000-0000-000000000000";

type DrizzleSnapshot = {
  id: string;
  prevId: string;
  version: string;
  dialect: string;
  tables: Record<string, unknown>;
};

type PrelaunchMigrationChain = {
  readonly sqlPaths: readonly string[];
  readonly snapshotPaths: readonly string[];
};

/**
 * Pre-launch only: folds a freshly generated schema delta into the one resettable
 * baseline while preserving the explicitly managed integrity blocks at its end.
 *
 * This is deliberately not an ordinary migration tool. The caller must first
 * generate exactly `0001`, inspect it, and use it only under ADR 0012.
 */
export function mergePrelaunchBaselineSql(baselineSql: string, deltaSql: string): string {
  const normalizedDelta = normalizeDeltaStatementOrder(deltaSql);
  if (!/\b(?:CREATE|ALTER|DROP)\b/i.test(normalizedDelta)) {
    throw new Error("Cannot consolidate pre-launch baseline: generated delta has no schema DDL");
  }
  if (/^-- ElevenHouse .+ integrity objects: begin$/m.test(normalizedDelta)) {
    throw new Error("Cannot consolidate pre-launch baseline: generated delta owns an integrity block");
  }

  const integrityMarker = baselineSql.search(/^-- ElevenHouse .+ integrity objects: begin$/m);
  if (integrityMarker === -1) {
    throw new Error("Cannot consolidate pre-launch baseline: baseline has no managed integrity block");
  }
  /**
   * Drizzle emits all tables first, then foreign-key ALTERs. A generated pre-launch delta may
   * correct a column type on a table already present in the root baseline. It must run before
   * those existing FKs; appending it immediately before integrity SQL can make PostgreSQL try to
   * create an incompatible FK first. The complete delta still runs after all CREATE TABLE DDL.
   */
  const firstForeignKey = baselineSql.search(/^ALTER TABLE .+ ADD CONSTRAINT .+ FOREIGN KEY/m);
  const insertionBoundary = firstForeignKey === -1 ? integrityMarker : firstForeignKey;
  const insertionPoint = baselineSql.lastIndexOf(statementBreakpoint, insertionBoundary);
  if (insertionPoint === -1) {
    throw new Error("Cannot consolidate pre-launch baseline: integrity block is missing its statement boundary");
  }

  return `${baselineSql.slice(0, insertionPoint).trimEnd()}\n${statementBreakpoint}\n${normalizedDelta}\n${baselineSql.slice(insertionPoint)}`;
}

/**
 * Drizzle's generated delta can place a composite FK before the UNIQUE constraint it references.
 * That order works only if an older baseline already contains the supporting constraint; after
 * folding the delta into a fresh baseline it fails. Preserve every statement, but defer each FK
 * until all tables, column changes, unique constraints and indexes in that delta exist.
 */
function normalizeDeltaStatementOrder(deltaSql: string): string {
  const statements = deltaSql
    .split(statementBreakpoint)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  const foreignKeys: string[] = [];
  const prerequisites: string[] = [];
  for (const statement of statements) {
    if (/^ALTER\s+TABLE\s+.+?\s+ADD\s+CONSTRAINT\s+.+?\s+FOREIGN\s+KEY\b/is.test(statement)) {
      foreignKeys.push(statement);
    } else {
      prerequisites.push(statement);
    }
  }
  return [...prerequisites, ...foreignKeys].join(`\n${statementBreakpoint}\n`);
}

export function mergePrelaunchBaselineSnapshot(
  baselineSnapshotJson: string,
  deltaSnapshotJson: string
): string {
  const baseline = parseSnapshot(baselineSnapshotJson, "baseline");
  const delta = parseSnapshot(deltaSnapshotJson, "delta");

  if (baseline.prevId !== zeroSnapshotId) {
    throw new Error("Cannot consolidate pre-launch baseline: 0000 snapshot is not a root snapshot");
  }
  if (delta.prevId !== baseline.id || delta.version !== baseline.version || delta.dialect !== baseline.dialect) {
    throw new Error("Cannot consolidate pre-launch baseline: delta snapshot does not extend the current baseline");
  }
  if (JSON.stringify(delta.tables) === JSON.stringify(baseline.tables)) {
    throw new Error("Cannot consolidate pre-launch baseline: delta snapshot has no schema changes");
  }

  return `${JSON.stringify({ ...delta, id: baseline.id, prevId: zeroSnapshotId }, null, 2)}\n`;
}

/**
 * Pre-launch only: validates that every generated artifact is one contiguous
 * Drizzle chain from 0000, then removes that exact chain so Drizzle can
 * regenerate one complete root baseline. This is the safe answer when an
 * incremental delta drops/replaces a root constraint: SQL statement splicing
 * cannot preserve that transition in a fresh root installation.
 *
 * Unknown, skipped, or divergent artifacts are a hard stop rather than
 * collateral damage. The caller must immediately run the normal `db:generate`
 * pipeline, which rebuilds every schema object and reapplies the managed
 * augmenter blocks in dependency-safe order.
 */
export async function clearPrelaunchBaselineArtifacts(migrationDirectory: string): Promise<void> {
  const chain = await inspectPrelaunchMigrationChain(migrationDirectory);
  const metadataDirectory = join(migrationDirectory, "meta");

  await Promise.all([
    ...chain.sqlPaths.map((path) => rm(path, { force: true })),
    ...chain.snapshotPaths.map((path) => rm(path, { force: true }))
  ]);
  await writeFile(
    join(metadataDirectory, "_journal.json"),
    '{\n  "version": "7",\n  "dialect": "postgresql",\n  "entries": []\n}\n',
    "utf8"
  );
}

/**
 * Read-only gate for the destructive generated-artifact step above. The chain
 * is accepted only when SQL, snapshots and Drizzle journal agree on every
 * contiguous migration index and snapshot parent. It intentionally accepts no
 * unrecognised side artifacts: a one-time pre-launch rebuild must never delete
 * a hand-authored migration accidentally.
 */
export async function inspectPrelaunchMigrationChain(
  migrationDirectory: string
): Promise<PrelaunchMigrationChain> {
  const migrationEntries = (await readdir(migrationDirectory)).sort();
  const sqlFiles = migrationEntries.filter((entry) => entry.endsWith(".sql"));
  const unexpectedSqlFiles = sqlFiles.filter((entry) => !/^\d{4}_.+\.sql$/.test(entry));
  if (unexpectedSqlFiles.length > 0) {
    throw new Error(
      `Cannot clear pre-launch baseline: unexpected SQL migrations: ${unexpectedSqlFiles.join(", ")}`
    );
  }
  const sqlIndices = parseContiguousMigrationIndexes(sqlFiles, "SQL migrations");

  const metadataDirectory = join(migrationDirectory, "meta");
  const metadataFiles = (await readdir(metadataDirectory)).sort();
  const snapshotFiles = metadataFiles.filter((entry) => entry.endsWith("_snapshot.json"));
  const unexpectedMetadataFiles = metadataFiles.filter(
    (entry) => entry !== "_journal.json" && !/^\d{4}_snapshot\.json$/.test(entry)
  );
  if (unexpectedMetadataFiles.length > 0) {
    throw new Error(
      `Cannot clear pre-launch baseline: unexpected metadata artifacts: ${unexpectedMetadataFiles.join(", ")}`
    );
  }
  const snapshotIndices = parseContiguousMigrationIndexes(
    snapshotFiles.map((entry) => entry.replace(/_snapshot\.json$/, ".sql")),
    "snapshots"
  );
  if (snapshotIndices.join(",") !== sqlIndices.join(",")) {
    throw new Error("Cannot clear pre-launch baseline: SQL migrations and snapshots do not cover the same chain");
  }

  const journal = JSON.parse(await readFile(join(metadataDirectory, "_journal.json"), "utf8")) as {
    entries?: Array<{ idx?: number; tag?: string; version?: string; when?: number; breakpoints?: boolean }>;
  };
  if (!Array.isArray(journal.entries) || journal.entries.length !== sqlFiles.length) {
    throw new Error("Cannot clear pre-launch baseline: journal does not cover the exact generated chain");
  }
  const expectedTags = sqlFiles.map((file) => file.slice(0, -".sql".length));
  for (const [offset, entry] of journal.entries.entries()) {
    if (
      entry?.idx !== offset ||
      entry.tag !== expectedTags[offset] ||
      entry.version !== "7" ||
      !Number.isSafeInteger(entry.when) ||
      entry.breakpoints !== true
    ) {
      throw new Error("Cannot clear pre-launch baseline: journal is not an exact contiguous generated chain");
    }
  }

  const snapshots = await Promise.all(
    snapshotFiles.map(async (file) => parseSnapshot(await readFile(join(metadataDirectory, file), "utf8"), file))
  );
  const root = snapshots[0];
  if (root?.prevId !== zeroSnapshotId) {
    throw new Error("Cannot clear pre-launch baseline: 0000 snapshot is not a root snapshot");
  }
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1]!;
    const current = snapshots[index]!;
    if (
      current.prevId !== previous.id ||
      current.version !== root!.version ||
      current.dialect !== root!.dialect
    ) {
      throw new Error("Cannot clear pre-launch baseline: snapshots are not one contiguous Drizzle chain");
    }
  }

  return {
    sqlPaths: sqlFiles.map((file) => join(migrationDirectory, file)),
    snapshotPaths: snapshotFiles.map((file) => join(metadataDirectory, file))
  };
}

function parseContiguousMigrationIndexes(files: readonly string[], label: string): number[] {
  if (files.length === 0) {
    throw new Error(`Cannot clear pre-launch baseline: ${label} are empty`);
  }
  const indexes = files.map((file) => Number.parseInt(file.slice(0, 4), 10));
  for (const [offset, index] of indexes.entries()) {
    if (index !== offset) {
      throw new Error(`Cannot clear pre-launch baseline: ${label} are not contiguous from 0000`);
    }
  }
  return indexes;
}

async function findExactFile(directory: string, pattern: RegExp, label: string): Promise<string> {
  const matches = (await readdir(directory)).filter((entry) => pattern.test(entry)).sort();
  if (matches.length !== 1) {
    throw new Error(`Cannot consolidate pre-launch baseline: expected exactly one ${label}, found ${matches.length}`);
  }
  return join(directory, matches[0]!);
}

function parseSnapshot(source: string, label: string): DrizzleSnapshot {
  try {
    const parsed = JSON.parse(source) as Partial<DrizzleSnapshot>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.prevId !== "string" ||
      typeof parsed.version !== "string" ||
      typeof parsed.dialect !== "string" ||
      parsed.tables === null ||
      typeof parsed.tables !== "object"
    ) {
      throw new Error("unexpected shape");
    }
    return parsed as DrizzleSnapshot;
  } catch {
    throw new Error(`Cannot consolidate pre-launch baseline: invalid ${label} snapshot`);
  }
}

export async function consolidatePrelaunchBaseline(migrationDirectory: string): Promise<void> {
  const baselineSqlPath = await findExactFile(migrationDirectory, /^0000_.+\.sql$/, "0000 SQL baseline");
  const deltaSqlPath = await findExactFile(migrationDirectory, /^0001_.+\.sql$/, "0001 generated delta");
  const metadataDirectory = join(migrationDirectory, "meta");
  const baselineSnapshotPath = await findExactFile(metadataDirectory, /^0000(?:_.+)?_snapshot\.json$/, "0000 snapshot");
  const deltaSnapshotPath = await findExactFile(metadataDirectory, /^0001(?:_.+)?_snapshot\.json$/, "0001 snapshot");
  const journalPath = join(metadataDirectory, "_journal.json");

  const [baselineSql, deltaSql, baselineSnapshot, deltaSnapshot, journalSource] = await Promise.all([
    readFile(baselineSqlPath, "utf8"),
    readFile(deltaSqlPath, "utf8"),
    readFile(baselineSnapshotPath, "utf8"),
    readFile(deltaSnapshotPath, "utf8"),
    readFile(journalPath, "utf8")
  ]);
  const journal = JSON.parse(journalSource) as { entries?: Array<{ idx?: number; tag?: string }> };
  if (
    !Array.isArray(journal.entries) ||
    journal.entries.length !== 2 ||
    journal.entries[0]?.idx !== 0 ||
    !journal.entries[0].tag?.startsWith("0000_") ||
    journal.entries[1]?.idx !== 1 ||
    !journal.entries[1].tag?.startsWith("0001_")
  ) {
    throw new Error("Cannot consolidate pre-launch baseline: journal is not an exact 0000 → 0001 chain");
  }

  await writeFile(
    baselineSqlPath,
    normalizeBaselineIndexOrder(mergePrelaunchBaselineSql(baselineSql, deltaSql)),
    "utf8"
  );
  await writeFile(baselineSnapshotPath, mergePrelaunchBaselineSnapshot(baselineSnapshot, deltaSnapshot), "utf8");
  await writeFile(journalPath, `${JSON.stringify({ ...journal, entries: [journal.entries[0]] }, null, 2)}\n`, "utf8");
  await rm(deltaSqlPath);
  await rm(deltaSnapshotPath);
}

async function main(): Promise<void> {
  const migrationDirectory = join(__dirname, "../drizzle");
  if (process.argv.includes("--prepare-regeneration")) {
    await clearPrelaunchBaselineArtifacts(migrationDirectory);
    console.log(
      `Validated and cleared the exact pre-launch migration chain in ${migrationDirectory}; run pnpm db:generate next.`
    );
    return;
  }
  await consolidatePrelaunchBaseline(migrationDirectory);
  console.log(`Consolidated the inspected pre-launch delta into ${migrationDirectory}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
