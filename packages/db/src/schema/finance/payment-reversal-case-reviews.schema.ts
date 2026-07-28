import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  formatFinanceSqlValues,
  paymentReversalCaseReviewResolutionValues
} from "./finance-values";
import { paymentProviderEvents } from "./payments.schema";

export const paymentReversalCaseReviews = pgTable(
  "payment_reversal_case_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerEventId: uuid("provider_event_id")
      .notNull()
      .references(() => paymentProviderEvents.id, { onDelete: "cascade" }),
    resolution: text("resolution").notNull(),
    adminUserId: uuid("admin_user_id").references(() => users.id, { onDelete: "set null" }),
    adminNote: text("admin_note").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "payment_reversal_case_reviews_resolution_check",
      sql`${table.resolution} in ${sql.raw(
        formatFinanceSqlValues(paymentReversalCaseReviewResolutionValues)
      )}`
    ),
    check(
      "payment_reversal_case_reviews_admin_note_check",
      sql`length(trim(${table.adminNote})) between 1 and 2000`
    ),
    uniqueIndex("payment_reversal_case_reviews_provider_event_unique").on(table.providerEventId),
    index("payment_reversal_case_reviews_reviewed_at_idx").on(table.reviewedAt),
    index("payment_reversal_case_reviews_admin_user_idx").on(table.adminUserId)
  ]
);
