import type { Client } from "pg";

type PrerequisiteState = "absent" | "current";
type CatalogState = "absent" | "current" | "drifted";

type ColumnCatalogRow = {
  readonly table_name: string;
  readonly column_name: string;
  readonly data_type: string;
  readonly udt_name: string;
  readonly is_nullable: string;
  readonly column_default: string | null;
};

type ConstraintCatalogRow = {
  readonly table_name: string;
  readonly constraint_name: string;
  readonly constraint_type: string;
  readonly validated: boolean;
  readonly referenced_table: string | null;
  readonly definition: string;
};

type IndexCatalogRow = {
  readonly table_name: string;
  readonly index_name: string;
  readonly valid: boolean;
  readonly ready: boolean;
  readonly definition: string;
};

type PublicationCatalog = {
  readonly columns: readonly ColumnCatalogRow[];
  readonly constraints: readonly ConstraintCatalogRow[];
  readonly indexes: readonly IndexCatalogRow[];
};

const interpretationModeColumn = {
  table_name: "calculation_records",
  column_name: "interpretation_mode",
  data_type: "text",
  udt_name: "text",
  is_nullable: "YES",
  column_default: null
} as const;

const publicationColumns = [
  {
    table_name: "calculation_client_links",
    column_name: "published_interpretation_id",
    data_type: "uuid",
    udt_name: "uuid",
    is_nullable: "YES",
    column_default: null
  },
  {
    table_name: "calculation_client_links",
    column_name: "published_result_checksum",
    data_type: "text",
    udt_name: "text",
    is_nullable: "YES",
    column_default: null
  }
] as const satisfies readonly ColumnCatalogRow[];

const interpretationModeConstraint = {
  table_name: "calculation_records",
  constraint_name: "calculation_records_interpretation_mode_check",
  constraint_type: "c",
  validated: true,
  referenced_table: null,
  definition:
    "CHECK (((interpretation_mode IS NULL) OR ((module = 'chart'::text) AND (method_code = 'natal'::text) AND (interpretation_mode = ANY (ARRAY['adult_natal'::text, 'child'::text, 'legacy_unclassified'::text])))))"
} as const satisfies ConstraintCatalogRow;

const publicationConstraints = [
  {
    table_name: "calculation_client_links",
    constraint_name: "calculation_client_links_publication_binding_check",
    constraint_type: "c",
    validated: true,
    referenced_table: null,
    definition:
      "CHECK ((((visibility = 'private_to_astrologer'::text) AND (published_at IS NULL) AND (published_interpretation_id IS NULL) AND (published_result_checksum IS NULL)) OR ((visibility = 'visible_to_client'::text) AND (published_at IS NOT NULL) AND (published_interpretation_id IS NOT NULL) AND (published_result_checksum IS NOT NULL))))"
  },
  {
    table_name: "calculation_client_links",
    constraint_name: "calculation_client_links_published_interpretation_fk",
    constraint_type: "f",
    validated: true,
    referenced_table: "calculation_interpretations",
    definition:
      "FOREIGN KEY (published_interpretation_id, calculation_id) REFERENCES calculation_interpretations(id, calculation_id) ON DELETE RESTRICT"
  },
  {
    table_name: "calculation_client_links",
    constraint_name: "calculation_client_links_published_result_checksum_check",
    constraint_type: "c",
    validated: true,
    referenced_table: null,
    definition:
      "CHECK (((published_result_checksum IS NULL) OR (published_result_checksum ~ '^sha256:[a-f0-9]{64}$'::text)))"
  },
  {
    table_name: "calculation_interpretations",
    constraint_name: "calculation_interpretations_id_record_unique",
    constraint_type: "u",
    validated: true,
    referenced_table: null,
    definition: "UNIQUE (id, calculation_id)"
  }
] as const satisfies readonly ConstraintCatalogRow[];

const publicationIndexes = [
  {
    table_name: "calculation_client_links",
    index_name: "calculation_client_links_published_interpretation_idx",
    valid: true,
    ready: true,
    definition:
      "CREATE INDEX calculation_client_links_published_interpretation_idx ON public.calculation_client_links USING btree (published_interpretation_id, calculation_id)"
  }
] as const satisfies readonly IndexCatalogRow[];

