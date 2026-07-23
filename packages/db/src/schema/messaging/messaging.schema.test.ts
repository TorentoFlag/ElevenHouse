import { existsSync, readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  formatMessagingSqlValues,
  messageDeliveryAttempts,
  messagingChannelConnectionStatusValues,
  messagingChannelConnections,
  messagingChannelModeValues,
  messagingExternalIdentities,
  messagingMessages,
  messagingProviderValues,
  messagingRealtimeEvents,
  messagingThreadIdentities,
  messagingThreads,
  type OutboxEventPayload
} from "../index";
import { messagingMessageDeliveryRequestedEventType } from "@elevenhouse/domain";

const baselineMigrationFile = "packages/db/drizzle/0000_sticky_rictor.sql";
const baselineSnapshotFile = "packages/db/drizzle/meta/0000_snapshot.json";
const migrationJournalFile = "packages/db/drizzle/meta/_journal.json";

describe("Messaging persistence schema", () => {
  it("exports every planned Messaging table with its canonical table name", () => {
    expect(getTableName(messagingChannelConnections)).toBe("messaging_channel_connections");
    expect(getTableName(messagingExternalIdentities)).toBe("messaging_external_identities");
    expect(getTableName(messagingThreads)).toBe("messaging_threads");
    expect(getTableName(messagingThreadIdentities)).toBe("messaging_thread_identities");
    expect(getTableName(messagingMessages)).toBe("messages");
    expect(getTableName(messageDeliveryAttempts)).toBe("message_delivery_attempts");
    expect(getTableName(messagingRealtimeEvents)).toBe("messaging_realtime_events");
  });

  it("keeps present and future provider modes explicit", () => {
    expect(messagingProviderValues).toEqual(["telegram", "instagram"]);
    expect(messagingChannelModeValues).toEqual([
      "telegram_business_bot",
      "telegram_mtproto_account",
      "instagram_graph"
    ]);
    expect(messagingChannelConnectionStatusValues).toEqual([
      "connecting",
      "active",
      "paused",
      "revoked",
      "reauth_required",
      "error"
    ]);
    expect(formatMessagingSqlValues(messagingProviderValues)).toBe("('telegram', 'instagram')");
  });

  it("accepts identifier-only Messaging delivery payloads in the outbox union", () => {
    const payload: OutboxEventPayload = {
      messageId: "30000000-0000-4000-8000-000000000001",
      threadId: "30000000-0000-4000-8000-000000000002",
      channelConnectionId: "30000000-0000-4000-8000-000000000003",
      astrologerUserId: "30000000-0000-4000-8000-000000000004"
    };

    expect(messagingMessageDeliveryRequestedEventType).toBe(
      "messaging.message.delivery_requested"
    );
    expect(payload).toEqual({
      messageId: "30000000-0000-4000-8000-000000000001",
      threadId: "30000000-0000-4000-8000-000000000002",
      channelConnectionId: "30000000-0000-4000-8000-000000000003",
      astrologerUserId: "30000000-0000-4000-8000-000000000004"
    });
  });

  it("uses a generated monotonic realtime cursor and provider-consistent primary identities", () => {
    const realtimeEventsConfig = getTableConfig(messagingRealtimeEvents);
    const channelConnectionsConfig = getTableConfig(messagingChannelConnections);
    const externalIdentitiesConfig = getTableConfig(messagingExternalIdentities);
    const threadIdentitiesConfig = getTableConfig(messagingThreadIdentities);

    expect(Object.keys(getTableColumns(messagingRealtimeEvents))).toContain("eventId");
    expect(realtimeEventsConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "messaging_realtime_events_event_id_unique",
        "messaging_realtime_events_astrologer_event_id_idx"
      ])
    );
    expect(Object.keys(getTableColumns(messagingThreadIdentities))).toContain("provider");
    expect(channelConnectionsConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "messaging_channel_connections_id_provider_unique"
    );
    expect(externalIdentitiesConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "messaging_external_identities_id_provider_unique"
    );
    expect(externalIdentitiesConfig.foreignKeys.map((key) => key.getName())).toContain(
      "messaging_external_identities_connection_provider_fk"
    );
    expect(threadIdentitiesConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "messaging_thread_identities_thread_identity_unique",
        "messaging_thread_identities_external_identity_unique",
        "messaging_thread_identities_primary_thread_provider_unique"
      ])
    );
    expect(threadIdentitiesConfig.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "messaging_thread_identities_thread_id_messaging_threads_id_fk",
        "messaging_thread_identities_external_identity_provider_fk"
      ])
    );
    expect(threadIdentitiesConfig.checks.map((check) => check.name)).toContain(
      "messaging_thread_identities_provider_check"
    );
  });

  it("rejects invalid provider and mode pairs in the table metadata", () => {
    const channelConnectionsConfig = getTableConfig(messagingChannelConnections);

    expect(channelConnectionsConfig.checks.map((check) => check.name)).toContain(
      "messaging_channel_connections_provider_mode_check"
    );
  });

  it("keeps the generated Messaging DDL in the single current baseline", () => {
    const migration = readFileSync(baselineMigrationFile, "utf8");
    const snapshot = JSON.parse(readFileSync(baselineSnapshotFile, "utf8")) as {
      prevId: string;
    };
    const journal = JSON.parse(readFileSync(migrationJournalFile, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(migration).toContain('"event_id" bigserial NOT NULL');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "messaging_realtime_events_event_id_unique" ON "messaging_realtime_events" USING btree ("event_id")'
    );
    expect(migration).toContain(
      'CREATE INDEX "messaging_realtime_events_astrologer_event_id_idx" ON "messaging_realtime_events" USING btree ("astrologer_user_id","event_id")'
    );
    expect(migration).toContain('"provider" text NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "messaging_channel_connections_provider_mode_check" CHECK (("messaging_channel_connections"."provider" = \'telegram\' and "messaging_channel_connections"."mode" in (\'telegram_business_bot\', \'telegram_mtproto_account\')) or ("messaging_channel_connections"."provider" = \'instagram\' and "messaging_channel_connections"."mode" = \'instagram_graph\'))'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "messaging_channel_connections_external_account_unique" ON "messaging_channel_connections" USING btree ("provider","external_account_id") WHERE "messaging_channel_connections"."external_account_id" is not null'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "messaging_thread_identities_primary_thread_provider_unique" ON "messaging_thread_identities" USING btree ("thread_id","provider") WHERE "messaging_thread_identities"."is_primary" = true'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "messaging_thread_identities_external_identity_unique" ON "messaging_thread_identities" USING btree ("external_identity_id")'
    );
    expect(migration).toContain(
      'CONSTRAINT "messaging_thread_identities_provider_check" CHECK ("messaging_thread_identities"."provider" in (\'telegram\', \'instagram\'))'
    );
    expect(migration).toContain(
      'CONSTRAINT "messaging_channel_connections_id_provider_unique" UNIQUE("id","provider")'
    );
    expect(migration).toContain(
      'CONSTRAINT "messaging_external_identities_id_provider_unique" UNIQUE("id","provider")'
    );
    expect(migration).toContain(
      'ALTER TABLE "messaging_external_identities" ADD CONSTRAINT "messaging_external_identities_connection_provider_fk" FOREIGN KEY ("channel_connection_id","provider") REFERENCES "public"."messaging_channel_connections"("id","provider") ON DELETE cascade ON UPDATE no action'
    );
    expect(migration).toContain(
      'ALTER TABLE "messaging_thread_identities" ADD CONSTRAINT "messaging_thread_identities_external_identity_provider_fk" FOREIGN KEY ("external_identity_id","provider") REFERENCES "public"."messaging_external_identities"("id","provider") ON DELETE cascade ON UPDATE no action'
    );
    expect(journal.entries.map(({ idx, tag }) => ({ idx, tag }))).toEqual([
      { idx: 0, tag: "0000_sticky_rictor" }
    ]);
    expect(snapshot.prevId).toBe("00000000-0000-0000-0000-000000000000");
    expect(existsSync("packages/db/drizzle/0001_sticky_rictor.sql")).toBe(false);
    expect(existsSync("packages/db/drizzle/meta/0001_snapshot.json")).toBe(false);
  });
});
