import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  formatVerificationSqlValues,
  verificationApplicationStatusValues
} from "./verification-values";

export const verificationApplications = pgTable(
  "verification_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "verification_applications_status_check",
      sql`${table.status} in ${sql.raw(formatVerificationSqlValues(verificationApplicationStatusValues))}`
    ),
    check(
      "verification_applications_rejection_reason_check",
      sql`${table.status} <> 'rejected' or length(trim(${table.rejectionReason})) > 0`
    ),
    check(
      "verification_applications_reviewed_at_check",
      sql`${table.status} = 'pending' or ${table.reviewedAt} is not null`
    ),
    index("verification_applications_owner_submitted_idx").on(
      table.ownerUserId,
      table.submittedAt,
      table.id
    ),
    index("verification_applications_status_submitted_idx").on(table.status, table.submittedAt)
  ]
);