export async function reconcileCalculationPublicationBindingsIfPrerequisitesExist(
  client: Client
): Promise<void> {
  if ((await readPrerequisiteState(client)) === "absent") return;

  const initialCatalog = await readPublicationCatalog(client);
  const interpretationState = classifyInterpretationModeCatalog(initialCatalog);
  const publicationState = classifyPublicationCatalog(initialCatalog);
  if (interpretationState === "drifted" || publicationState === "drifted") {
    throw new Error(
      `Refusing to reconcile a partial or drifted calculation publication catalog: ${formatCatalog(
        initialCatalog
      )}`
    );
  }

  if (interpretationState === "current" && publicationState === "current") {
    await assertCalculationPublicationData(client);
    return;
  }

  await client.query(
    "LOCK TABLE calculation_records, calculation_interpretations, calculation_client_links IN ACCESS EXCLUSIVE MODE"
  );
  const lockedCatalog = await readPublicationCatalog(client);
  if (
    classifyInterpretationModeCatalog(lockedCatalog) !== interpretationState ||
    classifyPublicationCatalog(lockedCatalog) !== publicationState
  ) {
    throw new Error(
      `Calculation publication catalog changed before reconciliation: ${formatCatalog(lockedCatalog)}`
    );
  }

  if (interpretationState === "absent") {
    await installInterpretationModeCatalog(client);
  }
  if (publicationState === "absent") {
    await installPublicationBindingCatalog(client);
  }
  await assertCalculationPublicationBindings(client);
}

export async function assertCalculationPublicationBindings(client: Client): Promise<void> {
  if ((await readPrerequisiteState(client)) === "absent") return;
  const catalog = await readPublicationCatalog(client);
  if (
    classifyInterpretationModeCatalog(catalog) !== "current" ||
    classifyPublicationCatalog(catalog) !== "current"
  ) {
    throw new Error(`Current calculation publication catalog drifted: ${formatCatalog(catalog)}`);
  }
  await assertCalculationPublicationData(client);
}

async function readPrerequisiteState(client: Client): Promise<PrerequisiteState> {
  const result = await client.query<{
    calculation_records: string | null;
    calculation_interpretations: string | null;
    calculation_client_links: string | null;
  }>(`
    SELECT
      to_regclass('public.calculation_records')::text AS calculation_records,
      to_regclass('public.calculation_interpretations')::text AS calculation_interpretations,
      to_regclass('public.calculation_client_links')::text AS calculation_client_links
  `);
  const row = result.rows[0];
  const relations = [
    row?.calculation_records,
    row?.calculation_interpretations,
    row?.calculation_client_links
  ];
  if (relations.every((relation) => relation === null)) return "absent";
  if (
    relations[0] === "calculation_records" &&
    relations[1] === "calculation_interpretations" &&
    relations[2] === "calculation_client_links"
  ) {
    return "current";
  }
  throw new Error(
    `Refusing to reconcile calculation publications with partial prerequisites: ${JSON.stringify(
      relations
    )}`
  );
}

async function readPublicationCatalog(client: Client): Promise<PublicationCatalog> {
  const columns = await client.query<ColumnCatalogRow>(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (
         (table_name = 'calculation_records' AND column_name = 'interpretation_mode')
         OR (
           table_name = 'calculation_client_links'
           AND column_name IN ('published_interpretation_id', 'published_result_checksum')
         )
       )
     ORDER BY table_name, column_name
  `);
  const constraints = await client.query<ConstraintCatalogRow>(`
    SELECT
      relation.relname AS table_name,
      constraint_record.conname AS constraint_name,
      constraint_record.contype::text AS constraint_type,
      constraint_record.convalidated AS validated,
      referenced_relation.relname AS referenced_table,
      pg_get_constraintdef(constraint_record.oid, false) AS definition
    FROM pg_constraint AS constraint_record
    JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_class AS referenced_relation
      ON referenced_relation.oid = constraint_record.confrelid
    WHERE namespace.nspname = 'public'
      AND constraint_record.conname IN (
        'calculation_records_interpretation_mode_check',
        'calculation_interpretations_id_record_unique',
        'calculation_client_links_published_result_checksum_check',
        'calculation_client_links_publication_binding_check',
        'calculation_client_links_published_interpretation_fk'
      )
    ORDER BY relation.relname, constraint_record.conname
  `);
  const indexes = await client.query<IndexCatalogRow>(`
    SELECT
      relation.relname AS table_name,
      index_relation.relname AS index_name,
      index_record.indisvalid AS valid,
      index_record.indisready AS ready,
      pg_get_indexdef(index_relation.oid, 0, false) AS definition
    FROM pg_index AS index_record
    JOIN pg_class AS relation ON relation.oid = index_record.indrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = 'calculation_client_links_published_interpretation_idx'
    ORDER BY relation.relname, index_relation.relname
  `);
  return { columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows };
}

function classifyInterpretationModeCatalog(catalog: PublicationCatalog): CatalogState {
  const columns = catalog.columns.filter((row) => row.table_name === "calculation_records");
  const constraints = catalog.constraints.filter(
    (row) => row.constraint_name === interpretationModeConstraint.constraint_name
  );
  if (columns.length === 0 && constraints.length === 0) return "absent";
  if (
    matchesCatalogRows(columns, [interpretationModeColumn]) &&
    matchesCatalogRows(constraints, [interpretationModeConstraint])
  ) {
    return "current";
  }
  return "drifted";
}

function classifyPublicationCatalog(catalog: PublicationCatalog): CatalogState {
  const columns = catalog.columns.filter((row) => row.table_name === "calculation_client_links");
  const constraints = catalog.constraints.filter(
    (row) => row.constraint_name !== interpretationModeConstraint.constraint_name
  );
  if (columns.length === 0 && constraints.length === 0 && catalog.indexes.length === 0) {
    return "absent";
  }
  if (
    matchesCatalogRows(columns, publicationColumns) &&
    matchesCatalogRows(constraints, publicationConstraints) &&
    matchesCatalogRows(catalog.indexes, publicationIndexes)
  ) {
    return "current";
  }
  return "drifted";
}

function matchesCatalogRows(actual: readonly unknown[], expected: readonly unknown[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function installInterpretationModeCatalog(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE calculation_records
      ADD COLUMN interpretation_mode text,
      ADD CONSTRAINT calculation_records_interpretation_mode_check CHECK (
        interpretation_mode IS NULL OR (
          module = 'chart'
          AND method_code = 'natal'
          AND interpretation_mode IN ('adult_natal', 'child', 'legacy_unclassified')
        )
      ) NOT VALID;
    ALTER TABLE calculation_records
      VALIDATE CONSTRAINT calculation_records_interpretation_mode_check
  `);
}

