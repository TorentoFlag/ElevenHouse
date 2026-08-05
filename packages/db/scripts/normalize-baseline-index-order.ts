import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const statementBreakpoint = "--> statement-breakpoint";

type IndexedStatement = {
  readonly sourceIndex: number;
  readonly statement: string;
};

type AddedColumn = IndexedStatement & {
  readonly tableName: string;
  readonly columnName: string;
};

/**
 * `drizzle-kit generate` can emit foreign keys before standalone unique keys.
 * PostgreSQL requires a referenced compound key to exist when an FK is added,
 * therefore a single fresh baseline must place those keys before FK DDL.
 */
export function normalizeBaselineIndexOrder(source: string): string {
  const statements = source
    .split(statementBreakpoint)
    .map((statement, sourceIndex): IndexedStatement => ({ sourceIndex, statement }));
  const uniqueKeyStatements = statements.filter(({ statement }) =>
    /^\s*CREATE UNIQUE INDEX\b/i.test(statement) ||
    /^\s*ALTER TABLE\b[\s\S]*?\bADD CONSTRAINT\b[\s\S]*?\bUNIQUE\s*\(/i.test(statement)
  );
  if (uniqueKeyStatements.length === 0) {
    throw new Error("Cannot normalize baseline: no standalone unique keys found");
  }

  const recreatedUniqueKeySourceIndexes = terminalRecreatedUniqueKeySourceIndexes(
    uniqueKeyStatements,
    statements
  );
  const movableUniqueKeyStatements = uniqueKeyStatements.filter(
    (statement) => !recreatedUniqueKeySourceIndexes.has(statement.sourceIndex)
  );
  const addedColumns = statements
    .map(parseAddedColumn)
    .filter((column): column is AddedColumn => column !== null);
  const addedColumnDependencies = new Map<number, readonly AddedColumn[]>();
  for (const uniqueKeyStatement of movableUniqueKeyStatements) {
    const tableName = parseUniqueKeyTable(uniqueKeyStatement.statement);
    const dependencies = tableName
      ? addedColumns.filter(
          (column) =>
            column.tableName === tableName &&
            uniqueKeyStatement.statement.includes(`"${column.columnName}"`)
        )
      : [];
    addedColumnDependencies.set(uniqueKeyStatement.sourceIndex, dependencies);
  }

  const uniqueKeySourceIndexes = new Set(
    movableUniqueKeyStatements.map((statement) => statement.sourceIndex)
  );
  const withoutUniqueKeys = statements.filter(
    (statement) => !uniqueKeySourceIndexes.has(statement.sourceIndex)
  );
  const firstForeignKey = withoutUniqueKeys.findIndex(({ statement }) =>
    /^\s*ALTER TABLE\b/i.test(statement)
  );
  if (firstForeignKey === -1) {
    throw new Error("Cannot normalize baseline: no foreign-key statements found");
  }

  const beforeForeignKeys = withoutUniqueKeys.slice(0, firstForeignKey);
  const afterForeignKeys = withoutUniqueKeys.slice(firstForeignKey);
  const tablesAppendedAfterForeignKeys = afterForeignKeys.filter(({ statement }) =>
    /^\s*CREATE TABLE\b/i.test(statement)
  );
  const remainingAfterForeignKeys = afterForeignKeys.filter(
    ({ statement }) => !/^\s*CREATE TABLE\b/i.test(statement)
  );
  const earlyUniqueKeys = movableUniqueKeyStatements.filter(
    (statement) => addedColumnDependencies.get(statement.sourceIndex)?.length === 0
  );
  const deferredKeysByPrerequisite = new Map<number, IndexedStatement[]>();
  for (const uniqueKeyStatement of movableUniqueKeyStatements) {
    const dependencies = addedColumnDependencies.get(uniqueKeyStatement.sourceIndex) ?? [];
    if (dependencies.length === 0) continue;
    const prerequisite = dependencies.reduce((latest, candidate) =>
      candidate.sourceIndex > latest.sourceIndex ? candidate : latest
    );
    const deferred = deferredKeysByPrerequisite.get(prerequisite.sourceIndex) ?? [];
    deferred.push(uniqueKeyStatement);
    deferredKeysByPrerequisite.set(prerequisite.sourceIndex, deferred);
  }

  const orderedStatements = [
    ...beforeForeignKeys,
    // A consolidated pre-launch delta can append new tables after the original
    // baseline's FK boundary. Move those table declarations ahead of every
    // unique index; PostgreSQL otherwise rejects `CREATE INDEX ... ON table`
    // before the appended table exists.
    ...tablesAppendedAfterForeignKeys,
    ...earlyUniqueKeys,
    ...remainingAfterForeignKeys
  ];
  const normalizedStatements = orderedStatements.flatMap((statement) => [
    statement,
    ...(deferredKeysByPrerequisite.get(statement.sourceIndex) ?? [])
  ]);

  return placeRecreatedUniqueKeysAfterDrops(
    normalizedStatements,
    recreatedUniqueKeySourceIndexes
  )
    .map(({ statement }) => statement)
    .join(statementBreakpoint);
}

function parseUniqueKeyTable(statement: string): string | null {
  const indexTable = statement.match(
    /^\s*CREATE UNIQUE INDEX\b[\s\S]*?\bON\s+(?:(?:"public"|public)\.)?"([^"]+)"/i
  )?.[1];
  if (indexTable) return indexTable;
  return (
    statement.match(
      /^\s*ALTER TABLE\s+(?:(?:"public"|public)\.)?"([^"]+)"\s+ADD CONSTRAINT\b[\s\S]*?\bUNIQUE\s*\(/i
    )?.[1] ?? null
  );
}

