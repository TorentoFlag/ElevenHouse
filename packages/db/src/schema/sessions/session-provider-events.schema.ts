import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

import {
  formatSessionSqlValues,
  sessionProviderEventApplicationStatusValues,
  sessionProviderEventTypeValues
} from "./session-values";
import { sessions } from "./sessions.schema";

export const sessionProviderEvents = pgTable(
  "session_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerRoomName: text("provider_room_name").notNull(),
    eventType: text("event_type").notNull(),
    providerParticipantId: uuid("provider_participant_id"),
    payloadDigest: varchar("payload_digest", { length: 71 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    applicationStatus: text("application_status").notNull(),
    safeFailureCode: text("safe_failure_code")
  },
  (table) => [
    unique("session_provider_events_provider_event_unique").on(
      table.provider,
      table.providerEventId
    ),
    check("session_provider_events_provider_check", sql`${table.provider} = 'livekit'`),
    check(
      "session_provider_events_type_check",
      sql`${table.eventType} in ${sql.raw(formatSessionSqlValues(sessionProviderEventTypeValues))}`
    ),
    check(
      "session_provider_events_application_status_check",
      sql`${table.applicationStatus} in ${sql.raw(
        formatSessionSqlValues(sessionProviderEventApplicationStatusValues)
      )}`
    ),
    check("session_provider_events_payload_digest_check", sql`${table.payloadDigest} ~ '^sha256:[0-9a-f]{64}$'`),
    check(
      "session_provider_events_application_evidence_check",
      sql`(${table.applicationStatus} = 'failed' and ${table.safeFailureCode} is not null) or (${table.applicationStatus} <> 'failed' and ${table.safeFailureCode} is null)`
    ),
    index("session_provider_events_room_occurred_idx").on(
      table.providerRoomName,
      table.occurredAt,
      table.id
    )
  ]
);