async function installPublicationBindingCatalog(client: Client): Promise<void> {
  const unauthorizedChart = await client.query<{ id: string }>(`
    SELECT link.id::text
      FROM calculation_client_links AS link
      JOIN calculation_records AS calculation ON calculation.id = link.calculation_id
     WHERE link.visibility = 'visible_to_client'
       AND calculation.module = 'chart'
       AND calculation.method_code = 'natal'
       AND calculation.interpretation_mode IS DISTINCT FROM 'adult_natal'
     ORDER BY link.id
     LIMIT 1
  `);
  if (unauthorizedChart.rows[0]) {
    throw new Error(
      `Cannot reconcile visible natal publication without persisted adult_natal authority: ${unauthorizedChart.rows[0].id}`
    );
  }

  const missingInterpretation = await client.query<{ id: string }>(`
    SELECT link.id::text
      FROM calculation_client_links AS link
     WHERE link.visibility = 'visible_to_client'
       AND NOT EXISTS (
         SELECT 1
           FROM calculation_interpretations AS interpretation
          WHERE interpretation.calculation_id = link.calculation_id
            AND interpretation.status = 'approved'
            AND interpretation.approved_at IS NOT NULL
       )
     ORDER BY link.id
     LIMIT 1
  `);
  if (missingInterpretation.rows[0]) {
    throw new Error(
      `Cannot reconcile visible calculation without an approved interpretation: ${missingInterpretation.rows[0].id}`
    );
  }

  const invalidChecksum = await client.query<{ id: string }>(`
    SELECT link.id::text
      FROM calculation_client_links AS link
      JOIN calculation_records AS calculation ON calculation.id = link.calculation_id
     WHERE link.visibility = 'visible_to_client'
       AND calculation.result_checksum !~ '^sha256:[a-f0-9]{64}$'
     ORDER BY link.id
     LIMIT 1
  `);
  if (invalidChecksum.rows[0]) {
    throw new Error(
      `Cannot reconcile visible calculation with an invalid result checksum: ${invalidChecksum.rows[0].id}`
    );
  }

  await client.query(`
    ALTER TABLE calculation_interpretations
      ADD CONSTRAINT calculation_interpretations_id_record_unique
        UNIQUE (id, calculation_id);
    ALTER TABLE calculation_client_links
      ADD COLUMN published_interpretation_id uuid,
      ADD COLUMN published_result_checksum text;

    UPDATE calculation_client_links
       SET published_at = NULL
     WHERE visibility = 'private_to_astrologer'
       AND published_at IS NOT NULL;

    WITH selected_interpretation AS (
      SELECT DISTINCT ON (link.id)
        link.id AS link_id,
        interpretation.id AS interpretation_id,
        calculation.result_checksum
      FROM calculation_client_links AS link
      JOIN calculation_records AS calculation ON calculation.id = link.calculation_id
      JOIN calculation_interpretations AS interpretation
        ON interpretation.calculation_id = link.calculation_id
       AND interpretation.status = 'approved'
       AND interpretation.approved_at IS NOT NULL
      WHERE link.visibility = 'visible_to_client'
      ORDER BY
        link.id,
        interpretation.approved_at DESC NULLS LAST,
        interpretation.updated_at DESC,
        interpretation.id DESC
    )
    UPDATE calculation_client_links AS link
       SET published_interpretation_id = selected.interpretation_id,
           published_result_checksum = selected.result_checksum
      FROM selected_interpretation AS selected
     WHERE link.id = selected.link_id;

    ALTER TABLE calculation_client_links
      ADD CONSTRAINT calculation_client_links_published_result_checksum_check CHECK (
        published_result_checksum IS NULL
        OR published_result_checksum ~ '^sha256:[a-f0-9]{64}$'
      ) NOT VALID,
      ADD CONSTRAINT calculation_client_links_publication_binding_check CHECK (
        (
          visibility = 'private_to_astrologer'
          AND published_at IS NULL
          AND published_interpretation_id IS NULL
          AND published_result_checksum IS NULL
        ) OR (
          visibility = 'visible_to_client'
          AND published_at IS NOT NULL
          AND published_interpretation_id IS NOT NULL
          AND published_result_checksum IS NOT NULL
        )
      ) NOT VALID,
      ADD CONSTRAINT calculation_client_links_published_interpretation_fk
        FOREIGN KEY (published_interpretation_id, calculation_id)
        REFERENCES calculation_interpretations(id, calculation_id)
        ON DELETE RESTRICT NOT VALID;
    ALTER TABLE calculation_client_links
      VALIDATE CONSTRAINT calculation_client_links_published_result_checksum_check,
      VALIDATE CONSTRAINT calculation_client_links_publication_binding_check,
      VALIDATE CONSTRAINT calculation_client_links_published_interpretation_fk;
    CREATE INDEX calculation_client_links_published_interpretation_idx
      ON calculation_client_links (published_interpretation_id, calculation_id)
  `);
}

