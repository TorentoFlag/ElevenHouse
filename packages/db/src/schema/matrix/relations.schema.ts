import { relations } from "drizzle-orm";
import { calculationRecords } from "../calculations/calculation-records.schema";
import { users } from "../identity/accounts.schema";
import { matrixNotes } from "./matrix-notes.schema";
import { matrixPdfJobs } from "./matrix-pdf-jobs.schema";
import { matrixReportDrafts } from "./matrix-report-drafts.schema";

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

export const matrixReportDraftsRelations = relations(matrixReportDrafts, ({ many, one }) => ({
  calculation: one(calculationRecords, {
    fields: [matrixReportDrafts.calculationId],
    references: [calculationRecords.id]
  }),
  owner: one(users, {
    fields: [matrixReportDrafts.ownerUserId],
    references: [users.id]
  }),
  pdfJobs: many(matrixPdfJobs)
}));

export const matrixPdfJobsRelations = relations(matrixPdfJobs, ({ one }) => ({
  calculation: one(calculationRecords, {
    fields: [matrixPdfJobs.calculationId],
    references: [calculationRecords.id]
  }),
  report: one(matrixReportDrafts, {
    fields: [matrixPdfJobs.reportId],
    references: [matrixReportDrafts.id]
  }),
  owner: one(users, {
    fields: [matrixPdfJobs.ownerUserId],
    references: [users.id]
  })
}));
