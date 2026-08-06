import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { readFileSync } from "node:fs";
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
  messagingInstagramGraphAccounts,
  messagingMtprotoLoginStateValues,
  messagingTelegramMtprotoSessions,
  messagingMessages,
  messagingProviderValues,
  messagingRealtimeEvents,
  messagingThreadIdentities,
  messagingThreads,
  type OutboxEventPayload
} from "../index";
import { messagingMessageDeliveryRequestedEventType } from "@elevenhouse/domain";

const baselineMigrationFile = readCurrentMigrationSql();
const baselineSnapshotFile = "packages/db/drizzle/meta/0016_snapshot.json";
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
    expect(getTableName(messagingInstagramGraphAccounts)).toBe(
      "messaging_instagram_graph_accounts"
    );
    expect(getTableName(messagingTelegramMtprotoSessions)).toBe(
      "messaging_telegram_mtproto_sessions"
    );
  });

  it("keeps Instagram Graph credentials separate from public channel snapshots", () => {
    const accountColumns = Object.keys(getTableColumns(messagingInstagramGraphAccounts));
    const accountConfig = getTableConfig(messagingInstagramGraphAccounts);

    expect(accountColumns).toEqual(
      expect.arrayContaining([
        "channelConnectionId",
        "instagramUserId",
        "instagramUsername",
        "instagramDisplayName",
        "accessTokenEncrypted",
        "tokenExpiresAt"
      ])
    );
    expect(accountConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "messaging_instagram_graph_accounts_connection_unique",
        "messaging_instagram_graph_accounts_instagram_user_unique"
      ])
    );
    expect(accountConfig.foreignKeys.map((key) => key.getName())).toContain(
      "messaging_instagram_graph_accounts_channel_connection_id_messaging_channel_connections_id_fk"
    );
    expect(accountConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "messaging_instagram_graph_accounts_instagram_user_id_length_check",
        "messaging_instagram_graph_accounts_access_token_object_check"
      ])
    );
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
    expect(messagingMtprotoLoginStateValues).toEqual([
      "code_required",
      "password_required",
      "authorized",
      "reauth_required",
      "revoked"
    ]);
    expect(formatMessagingSqlValues(messagingProviderValues)).toBe("('telegram', 'instagram')");
  });

  it("keeps Telegram Account sessions separate from public channel snapshots", () => {
    const sessionColumns = Object.keys(getTableColumns(messagingTelegramMtprotoSessions));
    const sessionConfig = getTableConfig(messagingTelegramMtprotoSessions);

    expect(sessionColumns).toEqual(
      expect.arrayContaining([
        "channelConnectionId",
        "loginState",
        "phoneNumberEncrypted",
        "phoneCodeHashEncrypted",
        "sessionEncrypted",
        "phoneNumberLast4",
        "telegramUserId",
        "pts",
        "qts",
        "dateCursor",
        "seq",
        "leaseOwner",
        "leasedUntil",
        "lastListenerHeartbeatAt"
      ])
    );
    expect(sessionConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "messaging_telegram_mtproto_sessions_connection_unique"
    );
    expect(sessionConfig.foreignKeys.map((key) => key.getName())).toContain(
      "messaging_telegram_mtproto_sessions_channel_connection_id_messaging_channel_connections_id_fk"
    );
    expect(sessionConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "messaging_telegram_mtproto_sessions_login_state_check",
        "messaging_telegram_mtproto_sessions_phone_last4_check",
        "messaging_telegram_mtproto_sessions_phone_encrypted_object_check",
        "messaging_telegram_mtproto_sessions_phone_code_hash_encrypted_object_check",
        "messaging_telegram_mtproto_sessions_session_encrypted_object_check",
        "messaging_telegram_mtproto_sessions_update_cursors_check"
      ])
    );
  });

  it("accepts identifier-only Messaging delivery payloads in the outbox union", () => {
    const payload: OutboxEventPayload = {
      messageId: "30000000-0000-4000-8000-000000000001",
      threadId: "30000000-0000-4000-8000-000000000002",
      channelConnectionId: "30000000-0000-4000-8000-000000000003",
      astrologerUserId: "30000000-0000-4000-8000-000000000004"
    };

    expect(messagingMessageDeliveryRequestedEventType).toBe("messaging.message.delivery_requested");
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
    expect(
      channelConnectionsConfig.uniqueConstraints.map((constraint) => constraint.name)
    ).toContain("messaging_channel_connections_id_provider_unique");
    expect(
      externalIdentitiesConfig.uniqueConstraints.map((constraint) => constraint.name)
    ).toContain("messaging_external_identities_id_provider_unique");
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
    const migration = baselineMigrationFile;
    const snapshot = JSON.parse(readFileSync(baselineSnapshotFile, "utf8")) as {
      prevId: string;
      tables: Record<string, unknown>;
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
    expect(migration).toContain('"external_owner_user_id" text');
    expect(migration).toContain(
      'CONSTRAINT "messaging_channel_connections_provider_mode_check" CHECK (("messaging_channel_connections"."provider" = \'telegram\' and "messaging_channel_connections"."mode" in (\'telegram_business_bot\', \'telegram_mtproto_account\')) or ("messaging_channel_connections"."provider" = \'instagram\' and "messaging_channel_connections"."mode" = \'instagram_graph\'))'
    );
    expect(migration).toContain(
      'CONSTRAINT "messaging_channel_connections_external_owner_id_length_check" CHECK ("messaging_channel_connections"."external_owner_user_id" is null or length(trim("messaging_channel_connections"."external_owner_user_id")) between 1 and 200)'
    );
    expect(migration).toContain('CREATE TABLE "messaging_telegram_mtproto_sessions"');
    expect(migration).toContain('CREATE TABLE "messaging_instagram_graph_accounts"');
    expect(migration).toContain('"access_token_encrypted" jsonb NOT NULL');
    expect(migration).not.toContain('"page_id" text NOT NULL');
    expect(migration).not.toContain('"page_name" text');
    expect(migration).not.toContain('"user_access_token_encrypted" jsonb NOT NULL');
    expect(migration).not.toContain('"page_access_token_encrypted" jsonb NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "messaging_instagram_graph_accounts_access_token_object_check" CHECK (jsonb_typeof("messaging_instagram_graph_accounts"."access_token_encrypted") = \'object\')'
    );
    expect(migration).toContain('"phone_number_encrypted" jsonb NOT NULL');
    expect(migration).toContain('"phone_code_hash_encrypted" jsonb NOT NULL');
    expect(migration).toContain('"session_encrypted" jsonb');
    expect(migration).toContain(
      'CONSTRAINT "messaging_telegram_mtproto_sessions_update_cursors_check" CHECK (("messaging_telegram_mtproto_sessions"."pts" is null or "messaging_telegram_mtproto_sessions"."pts" >= 0) and ("messaging_telegram_mtproto_sessions"."qts" is null or "messaging_telegram_mtproto_sessions"."qts" >= 0) and ("messaging_telegram_mtproto_sessions"."seq" is null or "messaging_telegram_mtproto_sessions"."seq" >= 0))'
    );
    expect(snapshot.tables).toHaveProperty("public.messaging_instagram_graph_accounts");
    expect(snapshot.tables).toHaveProperty("public.messaging_telegram_mtproto_sessions");
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
    expect(journal.entries).toHaveLength(17);
    expect(snapshot.prevId).not.toBe("00000000-0000-0000-0000-000000000000");
  });
});