async function assertCalculationPublicationData(client: Client): Promise<void> {
  const violation = await client.query<{ id: string; reason: string }>(`
    SELECT
      link.id::text,
      CASE
        WHEN link.visibility = 'private_to_astrologer'
          AND (
            link.published_at IS NOT NULL
            OR link.published_interpretation_id IS NOT NULL
            OR link.published_result_checksum IS NOT NULL
          )
          THEN 'private publication metadata'
        WHEN link.visibility = 'visible_to_client'
          AND interpretation.status IS DISTINCT FROM 'approved'
          THEN 'published interpretation approval'
        WHEN link.visibility = 'visible_to_client'
          AND link.published_result_checksum IS DISTINCT FROM calculation.result_checksum
          THEN 'published result checksum'
        WHEN link.visibility = 'visible_to_client'
          AND calculation.module = 'chart'
          AND calculation.method_code = 'natal'
          AND calculation.interpretation_mode IS DISTINCT FROM 'adult_natal'
          THEN 'adult_natal publication authority'
        ELSE NULL
      END AS reason
    FROM calculation_client_links AS link
    JOIN calculation_records AS calculation ON calculation.id = link.calculation_id
    LEFT JOIN calculation_interpretations AS interpretation
      ON interpretation.id = link.published_interpretation_id
     AND interpretation.calculation_id = link.calculation_id
    WHERE (
      link.visibility = 'private_to_astrologer'
      AND (
        link.published_at IS NOT NULL
        OR link.published_interpretation_id IS NOT NULL
        OR link.published_result_checksum IS NOT NULL
      )
    ) OR (
      link.visibility = 'visible_to_client'
      AND (
        interpretation.status IS DISTINCT FROM 'approved'
        OR link.published_result_checksum IS DISTINCT FROM calculation.result_checksum
        OR (
          calculation.module = 'chart'
          AND calculation.method_code = 'natal'
          AND calculation.interpretation_mode IS DISTINCT FROM 'adult_natal'
        )
      )
    )
    ORDER BY link.id
    LIMIT 1
  `);
  const row = violation.rows[0];
  if (row) {
    throw new Error(`Calculation publication ${row.reason} drifted for link ${row.id}`);
  }
}

function formatCatalog(catalog: PublicationCatalog): string {
  return JSON.stringify(catalog);
}
