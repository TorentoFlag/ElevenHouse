import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  messagingChannelConnections,
  messagingExternalIdentities,
  messagingInstagramGraphAccounts,
  messagingMessages,
  messagingThreadIdentities,
  messagingThreads,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleMessagingStore } from "./drizzle-messaging-store";

describe.sequential("Drizzle messaging store Instagram Graph webhooks", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("deduplicates owner echoes for outbound messages already sent by ElevenHouse", async () => {
    const fixture = await seedSentInstagramOutboundWithoutIdentity(runtime);

    const store = createDrizzleMessagingStore(runtime.database);
    const result = await store.recordInstagramGraphMessage({
      instagramAccountId: fixture.instagramAccountId,
      providerMessageId: fixture.providerMessageId,
      senderId: fixture.instagramAccountId,
      recipientId: fixture.providerChatId,
      text: fixture.text,
      providerSentAt: "2026-08-18T16:10:04.000Z",
      now: "2026-08-18T16:10:06.000Z"
    });

    expect(result).toMatchObject({
      kind: "duplicate",
      message: {
        id: fixture.messageId,
        externalIdentityId: fixture.externalIdentityId,
        providerMessageId: fixture.providerMessageId,
        status: "sent"
      }
    });

    const rows = await runtime.database
      .select()
      .from(messagingMessages)
      .where(eq(messagingMessages.providerMessageId, fixture.providerMessageId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fixture.messageId);
    expect(rows[0]?.externalIdentityId).toBe(fixture.externalIdentityId);
  });
});

async function seedSentInstagramOutboundWithoutIdentity(runtime: PostgresRuntime) {
  const now = new Date("2026-08-18T16:10:04.000Z");
  const astrologerUserId = randomUUID();
  const threadId = randomUUID();
  const channelConnectionId = randomUUID();
  const externalIdentityId = randomUUID();
  const messageId = randomUUID();
  const instagramAccountId = `ig-account-${channelConnectionId}`;
  const providerChatId = `ig-client-${channelConnectionId}`;
  const providerMessageId = `ig-message-${messageId}`;
  const text = "outbound echo dedupe regression";

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values({ id: astrologerUserId });
    await transaction.insert(messagingChannelConnections).values({
      id: channelConnectionId,
      astrologerUserId,
      provider: "instagram",
      mode: "instagram_graph",
      status: "active",
      externalAccountId: instagramAccountId,
      externalOwnerUserId: instagramAccountId,
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
      instagramUserId: instagramAccountId,
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
      lastMessageId: messageId,
      lastMessageAt: now,
      unreadAstrologerCount: 0,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(messagingExternalIdentities).values({
      id: externalIdentityId,
      channelConnectionId,
      provider: "instagram",
      providerUserId: providerChatId,
      providerChatId,
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
      externalIdentityId: null,
      direction: "outbound",
      senderKind: "astrologer",
      providerMessageId,
      providerUpdateId: null,
      providerSentAt: now,
      contentType: "text",
      text,
      mediaAssetId: null,
      status: "sent",
      failureCode: null,
      idempotencyKey: `delivery-${messageId}`,
      requestHash: sha256(text),
      createdAt: now,
      updatedAt: now
    });
  });

  return {
    externalIdentityId,
    instagramAccountId,
    messageId,
    providerChatId,
    providerMessageId,
    text
  };
}

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
