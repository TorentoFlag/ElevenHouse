import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  clientAstrologerRelationships,
  clientBirthData,
  clientProfiles,
  messagingChannelConnections,
  messagingExternalIdentities,
  messagingThreadIdentities,
  messagingThreads,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleMessagingReadStore } from "./drizzle-messaging-read-store";

describe.sequential("Drizzle messaging read store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("returns the linked CRM client summary with linked threads", async () => {
    const fixture = await seedLinkedMessagingThread(runtime);
    const store = createDrizzleMessagingReadStore(runtime.database);

    await expect(
      store.getThread({
        astrologerUserId: fixture.astrologerUserId,
        threadId: fixture.threadId,
        offset: 0
      })
    ).resolves.toMatchObject({
      thread: {
        id: fixture.threadId,
        clientUserId: fixture.clientUserId,
        linkedClient: {
          userId: fixture.clientUserId,
          displayName: "QA Inbox Client",
          birthDate: "1991-04-03"
        }
      }
    });

    await expect(
      store.listThreads({
        astrologerUserId: fixture.astrologerUserId,
        limit: 50,
        offset: 0
      })
    ).resolves.toMatchObject({
      threads: [
        {
          id: fixture.threadId,
          linkedClient: {
            userId: fixture.clientUserId,
            displayName: "QA Inbox Client",
            birthDate: "1991-04-03"
          }
        }
      ]
    });
  });
});

async function seedLinkedMessagingThread(runtime: PostgresRuntime) {
  const now = new Date("2026-08-19T12:00:00.000Z");
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const threadId = randomUUID();
  const channelConnectionId = randomUUID();
  const externalIdentityId = randomUUID();

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([{ id: astrologerUserId }, { id: clientUserId }]);
    await transaction.insert(clientProfiles).values({
      userId: clientUserId,
      displayNameSnapshot: "QA Inbox Client",
      preferredLocale: "ru",
      timezone: "Europe/Moscow",
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(clientBirthData).values({
      clientUserId,
      label: null,
      birthDate: "1991-04-03",
      birthTime: null,
      birthTimePrecision: "unknown",
      birthPlaceText: null,
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: null,
      birthTimeDstOccurrence: null,
      birthLatitude: null,
      birthLongitude: null,
      source: "manual",
      revision: 1,
      lastEditedByUserId: astrologerUserId,
      lastEditedByRole: "astrologer",
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(clientAstrologerRelationships).values({
      clientUserId,
      astrologerUserId,
      source: "manual",
      status: "active",
      firstLinkedAt: now,
      lastLinkedAt: now,
      archivedAt: null,
      blockedAt: null,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(messagingChannelConnections).values({
      id: channelConnectionId,
      astrologerUserId,
      provider: "instagram",
      mode: "instagram_graph",
      status: "active",
      externalAccountId: `ig-account-${channelConnectionId}`,
      externalOwnerUserId: `ig-owner-${channelConnectionId}`,
      displayNameSnapshot: "Astrolog",
      usernameSnapshot: "astrolog",
      capabilities: { canRead: true, canSend: true, canReceive: true },
      consentRecordId: null,
      connectedAt: now,
      lastSyncedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(messagingThreads).values({
      id: threadId,
      astrologerUserId,
      clientUserId,
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
      providerUserId: `ig-client-${clientUserId}`,
      providerChatId: `ig-chat-${clientUserId}`,
      usernameSnapshot: null,
      displayNameSnapshot: null,
      avatarMediaId: null,
      linkedClientUserId: clientUserId,
      linkStatus: "linked",
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
  });

  return { astrologerUserId, clientUserId, threadId };
}
