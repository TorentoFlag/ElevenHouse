import { describe, expect, it, vi } from "vitest";

import type { MessagingStore } from "./messaging-store";
import {
  completeWhatsAppCloudConnection,
  recordWhatsAppCloudAccountUpdate,
  recordWhatsAppCloudMessage,
  recordWhatsAppCloudWebhookEvent,
  startWhatsAppCloudConnection,
  updateWhatsAppCloudConnectionSyncStatus,
  whatsappCloudContactSyncEventKey,
  whatsappCloudEchoEventKey,
  whatsappCloudAccountUpdateEventKey,
  whatsappCloudHistoryChunkEventKey,
  whatsappCloudHistoryMessageEventKey,
  whatsappCloudInboundMessageEventKey,
  whatsappCloudStatusEventKey
} from "./messaging-use-cases";

const now = new Date("2026-08-18T20:30:00.000Z");
const connectionId = "10000000-0000-4000-8000-000000000001";
const astrologerUserId = "10000000-0000-4000-8000-000000000002";

describe("WhatsApp Cloud messaging use cases", () => {
  it("starts a Coexistence WhatsApp Cloud connection", async () => {
    const store = {
      startWhatsAppCloudConnection: vi.fn().mockResolvedValue({ connectionId })
    } as unknown as MessagingStore;

    await expect(
      startWhatsAppCloudConnection({
        store,
        astrologerUserId,
        idGenerator: () => connectionId,
        now
      })
    ).resolves.toEqual({ connectionId });

    expect(store.startWhatsAppCloudConnection).toHaveBeenCalledWith({
      connectionId,
      astrologerUserId,
      now: now.toISOString()
    });
  });

  it("normalizes Coexistence completion input before storing", async () => {
    const encryptedAccessToken = encryptedSecretFixture();
    const store = {
      completeWhatsAppCloudConnection: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;

    await expect(
      completeWhatsAppCloudConnection({
        store,
        astrologerUserId,
        connectionId,
        wabaId: "waba-1",
        businessId: "business-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "+1 555 078 3881",
        verifiedName: "ElevenHouse Test",
        platformType: "CLOUD_API",
        isOnBizApp: true,
        encryptedAccessToken,
        tokenScopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
        tokenIssuedAt: "2026-08-18T20:29:30.000Z",
        tokenExpiresAt: null,
        historySyncStatus: "requested",
        contactSyncStatus: "requested",
        now
      })
    ).resolves.toEqual({ kind: "recorded" });

    expect(store.completeWhatsAppCloudConnection).toHaveBeenCalledWith({
      astrologerUserId,
      connectionId,
      wabaId: "waba-1",
      businessId: "business-1",
      phoneNumberId: "phone-1",
      displayPhoneNumber: "+1 555 078 3881",
      verifiedName: "ElevenHouse Test",
      platformType: "CLOUD_API",
      isOnBizApp: true,
      encryptedAccessToken,
      tokenScopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
      connectedVia: "embedded_signup_coexistence",
      tokenIssuedAt: "2026-08-18T20:29:30.000Z",
      tokenExpiresAt: null,
      historySyncStatus: "requested",
      contactSyncStatus: "requested",
      now: now.toISOString()
    });
  });

  it("rejects unsupported WhatsApp sync statuses", async () => {
    const store = {
      completeWhatsAppCloudConnection: vi.fn()
    } as unknown as MessagingStore;

    await expect(
      completeWhatsAppCloudConnection({
        store,
        astrologerUserId,
        connectionId,
        wabaId: "waba-1",
        businessId: null,
        phoneNumberId: "phone-1",
        displayPhoneNumber: null,
        verifiedName: null,
        platformType: "CLOUD_API",
        isOnBizApp: true,
        encryptedAccessToken: encryptedSecretFixture(),
        tokenScopes: [],
        tokenIssuedAt: null,
        tokenExpiresAt: null,
        historySyncStatus: "retrying" as "requested",
        contactSyncStatus: "requested",
        now
      })
    ).rejects.toThrow("WhatsApp sync status is invalid");
  });

  it("normalizes WhatsApp sync status updates before storing", async () => {
    const store = {
      updateWhatsAppCloudConnectionSyncStatus: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;

    await expect(
      updateWhatsAppCloudConnectionSyncStatus({
        store,
        astrologerUserId,
        connectionId,
        historySyncStatus: "failed",
        contactSyncStatus: "requested",
        now
      })
    ).resolves.toEqual({ kind: "recorded" });

    expect(store.updateWhatsAppCloudConnectionSyncStatus).toHaveBeenCalledWith({
      astrologerUserId,
      connectionId,
      historySyncStatus: "failed",
      contactSyncStatus: "requested",
      now: now.toISOString()
    });
  });

  it("builds deterministic WhatsApp webhook event keys", () => {
    expect(
      whatsappCloudInboundMessageEventKey({ phoneNumberId: "phone-1", messageId: "wamid.1" })
    ).toBe("whatsapp:message:phone-1:wamid.1");
    expect(
      whatsappCloudStatusEventKey({
        phoneNumberId: "phone-1",
        messageId: "wamid.1",
        status: "delivered",
        timestamp: "1750263773"
      })
    ).toBe("whatsapp:status:phone-1:wamid.1:delivered:1750263773");
    expect(
      whatsappCloudAccountUpdateEventKey({
        wabaId: "waba-1",
        phoneNumberId: null,
        event: "PARTNER_REMOVED",
        timestampOrReasonHash: "reason-1"
      })
    ).toBe("whatsapp:account-update:waba-1:none:PARTNER_REMOVED:reason-1");
    expect(
      whatsappCloudEchoEventKey({ phoneNumberId: "phone-1", messageId: "wamid.2" })
    ).toBe("whatsapp:echo:phone-1:wamid.2:smb_message_echoes");
    expect(
      whatsappCloudHistoryChunkEventKey({
        wabaId: "waba-1",
        phoneNumberId: null,
        phase: "initial",
        chunkOrder: "0001"
      })
    ).toBe("whatsapp:history-chunk:waba-1:unknown:initial:0001");
    expect(
      whatsappCloudHistoryMessageEventKey({
        phoneNumberId: "phone-1",
        threadOrWaId: "15551234567",
        messageId: "wamid.3",
        directionOrSource: "inbound"
      })
    ).toBe("whatsapp:history-message:phone-1:15551234567:wamid.3:inbound");
    expect(
      whatsappCloudContactSyncEventKey({
        phoneNumberId: "phone-1",
        contactWaIdOrPhone: "15551234567",
        action: "upsert",
        timestamp: "1750263773"
      })
    ).toBe("whatsapp:contact-sync:phone-1:15551234567:upsert:1750263773");
  });

  it("normalizes WhatsApp live message input before storing", async () => {
    const store = {
      recordWhatsAppCloudMessage: vi.fn().mockResolvedValue({ kind: "unmatched" })
    } as unknown as MessagingStore;

    await expect(
      recordWhatsAppCloudMessage({
        store,
        phoneNumberId: " phone-1 ",
        providerMessageId: " wamid.1 ",
        senderWaId: "15551234567",
        recipientWaId: "15550783881",
        text: "hello",
        providerSentAt: "2026-08-18T20:30:00.000Z",
        now
      })
    ).resolves.toEqual({ kind: "unmatched" });

    expect(store.recordWhatsAppCloudMessage).toHaveBeenCalledWith({
      phoneNumberId: "phone-1",
      providerMessageId: "wamid.1",
      senderWaId: "15551234567",
      recipientWaId: "15550783881",
      text: "hello",
      providerSentAt: "2026-08-18T20:30:00.000Z",
      now: now.toISOString()
    });
  });

  it("normalizes WhatsApp webhook event capture before storing", async () => {
    const store = {
      recordWhatsAppCloudWebhookEvent: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;

    await expect(
      recordWhatsAppCloudWebhookEvent({
        store,
        eventKey: "whatsapp:message:phone-1:wamid.1",
        field: "messages",
        externalAccountId: "phone-1",
        externalOwnerUserId: "waba-1",
        normalizedSummary: { messageCount: 1 },
        receivedAt: "2026-08-18T20:30:00.000Z"
      })
    ).resolves.toEqual({ kind: "recorded" });

    expect(store.recordWhatsAppCloudWebhookEvent).toHaveBeenCalledWith({
      eventKey: "whatsapp:message:phone-1:wamid.1",
      field: "messages",
      externalAccountId: "phone-1",
      externalOwnerUserId: "waba-1",
      normalizedSummary: { messageCount: 1 },
      receivedAt: "2026-08-18T20:30:00.000Z"
    });
  });

  it("normalizes WhatsApp account updates before storing", async () => {
    const store = {
      recordWhatsAppCloudAccountUpdate: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;

    await expect(
      recordWhatsAppCloudAccountUpdate({
        store,
        wabaId: "waba-1",
        phoneNumberId: null,
        event: "PARTNER_REMOVED",
        reason: "removed by owner",
        eventAt: "2026-08-18T20:30:00.000Z",
        now
      })
    ).resolves.toEqual({ kind: "recorded" });

    expect(store.recordWhatsAppCloudAccountUpdate).toHaveBeenCalledWith({
      wabaId: "waba-1",
      phoneNumberId: null,
      event: "PARTNER_REMOVED",
      reason: "removed by owner",
      eventAt: "2026-08-18T20:30:00.000Z",
      now: now.toISOString()
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
