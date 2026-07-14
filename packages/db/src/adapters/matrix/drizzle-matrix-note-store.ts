import { and, desc, eq } from "drizzle-orm";
import type { MatrixNote, MatrixNoteStore } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { matrixNotes } from "../../schema";
import { insertReturningOne } from "../../shared";

type MatrixNoteRow = typeof matrixNotes.$inferSelect;

export function createDrizzleMatrixNoteStore(database: ElevenHouseDatabase): MatrixNoteStore {
  return {
    listByCalculation: async ({ ownerUserId, calculationId }) => {
      const rows = await database
        .select()
        .from(matrixNotes)
        .where(
          and(
            eq(matrixNotes.ownerUserId, ownerUserId),
            eq(matrixNotes.calculationId, calculationId)
          )
        )
        .orderBy(desc(matrixNotes.createdAt), desc(matrixNotes.id));
      return rows.map(toMatrixNote);
    },
    create: async (input) => {
      const now = new Date(input.now);
      const row = await insertReturningOne(
        () =>
          database
            .insert(matrixNotes)
            .values({
              id: input.id,
              ownerUserId: input.ownerUserId,
              calculationId: input.calculationId,
              text: input.text,
              resultChecksum: input.resultChecksum,
              createdAt: now,
              updatedAt: now
            })
            .returning(),
        "matrix_notes"
      );
      return toMatrixNote(row);
    },
    update: async (input) => {
      const [row] = await database
        .update(matrixNotes)
        .set({
          text: input.text,
          resultChecksum: input.resultChecksum,
          updatedAt: new Date(input.now)
        })
        .where(ownedNoteWhere(input.ownerUserId, input.calculationId, input.noteId))
        .returning();
      return row ? toMatrixNote(row) : null;
    },
    delete: async (input) => {
      const [row] = await database
        .delete(matrixNotes)
        .where(ownedNoteWhere(input.ownerUserId, input.calculationId, input.noteId))
        .returning({ id: matrixNotes.id });
      return Boolean(row);
    }
  };
}

function ownedNoteWhere(ownerUserId: string, calculationId: string, noteId: string) {
  return and(
    eq(matrixNotes.id, noteId),
    eq(matrixNotes.calculationId, calculationId),
    eq(matrixNotes.ownerUserId, ownerUserId)
  );
}

function toMatrixNote(row: MatrixNoteRow): MatrixNote {
  return {
    id: row.id,
    calculationId: row.calculationId,
    ownerUserId: row.ownerUserId,
    text: row.text,
    resultChecksum: row.resultChecksum,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
