import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  sessionCommands,
  sessionMessages,
  sessionParticipants,
  sessionProviderEvents,
  sessionBookingLifecycleReceipts,
  sessionRealtimeEvents,
  sessions
} from "./index";

const config = (table: Parameters<typeof getTableConfig>[0]) => getTableConfig(table);

describe("Sessions PostgreSQL source schema", () => {
  it("owns the provider-neutral aggregate, participants and durable text chat", () => {
    expect(
      [sessions, sessionParticipants, sessionMessages].map((table) => config(table).name)
    ).toEqual(["sessions", "session_participants", "session_messages"]);

    expect(config(sessions).columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "booking_id",
        "owner_user_id",
        "client_user_id",
        "state",
        "lifecycle_revision",
        "provider",
        "provider_room_name",
        "scheduled_start_at",
        "scheduled_end_at",
        "started_at",
        "ended_at",
        "end_reason"
      ])
    );
    expect(config(sessionParticipants).columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "session_id",
        "user_id",
        "role",
        "provider_participant_id",
        "display_name_snapshot",
        "first_joined_at",
        "last_joined_at",
        "presence_state",
        "presence_updated_at"
      ])
    );
    expect(config(sessionMessages).columns.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(["provider_message_id", "attachment_id", "recording_id"])
    );
  });

  it("enforces one Session per Booking and exact lifecycle evidence", () => {
    const session = config(sessions);
    expect(session.uniqueConstraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "sessions_booking_unique",
        "sessions_provider_room_unique",
        "sessions_id_owner_client_unique"
      ])
    );
    expect(session.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "sessions_booking_owner_client_fk"
    );
    expect(session.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "sessions_state_check",
        "sessions_schedule_range_check",
        "sessions_lifecycle_evidence_check",
        "sessions_provider_check",
        "sessions_distinct_users_check"
      ])
    );
  });

  it("provides durable idempotency and ordered replay for commands, messages and webhooks", () => {
    expect(config(sessionMessages).uniqueConstraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "session_messages_session_sequence_unique",
        "session_messages_actor_operation_unique"
      ])
    );
    expect(config(sessionCommands).uniqueConstraints.map(({ name }) => name)).toContain(
      "session_commands_actor_kind_operation_unique"
    );
    expect(config(sessionProviderEvents).uniqueConstraints.map(({ name }) => name)).toContain(
      "session_provider_events_provider_event_unique"
    );
    expect(config(sessionBookingLifecycleReceipts).name).toBe(
      "session_booking_lifecycle_receipts"
    );
    expect(
      config(sessionBookingLifecycleReceipts).foreignKeys.map((foreignKey) => foreignKey.getName())
    ).toContain("session_booking_lifecycle_receipts_event_booking_owner_fk");

    const realtime = config(sessionRealtimeEvents);
    expect(realtime.columns.find(({ name }) => name === "event_id")?.getSQLType()).toBe(
      "bigint"
    );
    expect(realtime.columns.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(["text", "payload", "provider_room_name"])
    );
    expect(realtime.checks.map(({ name }) => name)).toContain(
      "session_realtime_events_ids_only_shape_check"
    );
  });

  it("keeps recording, transcript, attachment and AI storage outside Slice A", () => {
    const names = [
      sessions,
      sessionParticipants,
      sessionMessages,
      sessionCommands,
      sessionProviderEvents,
      sessionBookingLifecycleReceipts,
      sessionRealtimeEvents
    ].flatMap((table) => config(table).columns.map(({ name }) => name));

    expect(names.some((name) => /recording|transcript|attachment|summary|consent/.test(name))).toBe(
      false
    );
  });
});
