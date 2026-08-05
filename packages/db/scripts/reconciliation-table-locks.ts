import type { Client } from "pg";

const reconciliationLockTimeout = "5s";

export async function configureBoundedReconciliationLockTimeout(client: Client): Promise<void> {
  await client.query(`SET LOCAL lock_timeout = '${reconciliationLockTimeout}'`);
}

export async function lockExistingTablesForReconciliation(
  client: Client,
  relationNames: readonly string[]
): Promise<void> {
  const orderedRelationNames = [...new Set(relationNames)].sort();
  for (const relationName of orderedRelationNames) {
    if (!/^[a-z][a-z0-9_]*$/.test(relationName)) {
      throw new TypeError(`Invalid reconciliation relation name: ${relationName}`);
    }
  }

  const existing = await client.query<{ relation_name: string }>(
    `SELECT relation_name
       FROM unnest($1::text[]) AS candidate(relation_name)
      WHERE to_regclass('public.' || relation_name) IS NOT NULL
      ORDER BY relation_name`,
    [orderedRelationNames]
  );
  if (existing.rows.length === 0) return;

  const relationList = existing.rows.map((row) => `"${row.relation_name}"`).join(", ");
  await client.query(`LOCK TABLE ${relationList} IN ACCESS EXCLUSIVE MODE`);
}
