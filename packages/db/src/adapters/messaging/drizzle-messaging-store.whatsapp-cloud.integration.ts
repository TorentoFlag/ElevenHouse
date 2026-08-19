import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
import {
  messagingChannelConnections,
  messagingExternalIdentities,
  messagingMessages,
  messagingProviderWebhookEvents,
  messagingWhatsappCloudAccounts,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleMessagingStore } from "./drizzle-messaging-store";

describe.sequential("Drizzle messaging store WhatsApp Cloud", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("starts and completes a Coexistence phone-number connection", async () => {
    const astrologerUserId = randomUUID();
    const connectionId = randomUUID();
    const store = createDrizzleMessagingStore(runtime.database);

    await runtime.database.insert(users).values({ id: astrologerUserId });

    await expect(
      store.startWhatsAppCloudConnection({
        connectionId,
        astrologerUserId,
        now: "2026-08-18T20:30:00.000Z"
      })
    ).resolves.toEqual({ connectionId });

    await expect(
      store.completeWhatsAppCloudConnection({
        astrologerUserId,
        connectionId,
        wabaId: "waba-1",
        businessId: "business-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "+15550783881",
        verifiedName: "ElevenHouse Test",
        platformType: "CLOUD_API",
        isOnBizApp: true,
        encryptedAccessToken: encryptedSecretFixture(),
        tokenScopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
        connectedVia: "embedded_signup_coexistence",
        tokenIssuedAt: "2026-08-18T20:29:30.000Z",
        tokenExpiresAt: null,
        historySyncStatus: "requested",
        contactSyncStatus: "requested",
        now: "2026-08-18T20:30:01.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    const [connection] = await runtime.database
      .select()
      .from(messagingChannelConnections)
      .where(eq(messagingChannelConnections.id, connectionId));
    expect(connection).toMatchObject({
      provider: "whatsapp",
      mode: "whatsapp_cloud",
      status: "active",
      externalAccountId: "phone-1",
      externalOwnerUserId: "waba-1",
      displayNameSnapshot: "ElevenHouse Test",
      usernameSnapshot: "+15550783881"
    });

    const [account] = await runtime.database
      .select()
      .from(messagingWhatsappCloudAccounts)
      .where(eq(messagingWhatsappCloudAccounts.channelConnectionId, connectionId));
    expect(account).toMatchObject({
      wabaId: "waba-1",
      businessId: "business-1",
      phoneNumberId: "phone-1",
      connectedVia: "embedded_signup_coexistence",
      historySyncStatus: "requested",
      contactSyncStatus: "requested"
    });
  });

  it("updates WhatsApp Cloud sync statuses without changing connection ownership", async () => {
    const store = createDrizzleMessagingStore(runtime.database);
    const { connectionId } = await seedActiveWhatsAppConnection(runtime, store);

    await expect(
      store.updateWhatsAppCloudConnectionSyncStatus({
        astrologerUserId: randomUUID(),
        connectionId,
        historySyncStatus: "failed",
        contactSyncStatus: "failed",
        now: "2026-08-18T20:30:05.000Z"
      })
    ).resolves.toEqual({ kind: "unmatched" });

    await expect(
      store.updateWhatsAppCloudConnectionSyncStatus({
        astrologerUserId: (await runtime.database
          .select({ astrologerUserId: messagingChannelConnections.astrologerUserId })
          .from(messagingChannelConnections)
          .where(eq(messagingChannelConnections.id, connectionId)))[0]?.astrologerUserId ?? "",
        connectionId,
        historySyncStatus: "failed",
        contactSyncStatus: "requested",
        now: "2026-08-18T20:30:06.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    const [account] = await runtime.database
      .select()
      .from(messagingWhatsappCloudAccounts)
      .where(eq(messagingWhatsappCloudAccounts.channelConnectionId, connectionId));
    expect(account).toMatchObject({
      historySyncStatus: "failed",
      contactSyncStatus: "requested"
    });
  });

  it("deduplicates provider webhook events by event key", async () => {
    const event = {
      provider: "whatsapp",
      mode: "whatsapp_cloud",
      eventKey: `whatsapp:message:phone-1:${randomUUID()}`,
      field: "messages",
      externalAccountId: "phone-1",
      externalOwnerUserId: "waba-1",
      normalizedSummary: { messageCount: 1 },
      receivedAt: new Date("2026-08-18T20:30:02.000Z")
    };

    await runtime.database.insert(messagingProviderWebhookEvents).values(event);

    await expect(
      runtime.database.insert(messagingProviderWebhookEvents).values(event)
    ).rejects.toThrow();
  });

  it("marks unmatched provider webhook events ignored with a terminal timestamp", async () => {
    const store = createDrizzleMessagingStore(runtime.database);
    const eventKey = `whatsapp:message:phone-1:${randomUUID()}`;

    await expect(
      store.recordWhatsAppCloudWebhookEvent({
        eventKey,
        field: "messages",
        externalAccountId: "phone-1",
        externalOwnerUserId: "waba-1",
        normalizedSummary: { messageCount: 1 },
        receivedAt: "2026-08-18T20:30:02.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    await expect(
      store.markWhatsAppCloudWebhookEventIgnored({
        eventKey,
        errorCode: "whatsapp_cloud_connection_unmatched",
        errorMessage: "No active WhatsApp Cloud channel connection matched phone_number_id",
        now: "2026-08-18T20:30:03.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    const [event] = await runtime.database
      .select()
      .from(messagingProviderWebhookEvents)
      .where(eq(messagingProviderWebhookEvents.eventKey, eventKey));

    expect(event).toMatchObject({
      processingStatus: "ignored",
      attemptCount: 0,
      lastErrorCode: "whatsapp_cloud_connection_unmatched",
      lastErrorMessage: "No active WhatsApp Cloud channel connection matched phone_number_id",
      processedAt: new Date("2026-08-18T20:30:03.000Z")
    });
  });

  it("marks inline-processed provider webhook events processed with a terminal timestamp", async () => {
    const store = createDrizzleMessagingStore(runtime.database);
    const eventKey = `whatsapp:message:phone-1:${randomUUID()}`;

    await expect(
      store.recordWhatsAppCloudWebhookEvent({
        eventKey,
        field: "messages",
        externalAccountId: "phone-1",
        externalOwnerUserId: "waba-1",
        normalizedSummary: { messageCount: 1 },
        receivedAt: "2026-08-18T20:30:02.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    await expect(
      store.markWhatsAppCloudWebhookEventProcessed({
        eventKey,
        now: "2026-08-18T20:30:03.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    const [event] = await runtime.database
      .select()
      .from(messagingProviderWebhookEvents)
      .where(eq(messagingProviderWebhookEvents.eventKey, eventKey));

    expect(event).toMatchObject({
      processingStatus: "processed",
      attemptCount: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      processedAt: new Date("2026-08-18T20:30:03.000Z")
    });
  });

  it("records inbound WhatsApp messages and deduplicates by provider message id", async () => {
    const store = createDrizzleMessagingStore(runtime.database);
    const { connectionId, phoneNumberId, displayPhoneNumber } =
      await seedActiveWhatsAppConnection(runtime, store);

    await expect(
      store.recordWhatsAppCloudMessage({
        phoneNumberId,
        providerMessageId: "wamid.inbound.1",
        senderWaId: "15551234567",
        recipientWaId: displayPhoneNumber,
        text: "hello",
        providerSentAt: "2026-08-18T20:31:00.000Z",
        now: "2026-08-18T20:31:01.000Z"
      })
    ).resolves.toMatchObject({ kind: "created" });

    await expect(
      store.recordWhatsAppCloudMessage({
        phoneNumberId,
        providerMessageId: "wamid.inbound.1",
        senderWaId: "15551234567",
        recipientWaId: displayPhoneNumber,
        text: "hello again",
        providerSentAt: "2026-08-18T20:31:00.000Z",
        now: "2026-08-18T20:31:02.000Z"
      })
    ).resolves.toMatchObject({ kind: "duplicate" });

    const messages = await runtime.database
      .select()
      .from(messagingMessages)
      .where(eq(messagingMessages.channelConnectionId, connectionId));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: "inbound",
      senderKind: "client",
      providerMessageId: "wamid.inbound.1",
      text: "hello"
    });

    const [identity] = await runtime.database
      .select()
      .from(messagingExternalIdentities)
      .where(eq(messagingExternalIdentities.channelConnectionId, connectionId));
    expect(identity).toMatchObject({
      provider: "whatsapp",
      providerUserId: "15551234567",
      providerChatId: "15551234567"
    });
  });

  it("records status webhook event keys independently from message status updates", async () => {
    const store = createDrizzleMessagingStore(runtime.database);
    const { connectionId, phoneNumberId, wabaId, displayPhoneNumber } =
      await seedActiveWhatsAppConnection(runtime, store);
    const inbound = await store.recordWhatsAppCloudMessage({
      phoneNumberId,
      providerMessageId: "wamid.inbound.status-thread",
      senderWaId: "15557654321",
      recipientWaId: displayPhoneNumber,
      text: "thread opener",
      providerSentAt: "2026-08-18T20:32:00.000Z",
      now: "2026-08-18T20:32:01.000Z"
    });
    if (inbound.kind !== "created") throw new Error("Expected inbound fixture message");

    await runtime.database.insert(messagingMessages).values({
      channelConnectionId: connectionId,
      threadId: inbound.message.threadId,
      externalIdentityId: inbound.message.externalIdentityId,
      direction: "outbound",
      senderKind: "astrologer",
      providerMessageId: "wamid.outbound.1",
      providerSentAt: new Date("2026-08-18T20:32:10.000Z"),
      contentType: "text",
      text: "reply",
      status: "sent",
      idempotencyKey: "whatsapp-status-fixture",
      requestHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });

    await expect(
      store.recordWhatsAppCloudWebhookEvent({
        eventKey: `whatsapp:status:${phoneNumberId}:wamid.outbound.1:delivered:1750263773`,
        field: "messages",
        externalAccountId: phoneNumberId,
        externalOwnerUserId: wabaId,
        normalizedSummary: { status: "delivered" },
        receivedAt: "2026-08-18T20:32:11.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    await expect(
      store.recordWhatsAppCloudWebhookEvent({
        eventKey: `whatsapp:status:${phoneNumberId}:wamid.outbound.1:read:1750263774`,
        field: "messages",
        externalAccountId: phoneNumberId,
        externalOwnerUserId: wabaId,
        normalizedSummary: { status: "read" },
        receivedAt: "2026-08-18T20:32:12.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    await expect(
      store.recordWhatsAppCloudStatus({
        phoneNumberId,
        providerMessageId: "wamid.outbound.1",
        status: "read",
        providerStatusAt: "2026-08-18T20:32:12.000Z",
        failureCode: null,
        now: "2026-08-18T20:32:13.000Z"
      })
    ).resolves.toEqual({ kind: "recorded", updatedCount: 1 });
  });

  it("records WhatsApp Business App echoes as outbound thread messages", async () => {
    const store = createDrizzleMessagingStore(runtime.database);
    const { astrologerUserId, connectionId, phoneNumberId } =
      await seedActiveWhatsAppConnection(runtime, store);

    const created = await store.recordWhatsAppCloudEcho({
      phoneNumberId,
      providerMessageId: "wamid.echo.1",
      senderWaId: "15550783881",
      recipientWaId: "15551234567",
      text: "sent from WhatsApp Business App",
      providerSentAt: "2026-08-18T20:34:00.000Z",
      now: "2026-08-18T20:34:01.000Z"
    });

    expect(created).toMatchObject({
      kind: "created",
      message: {
        channelConnectionId: connectionId,
        direction: "outbound",
        status: "sent",
        providerMessageId: "wamid.echo.1",
        text: "sent from WhatsApp Business App"
      }
    });
    if (created.kind !== "created") throw new Error("Expected echo fixture message");

    await expect(
      store.recordWhatsAppCloudEcho({
        phoneNumberId,
        providerMessageId: "wamid.echo.1",
        senderWaId: "15550783881",
        recipientWaId: "15551234567",
        text: "sent from WhatsApp Business App again",
        providerSentAt: "2026-08-18T20:34:00.000Z",
        now: "2026-08-18T20:34:02.000Z"
      })
    ).resolves.toMatchObject({ kind: "duplicate", message: { id: created.message.id } });

    const messages = await runtime.database
      .select()
      .from(messagingMessages)
      .where(eq(messagingMessages.channelConnectionId, connectionId));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: "outbound",
      senderKind: "astrologer",
      providerMessageId: "wamid.echo.1",
      text: "sent from WhatsApp Business App",
      status: "sent"
    });
    expect(messages[0]?.idempotencyKey).toBe(
      `whatsapp-cloud:${phoneNumberId}:15551234567:wamid.echo.1`
    );
    expect(messages[0]?.requestHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const thread = await store.findThreadForAstrologer({
      astrologerUserId,
      threadId: created.message.threadId
    });
    expect(thread).toMatchObject({
      lastMessageAt: "2026-08-18T20:34:00.000Z",
      unreadAstrologerCount: 0
    });

    const [identity] = await runtime.database
      .select()
      .from(messagingExternalIdentities)
      .where(eq(messagingExternalIdentities.channelConnectionId, connectionId));
    expect(identity).toMatchObject({
      provider: "whatsapp",
      providerUserId: "15551234567",
      providerChatId: "15551234567"
    });
  });

  it("applies WhatsApp account update revocation without reactivating reconnect events", async () => {
    const store = createDrizzleMessagingStore(runtime.database);
    const { connectionId, phoneNumberId, wabaId } = await seedActiveWhatsAppConnection(
      runtime,
      store
    );

    await expect(
      store.recordWhatsAppCloudAccountUpdate({
        wabaId,
        phoneNumberId,
        event: "PARTNER_REMOVED",
        reason: "partner removed",
        eventAt: "2026-08-18T20:33:00.000Z",
        now: "2026-08-18T20:33:01.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    const [revoked] = await runtime.database
      .select()
      .from(messagingChannelConnections)
      .where(eq(messagingChannelConnections.id, connectionId));
    expect(revoked).toMatchObject({
      status: "revoked",
      lastErrorCode: "whatsapp_cloud_partner_removed"
    });

    await expect(
      store.recordWhatsAppCloudAccountUpdate({
        wabaId,
        phoneNumberId,
        event: "ACCOUNT_RECONNECTED",
        reason: null,
        eventAt: "2026-08-18T20:33:30.000Z",
        now: "2026-08-18T20:33:31.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    const [notReactivated] = await runtime.database
      .select()
      .from(messagingChannelConnections)
      .where(eq(messagingChannelConnections.id, connectionId));
    expect(notReactivated?.status).not.toBe("active");
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

async function seedActiveWhatsAppConnection(
  runtime: PostgresRuntime,
  store: ReturnType<typeof createDrizzleMessagingStore>
) {
  const astrologerUserId = randomUUID();
  const connectionId = randomUUID();
  const unique = randomUUID().replaceAll("-", "");
  const wabaId = `waba-${unique}`;
  const phoneNumberId = `phone-${unique}`;
  const displayPhoneNumber = `1555${unique.slice(0, 7)}`;
  await runtime.database.insert(users).values({ id: astrologerUserId });
  await store.startWhatsAppCloudConnection({
    connectionId,
    astrologerUserId,
    now: "2026-08-18T20:30:00.000Z"
  });
  await store.completeWhatsAppCloudConnection({
    astrologerUserId,
    connectionId,
    wabaId,
    businessId: "business-1",
    phoneNumberId,
    displayPhoneNumber,
    verifiedName: "ElevenHouse Test",
    platformType: "CLOUD_API",
    isOnBizApp: true,
    encryptedAccessToken: encryptedSecretFixture(),
    tokenScopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
    connectedVia: "embedded_signup_coexistence",
    tokenIssuedAt: "2026-08-18T20:29:30.000Z",
    tokenExpiresAt: null,
    historySyncStatus: "requested",
    contactSyncStatus: "requested",
    now: "2026-08-18T20:30:01.000Z"
  });
  return { astrologerUserId, connectionId, displayPhoneNumber, phoneNumberId, wabaId };
}