/**
 * A consolidated baseline may contain the original index and its final replacement from a delta.
 * The original stays eligible for FK hoisting; the terminal replacement must stay after the
 * explicit DROP, even if an earlier normalizer run had already moved it out of position.
 */
function terminalRecreatedUniqueKeySourceIndexes(
  uniqueKeys: readonly IndexedStatement[],
  all: readonly IndexedStatement[]
): ReadonlySet<number> {
  const terminal = new Set<number>();
  for (const candidate of uniqueKeys) {
    const name = parseUniqueKeyName(candidate.statement);
    if (!name || !hasDropForUniqueKey(name, all)) continue;
    const sameName = uniqueKeys.filter((statement) => parseUniqueKeyName(statement.statement) === name);
    const latest = sameName.reduce((current, statement) =>
      statement.sourceIndex > current.sourceIndex ? statement : current
    );
    if (candidate.sourceIndex === latest.sourceIndex) terminal.add(candidate.sourceIndex);
  }
  return terminal;
}

function placeRecreatedUniqueKeysAfterDrops(
  source: readonly IndexedStatement[],
  recreatedSourceIndexes: ReadonlySet<number>
): IndexedStatement[] {
  const ordered = [...source];
  for (const sourceIndex of recreatedSourceIndexes) {
    const statementIndex = ordered.findIndex((statement) => statement.sourceIndex === sourceIndex);
    if (statementIndex === -1) continue;
    const [statement] = ordered.splice(statementIndex, 1);
    if (!statement) continue;
    const name = parseUniqueKeyName(statement.statement);
    if (!name) continue;
    let dropIndex = -1;
    for (let index = 0; index < ordered.length; index += 1) {
      if (isDropForUniqueKey(ordered[index]!.statement, name)) dropIndex = index;
    }
    if (dropIndex === -1) {
      ordered.push(statement);
    } else {
      ordered.splice(dropIndex + 1, 0, statement);
    }
  }
  return ordered;
}

function hasDropForUniqueKey(name: string, statements: readonly IndexedStatement[]): boolean {
  return statements.some((statement) => isDropForUniqueKey(statement.statement, name));
}

function isDropForUniqueKey(statement: string, name: string): boolean {
  return new RegExp(`^\\s*DROP INDEX\\s+(?:IF EXISTS\\s+)?"${escapeRegExp(name)}"\\s*;?\\s*$`, "i").test(
    statement.trim()
  );
}

function parseUniqueKeyName(statement: string): string | null {
  return (
    statement.match(/^\s*CREATE UNIQUE INDEX\s+"([^"]+)"/i)?.[1] ??
    statement.match(/^\s*ALTER TABLE\s+.+?\s+ADD CONSTRAINT\s+"([^"]+)"\s+UNIQUE\s*\(/i)?.[1] ??
    null
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAddedColumn(statement: IndexedStatement): AddedColumn | null {
  const match = statement.statement.match(
    /^\s*ALTER TABLE\s+(?:(?:"public"|public)\.)?"([^"]+)"\s+ADD COLUMN\s+"([^"]+)"/i
  );
  if (!match?.[1] || !match[2]) return null;
  return {
    ...statement,
    tableName: match[1],
    columnName: match[2]
  };
}

export async function normalizeBaselineIndexOrderFile(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  const normalized = normalizeBaselineIndexOrder(source);
  if (normalized !== source) await writeFile(migrationPath, normalized, "utf8");
}

async function findCurrentBaseline(): Promise<string> {
  const migrationDirectory = join(__dirname, "../drizzle");
  const baselines = (await readdir(migrationDirectory))
    .filter((entry) => /^0000_.+\.sql$/.test(entry))
    .sort();
  if (baselines.length !== 1) {
    throw new Error(`Expected exactly one generated 0000 baseline, found ${baselines.length}`);
  }
  return join(migrationDirectory, baselines[0]!);
}

async function main(): Promise<void> {
  const migrationPath = await findCurrentBaseline();
  await normalizeBaselineIndexOrderFile(migrationPath);
  console.log(`Baseline unique-index ordering verified in ${migrationPath}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
