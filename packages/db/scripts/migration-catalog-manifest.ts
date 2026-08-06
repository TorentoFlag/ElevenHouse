import { createHash } from "node:crypto";

import type { Client, QueryResultRow } from "pg";

export const CATALOG_CATEGORIES = [
  "extensions",
  "types",
  "relations",
  "columns",
  "constraints",
  "indexes",
  "routines",
  "triggers"
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];
export type CatalogRow = Readonly<Record<string, unknown>>;
export type CatalogManifestInput = Partial<Record<CatalogCategory, readonly CatalogRow[]>>;

export type CatalogManifest = {
  digest: string;
} & { readonly [Category in CatalogCategory]: readonly CatalogRow[] };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }

  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sortedRows(rows: readonly CatalogRow[] | undefined): readonly CatalogRow[] {
  return [...(rows ?? [])]
    .map((row) => canonicalize(row) as CatalogRow)
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

export function createCatalogManifest(input: CatalogManifestInput): CatalogManifest {
  const categories = Object.fromEntries(
    CATALOG_CATEGORIES.map((category) => [category, sortedRows(input[category])])
  ) as { readonly [Category in CatalogCategory]: readonly CatalogRow[] };
  const digest = createHash("sha256").update(canonicalJson(categories)).digest("hex");

  return { ...categories, digest };
}

export function assertCatalogEquivalent(reference: CatalogManifest, candidate: CatalogManifest): void {
  for (const category of CATALOG_CATEGORIES) {
    if (canonicalJson(reference[category]) !== canonicalJson(candidate[category])) {
      throw new Error(`MIGRATION_CATALOG_MISMATCH:${category}`);
    }
  }
}

export async function readApplicationCatalogManifest(client: Pick<Client, "query">): Promise<CatalogManifest> {
  const extensions = await readRows(client, `
      SELECT extname AS name, extversion AS version, n.nspname AS schema
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
       ORDER BY extname
    `);
  const types = await readRows(client, `
      SELECT n.nspname AS schema, t.typname AS name, t.typtype AS kind,
             pg_catalog.format_type(t.oid, NULL) AS definition,
             COALESCE(enum_labels.labels, '[]') AS enum_labels
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        LEFT JOIN LATERAL (
          SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder)::text AS labels
            FROM pg_enum e
           WHERE e.enumtypid = t.oid
        ) enum_labels ON true
       WHERE n.nspname = 'public'
         AND t.typtype IN ('d', 'e', 'r')
       ORDER BY n.nspname, t.typname
    `);
  const relations = await readRows(client, `
      SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
             c.relpersistence AS persistence, c.relrowsecurity AS row_security,
             c.relforcerowsecurity AS force_row_security,
             COALESCE(c.reloptions::text, '{}') AS options,
             CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true) ELSE NULL END AS definition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       ORDER BY n.nspname, c.relname
    `);
  const columns = await readRows(client, `
      SELECT n.nspname AS schema, c.relname AS relation, a.attname AS name,
             pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
             a.attnotnull AS not_null, a.attidentity AS identity,
             a.attgenerated AS generated,
             COALESCE(coll.collname, '') AS collation,
             pg_get_expr(def.adbin, def.adrelid, true) AS "default"
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef def ON def.adrelid = a.attrelid AND def.adnum = a.attnum
        LEFT JOIN pg_collation coll ON coll.oid = a.attcollation AND a.attcollation <> 0
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND a.attnum > 0
         AND NOT a.attisdropped
       ORDER BY n.nspname, c.relname, a.attnum
    `);
  const constraints = await readRows(client, `
      SELECT n.nspname AS schema, c.relname AS relation, con.conname AS name,
             con.contype AS type, con.condeferrable AS deferrable,
             con.condeferred AS initially_deferred, con.convalidated AS validated,
             pg_get_constraintdef(con.oid, true) AS definition
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
       ORDER BY n.nspname, c.relname, con.conname
    `);
  const indexes = await readRows(client, `
      SELECT table_namespace.nspname AS schema, table_class.relname AS relation,
             index_class.relname AS name, ix.indisunique AS unique,
             ix.indisprimary AS primary, ix.indisexclusion AS exclusion,
             ix.indisvalid AS valid, ix.indisready AS ready,
             pg_get_indexdef(ix.indexrelid) AS definition,
             pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
        FROM pg_index ix
        JOIN pg_class table_class ON table_class.oid = ix.indrelid
        JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
        JOIN pg_class index_class ON index_class.oid = ix.indexrelid
       WHERE table_namespace.nspname = 'public'
       ORDER BY table_namespace.nspname, table_class.relname, index_class.relname
    `);
  const routines = await readRows(client, `
      SELECT n.nspname AS schema, p.proname AS name, p.prokind AS kind,
             p.prosecdef AS security_definer, p.proleakproof AS leakproof,
             p.provolatile AS volatility, p.proparallel AS parallel,
             COALESCE(p.proconfig::text, '{}') AS config,
             pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
       ORDER BY n.nspname, p.proname, p.oid
    `);
  const triggers = await readRows(client, `
      SELECT n.nspname AS schema, c.relname AS relation, t.tgname AS name,
             t.tgenabled AS enabled, t.tgdeferrable AS deferrable,
             t.tginitdeferred AS initially_deferred,
             pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND NOT t.tgisinternal
       ORDER BY n.nspname, c.relname, t.tgname
    `);

  return createCatalogManifest({ extensions, types, relations, columns, constraints, indexes, routines, triggers });
}

async function readRows(client: Pick<Client, "query">, sql: string): Promise<readonly CatalogRow[]> {
  return (await client.query<QueryResultRow>(sql)).rows;
}
