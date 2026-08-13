import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { bookingLifecycleEvents } from "../scheduling/booking-lifecycle-events.schema";
import {
  formatSessionSqlValues,
  sessionBookingLifecycleReceiptOutcomeValues
} from "./session-values";

export const sessionBookingLifecycleReceipts = pgTable(
  "session_booking_lifecycle_receipts",
  {
    eventId: uuid("event_id").primaryKey(),
    bookingId: uuid("booking_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    revision: integer("revision").notNull(),
    outcome: text("outcome").notNull(),
    sessionId: uuid("session_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("session_booking_lifecycle_receipts_event_booking_owner_unique").on(
      table.eventId,
      table.bookingId,
      table.ownerUserId
    ),
    foreignKey({
      columns: [table.eventId, table.bookingId, table.ownerUserId],
      foreignColumns: [
        bookingLifecycleEvents.id,
        bookingLifecycleEvents.bookingId,
        bookingLifecycleEvents.ownerUserId
      ],
      name: "session_booking_lifecycle_receipts_event_booking_owner_fk"
    }).onDelete("restrict"),
    check("session_booking_lifecycle_receipts_revision_check", sql`${table.revision} > 0`),
    check(
      "session_booking_lifecycle_receipts_outcome_check",
      sql`${table.outcome} in ${sql.raw(
        formatSessionSqlValues(sessionBookingLifecycleReceiptOutcomeValues)
      )}`
    ),
    check(
      "session_booking_lifecycle_receipts_session_evidence_check",
      sql`${table.outcome} = 'ignored' or ${table.sessionId} is not null`
    ),
    index("session_booking_lifecycle_receipts_booking_revision_idx").on(
      table.bookingId,
      table.revision
    )
  ]
);
