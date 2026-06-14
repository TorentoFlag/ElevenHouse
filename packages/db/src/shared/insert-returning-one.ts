export async function insertReturningOne<TRow>(
  insert: () => Promise<readonly TRow[]>,
  tableName: string
): Promise<TRow> {
  const rows = await insert();
  const row = rows[0];

  if (!row) {
    throw new Error(`Expected ${tableName} insert to return a row`);
  }

  return row;
}
