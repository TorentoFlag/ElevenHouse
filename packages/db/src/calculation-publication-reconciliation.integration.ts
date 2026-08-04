import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertCalculationPublicationBindings,
  reconcileCalculationPublicationBindingsIfPrerequisitesExist
} from "../scripts/calculation-publication-reconciliation";

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

const ownerId = "11000000-0000-4000-8000-000000000001";
const clientId = "12000000-0000-4000-8000-000000000001";
const privateCalculationId = "13000000-0000-4000-8000-000000000001";
const visibleCalculationId = "13000000-0000-4000-8000-000000000002";
const olderInterpretationId = "14000000-0000-4000-8000-000000000001";
const newerInterpretationId = "14000000-0000-4000-8000-000000000002";
const draftInterpretationId = "14000000-0000-4000-8000-000000000003";
const resultChecksum = `sha256:${"a".repeat(64)}`;

describeWithDatabase("calculation publication production reconciliation", () => {
  const databaseName = `elevenhouse_publication_${randomUUID().replaceAll("-", "")}`;
  let adminClient: Client;
  let databaseClient: Client;

  beforeAll(async () => {
    const sourceUrl = new URL(integrationDatabaseUrl!);
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = "/postgres";
    const databaseUrl = new URL(sourceUrl);
    databaseUrl.pathname = `/${databaseName}`;

    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE ${databaseName}`);

    databaseClient = new Client({ connectionString: databaseUrl.toString() });
    await databaseClient.connect();
  }, 30_000);

  beforeEach(async () => {
    await databaseClient.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  });

  afterAll(async () => {
    await databaseClient?.end();
    if (adminClient) {
      await adminClient.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await adminClient.end();
    }
  });

  it("adds the current catalog, preserves private legacy charts, and deterministically binds visible results", async () => {
    await installPredecessorSchema(databaseClient);
    await installPublicationFixture(databaseClient, { visibleModule: "numerology" });

    await databaseClient.query("BEGIN");
    await reconcileCalculationPublicationBindingsIfPrerequisitesExist(databaseClient);
    await databaseClient.query("COMMIT");

    const state = await readPublicationState(databaseClient);
    expect(state.links).toEqual([
      {
        calculation_id: privateCalculationId,
        visibility: "private_to_astrologer",
        published_at: null,
        published_interpretation_id: null,
        published_result_checksum: null
      },
      {
        calculation_id: visibleCalculationId,
        visibility: "visible_to_client",
        published_at: "2026-08-03 10:00:00+00",
        published_interpretation_id: newerInterpretationId,
        published_result_checksum: resultChecksum
      }
    ]);
    expect(state.privateInterpretationMode).toBeNull();
    expect(state.catalog).toEqual({
      interpretationModeColumns: "1",
      publicationColumns: "2",
      publicationConstraints: "5",
      publicationIndexes: "1"
    });

    const beforeRerun = await readPublicationState(databaseClient);
    await databaseClient.query("BEGIN");
    await reconcileCalculationPublicationBindingsIfPrerequisitesExist(databaseClient);
    await databaseClient.query("COMMIT");
    await expect(readPublicationState(databaseClient)).resolves.toEqual(beforeRerun);
  });

  it("accepts a visible natal chart only when the predecessor persisted adult_natal", async () => {
    await installPredecessorSchema(databaseClient, { interpretationModeColumn: true });
    await installPublicationFixture(databaseClient, {
      visibleModule: "chart",
      visibleInterpretationMode: "adult_natal"
    });

    await databaseClient.query("BEGIN");
    await reconcileCalculationPublicationBindingsIfPrerequisitesExist(databaseClient);
    await databaseClient.query("COMMIT");

    const visible = (await readPublicationState(databaseClient)).links[1];
    expect(visible).toMatchObject({
      published_interpretation_id: newerInterpretationId,
      published_result_checksum: resultChecksum
    });
    await expect(assertCalculationPublicationBindings(databaseClient)).resolves.toBeUndefined();
  });

  it.each([
    ["missing", null],
    ["child", "child"],
    ["legacy", "legacy_unclassified"]
  ])("rolls back a visible natal chart with %s interpretation authority", async (_label, mode) => {
    await installPredecessorSchema(databaseClient, { interpretationModeColumn: mode !== null });
    await installPublicationFixture(databaseClient, {
      visibleModule: "chart",
      visibleInterpretationMode: mode
    });

    await databaseClient.query("BEGIN");
    await expect(
      reconcileCalculationPublicationBindingsIfPrerequisitesExist(databaseClient)
    ).rejects.toThrow(/adult_natal/);
    await databaseClient.query("ROLLBACK");

    await expect(readColumnCount(databaseClient, "published_interpretation_id")).resolves.toBe("0");
  });

  it("rolls back when a visible calculation has no approved interpretation", async () => {
    await installPredecessorSchema(databaseClient);
    await installPublicationFixture(databaseClient, {
      visibleModule: "numerology",
      omitApprovedInterpretations: true
    });

    await databaseClient.query("BEGIN");
    await expect(
      reconcileCalculationPublicationBindingsIfPrerequisitesExist(databaseClient)
    ).rejects.toThrow(/approved interpretation/);
    await databaseClient.query("ROLLBACK");

    await expect(readColumnCount(databaseClient, "published_result_checksum")).resolves.toBe("0");
  });

  it("rejects a partial catalog without mutating it", async () => {
    await installPredecessorSchema(databaseClient);
    await databaseClient.query(
      "ALTER TABLE calculation_client_links ADD COLUMN published_result_checksum text"
    );

    await databaseClient.query("BEGIN");
    await expect(
      reconcileCalculationPublicationBindingsIfPrerequisitesExist(databaseClient)
    ).rejects.toThrow(/partial or drifted/);
    await databaseClient.query("ROLLBACK");

    await expect(readColumnCount(databaseClient, "published_result_checksum")).resolves.toBe("1");
    await expect(readColumnCount(databaseClient, "published_interpretation_id")).resolves.toBe("0");
  });

  it("detects a current visible binding whose checksum no longer matches the result", async () => {
    await installPredecessorSchema(databaseClient);
    await installPublicationFixture(databaseClient, { visibleModule: "numerology" });
    await databaseClient.query("BEGIN");
    await reconcileCalculationPublicationBindingsIfPrerequisitesExist(databaseClient);
    await databaseClient.query("COMMIT");

    await databaseClient.query(
      "UPDATE calculation_client_links SET published_result_checksum = $1 WHERE visibility = 'visible_to_client'",
      [`sha256:${"b".repeat(64)}`]
    );

    await expect(assertCalculationPublicationBindings(databaseClient)).rejects.toThrow(
      /published result checksum/
    );
  });
});

async function installPredecessorSchema(
  client: Client,
  options: { readonly interpretationModeColumn?: boolean } = {}
): Promise<void> {
  await client.query(`
    CREATE TABLE calculation_records (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL,
      module text NOT NULL,
      mode text NOT NULL,
      ${options.interpretationModeColumn ? "interpretation_mode text," : ""}
      method_code text NOT NULL,
      result_checksum text NOT NULL
    );

    CREATE TABLE calculation_interpretations (
      id uuid PRIMARY KEY,
      calculation_id uuid NOT NULL REFERENCES calculation_records(id) ON DELETE CASCADE,
      status text NOT NULL,
      approved_at timestamptz,
      updated_at timestamptz NOT NULL
    );

    CREATE TABLE calculation_client_links (
      id uuid PRIMARY KEY,
      calculation_id uuid NOT NULL REFERENCES calculation_records(id) ON DELETE CASCADE,
      client_id uuid NOT NULL,
      visibility text NOT NULL DEFAULT 'private_to_astrologer',
      linked_at timestamptz NOT NULL,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT calculation_client_links_visibility_check
        CHECK (visibility IN ('private_to_astrologer', 'visible_to_client')),
      CONSTRAINT calculation_client_links_published_at_check
        CHECK (visibility <> 'visible_to_client' OR published_at IS NOT NULL)
    );
    CREATE UNIQUE INDEX calculation_client_links_record_client_unique
      ON calculation_client_links (calculation_id, client_id);
  `);
  if (options.interpretationModeColumn) {
    await client.query(`
      ALTER TABLE calculation_records
        ADD CONSTRAINT calculation_records_interpretation_mode_check CHECK (
          interpretation_mode IS NULL OR (
            module = 'chart'
            AND method_code = 'natal'
            AND interpretation_mode IN ('adult_natal', 'child', 'legacy_unclassified')
          )
        )
    `);
  }
}

async function installPublicationFixture(
  client: Client,
  options: {
    readonly visibleModule: "chart" | "numerology";
    readonly visibleInterpretationMode?: string | null;
    readonly omitApprovedInterpretations?: boolean;
  }
): Promise<void> {
  const hasInterpretationMode = (await readColumnCount(client, "interpretation_mode")) === "1";
  const columns = hasInterpretationMode
    ? "id, owner_user_id, module, mode, interpretation_mode, method_code, result_checksum"
    : "id, owner_user_id, module, mode, method_code, result_checksum";
  const privateValues = hasInterpretationMode
    ? `('${privateCalculationId}', '${ownerId}', 'chart', 'individual', NULL, 'natal', '${resultChecksum}')`
    : `('${privateCalculationId}', '${ownerId}', 'chart', 'individual', 'natal', '${resultChecksum}')`;
  const visibleValues = hasInterpretationMode
    ? `('${visibleCalculationId}', '${ownerId}', '${options.visibleModule}', 'individual', ${sqlLiteral(
        options.visibleInterpretationMode ?? null
      )}, '${options.visibleModule === "chart" ? "natal" : "pythagorean"}', '${resultChecksum}')`
    : `('${visibleCalculationId}', '${ownerId}', '${options.visibleModule}', 'individual', '${
        options.visibleModule === "chart" ? "natal" : "pythagorean"
      }', '${resultChecksum}')`;
  await client.query(
    `INSERT INTO calculation_records (${columns}) VALUES ${privateValues}, ${visibleValues}`
  );

  await client.query(`
    INSERT INTO calculation_client_links (
      id, calculation_id, client_id, visibility, linked_at, published_at
    ) VALUES
      ('15000000-0000-4000-8000-000000000001', '${privateCalculationId}', '${clientId}',
       'private_to_astrologer', '2026-08-03T09:00:00.000Z', '2026-08-03T09:30:00.000Z'),
      ('15000000-0000-4000-8000-000000000002', '${visibleCalculationId}', '${clientId}',
       'visible_to_client', '2026-08-03T09:00:00.000Z', '2026-08-03T10:00:00.000Z');

    INSERT INTO calculation_interpretations (
      id, calculation_id, status, approved_at, updated_at
    ) VALUES
      ('${draftInterpretationId}', '${visibleCalculationId}', 'draft', NULL,
       '2026-08-03T12:00:00.000Z')
  `);
  if (!options.omitApprovedInterpretations) {
    await client.query(`
      INSERT INTO calculation_interpretations (
        id, calculation_id, status, approved_at, updated_at
      ) VALUES
        ('${olderInterpretationId}', '${visibleCalculationId}', 'approved',
         '2026-08-03T10:10:00.000Z', '2026-08-03T11:00:00.000Z'),
        ('${newerInterpretationId}', '${visibleCalculationId}', 'approved',
         '2026-08-03T10:20:00.000Z', '2026-08-03T10:30:00.000Z')
    `);
  }
}

async function readColumnCount(client: Client, columnName: string): Promise<string> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('calculation_records', 'calculation_client_links')
        AND column_name = $1`,
    [columnName]
  );
  return result.rows[0]?.count ?? "0";
}

async function readPublicationState(client: Client): Promise<{
  readonly links: readonly Record<string, unknown>[];
  readonly privateInterpretationMode: string | null;
  readonly catalog: Record<string, string>;
}> {
  const links = await client.query<Record<string, unknown>>(`
    SELECT calculation_id::text, visibility, published_at::text,
           published_interpretation_id::text, published_result_checksum
      FROM calculation_client_links
     ORDER BY calculation_id
  `);
  const mode = await client.query<{ interpretation_mode: string | null }>(`
    SELECT interpretation_mode
      FROM calculation_records
     WHERE id = '${privateCalculationId}'
  `);
  const catalog = await client.query<Record<string, string>>(`
    SELECT
      (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calculation_records'
          AND column_name = 'interpretation_mode') AS "interpretationModeColumns",
      (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calculation_client_links'
          AND column_name IN ('published_interpretation_id', 'published_result_checksum'))
        AS "publicationColumns",
      (SELECT count(*)::text FROM pg_constraint
        WHERE conname IN (
          'calculation_records_interpretation_mode_check',
          'calculation_interpretations_id_record_unique',
          'calculation_client_links_published_result_checksum_check',
          'calculation_client_links_publication_binding_check',
          'calculation_client_links_published_interpretation_fk'
        )) AS "publicationConstraints",
      (SELECT count(*)::text FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'calculation_client_links_published_interpretation_idx')
        AS "publicationIndexes"
  `);
  return {
    links: links.rows,
    privateInterpretationMode: mode.rows[0]?.interpretation_mode ?? null,
    catalog: catalog.rows[0] ?? {}
  };
}

function sqlLiteral(value: string | null): string {
  return value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}
