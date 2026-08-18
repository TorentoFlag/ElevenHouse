import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { messagingMessageDeliveryRequestedEventType } from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import {
  messagingChannelConnections,
  messagingExternalIdentities,
  messagingInstagramGraphAccounts,
  messagingMessages,
  messagingThreadIdentities,
  messagingThreads,
  outboxEvents,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleMessagingDeliveryProcessingStore } from "./drizzle-messaging-delivery-processing-store";

describe.sequential("Drizzle messaging delivery processing store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("loads an Instagram Graph delivery work item from a delivery-request outbox event", async () => {
    const now = new Date("2026-08-18T15:30:00.000Z");
    const astrologerUserId = randomUUID();
    const threadId = randomUUID();
    const channelConnectionId = randomUUID();
    const externalIdentityId = randomUUID();
    const messageId = randomUUID();
    const outboxEventId = randomUUID();
    const text = "delivery regression smoke";

    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(users).values({ id: astrologerUserId });
      await transaction.insert(messagingChannelConnections).values({
        id: channelConnectionId,
        astrologerUserId,
        provider: "instagram",
        mode: "instagram_graph",
        status: "active",
        externalAccountId: `ig-account-${channelConnectionId}`,
        externalOwnerUserId: null,
        displayNameSnapshot: "Astrolog",
        usernameSnapshot: "astrolog5414",
        capabilities: { canRead: true, canSend: true, canReceive: true },
        consentRecordId: null,
        connectedAt: now,
        lastSyncedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: now,
        updatedAt: now
      });
      await transaction.insert(messagingInstagramGraphAccounts).values({
        id: randomUUID(),
        channelConnectionId,
        instagramUserId: `ig-user-${channelConnectionId}`,
        instagramAppScopedUserId: `app-user-${channelConnectionId}`,
        instagramUsername: "astrolog5414",
        instagramDisplayName: "Astrolog",
        accessTokenEncrypted: encryptedSecretFixture(),
        tokenExpiresAt: new Date("2026-10-17T14:43:23.955Z"),
        createdAt: now,
        updatedAt: now
      });
      await transaction.insert(messagingThreads).values({
        id: threadId,
        astrologerUserId,
        clientUserId: null,
        status: "open",
        lastMessageId: null,
        lastMessageAt: now,
        unreadAstrologerCount: 0,
        createdAt: now,
        updatedAt: now
      });
      await transaction.insert(messagingExternalIdentities).values({
        id: externalIdentityId,
        channelConnectionId,
        provider: "instagram",
        providerUserId: "ig-client-user",
        providerChatId: "ig-client-chat",
        usernameSnapshot: "client",
        displayNameSnapshot: "Client",
        avatarMediaId: null,
        linkedClientUserId: null,
        linkStatus: "unlinked",
        firstSeenAt: now,
        lastSeenAt: now
      });
      await transaction.insert(messagingThreadIdentities).values({
        threadId,
        externalIdentityId,
        provider: "instagram",
        isPrimary: true,
        createdAt: now
      });
      await transaction.insert(messagingMessages).values({
        id: messageId,
        threadId,
        channelConnectionId,
        externalIdentityId,
        direction: "outbound",
        senderKind: "astrologer",
        providerMessageId: null,
        providerUpdateId: null,
        providerSentAt: null,
        contentType: "text",
        text,
        mediaAssetId: null,
        status: "queued",
        failureCode: null,
        idempotencyKey: `delivery-${messageId}`,
        requestHash: sha256(text),
        createdAt: now,
        updatedAt: now
      });
      await transaction.insert(outboxEvents).values({
        id: outboxEventId,
        eventType: messagingMessageDeliveryRequestedEventType,
        aggregateId: messageId,
        payload: {
          messageId,
          threadId,
          channelConnectionId,
          astrologerUserId
        },
        status: "published",
        attempts: 0,
        availableAt: now,
        lockedAt: null,
        publishedAt: now,
        quarantinedAt: null,
        quarantineReasonCode: null,
        lastError: null,
        createdAt: now,
        updatedAt: now
      });
    });

    const store = createDrizzleMessagingDeliveryProcessingStore(runtime.database);
    await expect(store.findByOutboxEventId(outboxEventId)).resolves.toMatchObject({
      outboxEventId,
      messageId,
      messageStatus: "queued",
      provider: "instagram",
      mode: "instagram_graph",
      channelConnectionId,
      astrologerUserId,
      instagramAccountId: `ig-account-${channelConnectionId}`,
      providerChatId: "ig-client-chat",
      text
    });
  });
});

function encryptedSecretFixture() {
  return {
    algorithm: "aes-256-gcm" as const,
    keyId: "test-key",
    iv: "test-iv",
    authTag: "test-auth-tag",
    ciphertext: "test-ciphertext"
  };
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
