import { relations } from "drizzle-orm";
import { calculationRecords } from "../calculations/calculation-records.schema";
import { users } from "../identity/accounts.schema";
import { matrixNotes } from "./matrix-notes.schema";

export const matrixNotesRelations = relations(matrixNotes, ({ one }) => ({
  calculation: one(calculationRecords, {
    fields: [matrixNotes.calculationId],
    references: [calculationRecords.id]
  }),
  owner: one(users, {
    fields: [matrixNotes.ownerUserId],
    references: [users.id]
  })
}));
