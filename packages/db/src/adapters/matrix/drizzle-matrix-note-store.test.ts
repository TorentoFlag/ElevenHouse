import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { matrixNotes } from "../../schema";
import { createDrizzleMatrixNoteStore } from "./index";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const noteId = "00000000-0000-4000-8000-000000000003";
const checksum = `sha256:${"a".repeat(64)}`;
const now = new Date("2026-07-14T12:00:00.000Z");

describe("createDrizzleMatrixNoteStore", () => {
  it("lists only the owned calculation timeline and maps dates to ISO strings", async () => {
    const fake = createFakeDatabase([row()]);
    const notes = await createDrizzleMatrixNoteStore(fake.database as never).listByCalculation({
      ownerUserId,
      calculationId
    });

    expect(notes).toEqual([
      expect.objectContaining({
        id: noteId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      })
    ]);
    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, calculationId]
    });
  });

  it("inserts the injected note identity without adapter-generated values", async () => {
    const fake = createFakeDatabase([row()]);
    const note = await createDrizzleMatrixNoteStore(fake.database as never).create({
      id: noteId,
      ownerUserId,
      calculationId,
      text: "Проверить тему границ.",
      resultChecksum: checksum,
      now: now.toISOString()
    });

    expect(fake.inserts).toEqual([
      {
        table: matrixNotes,
        value: {
          id: noteId,
          ownerUserId,
          calculationId,
          text: "Проверить тему границ.",
          resultChecksum: checksum,
          createdAt: now,
          updatedAt: now
        }
      }
    ]);
    expect(note.resultChecksum).toBe(checksum);
  });

  it("updates and deletes with note, calculation and owner predicates", async () => {
    const fake = createFakeDatabase([row(), { id: noteId }]);
    const store = createDrizzleMatrixNoteStore(fake.database as never);

    const updated = await store.update({
      ownerUserId,
      calculationId,
      noteId,
      text: "Новый вывод.",
      resultChecksum: checksum,
      now: now.toISOString()
    });
    const deleted = await store.delete({ ownerUserId, calculationId, noteId });

    expect(updated?.text).toBe("Проверить тему границ.");
    expect(deleted).toBe(true);
    for (const where of fake.wheres) {
      expect(renderWhere(where)).toMatchObject({
        sql: expect.stringContaining('"owner_user_id"'),
        params: [noteId, calculationId, ownerUserId]
      });
    }
  });
});

function row() {
  return {
    id: noteId,
    ownerUserId,
    calculationId,
    text: "Проверить тему границ.",
    resultChecksum: checksum,
    createdAt: now,
    updatedAt: now
  };
}

function createFakeDatabase(rows: readonly Record<string, unknown>[]) {
  let nextRow = 0;
  const wheres: SQL[] = [];
  const inserts: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const takeRows = () => {
    const current = rows[nextRow];
    nextRow += 1;
    return current ? [current] : [];
  };
  return {
    wheres,
    inserts,
    database: {
      select: () => ({
        from: () => ({
          where: (where: SQL) => {
            wheres.push(where);
            return { orderBy: async () => takeRows() };
          }
        })
      }),
      insert: (table: unknown) => ({
        values: (value: Record<string, unknown>) => ({
          returning: async () => {
            inserts.push({ table, value });
            return takeRows();
          }
        })
      }),
      update: () => ({
        set: () => ({
          where: (where: SQL) => {
            wheres.push(where);
            return { returning: async () => takeRows() };
          }
        })
      }),
      delete: () => ({
        where: (where: SQL) => {
          wheres.push(where);
          return { returning: async () => takeRows() };
        }
      })
    }
  };
}

function renderWhere(where: SQL | undefined) {
  if (!where) throw new Error("Expected a Drizzle where clause");
  return new PgDialect().sqlToQuery(where);
}
