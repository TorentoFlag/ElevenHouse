import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { MessagingReadStore, MessagingStore } from "@elevenhouse/domain";
import { MessagingService } from "./messaging.service";
import type { WhatsAppCloudAuthProvider } from "./whatsapp-cloud-auth-provider";

const astrologerUserId = "10000000-0000-4000-8000-000000000002";
const connectionId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-18T20:30:00.000Z");

describe("MessagingService WhatsApp Cloud Embedded Signup", () => {
  it("starts a signed WhatsApp Cloud connection", async () => {
    const store = {
      startWhatsAppCloudConnection: vi.fn().mockResolvedValue({ connectionId })
    } as unknown as MessagingStore;
    const service = createService({ store });

    await expect(service.startWhatsAppCloudConnection(session())).resolves.toMatchObject({
      appId: "app-id",
      configurationId: "config-id",
      graphApiVersion: "v26.0",
      channelConnection: { id: connectionId },
      state: expect.any(String)
    });
  });

  it("ignores unsuccessful WhatsApp onboarding events without exchanging code", async () => {
    const authProvider = {
      exchangeCode: vi.fn()
    } as unknown as WhatsAppCloudAuthProvider;
    const service = createService({ authProvider });
    const start = await service.startWhatsAppCloudConnection(session());

    await expect(
      service.completeWhatsAppCloudConnection(
        {
          state: start.state,
          code: "code-1",
          session: { event: "CANCEL" }
        },
        session()
      )
    ).resolves.toEqual({
      status: "ignored",
      channelConnection: null,
      code: "whatsapp_cloud_onboarding_not_finished"
    });
    expect(authProvider.exchangeCode).not.toHaveBeenCalled();
  });

  it("completes Coexistence onboarding with only waba_id from the browser session", async () => {
    const store = {
      startWhatsAppCloudConnection: vi.fn().mockResolvedValue({ connectionId }),
      completeWhatsAppCloudConnection: vi.fn().mockResolvedValue({ kind: "recorded" }),
      updateWhatsAppCloudConnectionSyncStatus: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;
    const authProvider = {
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: "token",
        grantedScopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
        expiresAt: null
      }),
      resolvePhoneNumber: vi.fn().mockResolvedValue({
        wabaId: "waba-1",
        businessId: "business-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "+15550783881",
        verifiedName: "ElevenHouse",
        platformType: "CLOUD_API",
        isOnBizApp: true
      }),
      subscribeWabaToWebhooks: vi.fn().mockResolvedValue(undefined),
      requestSmbAppDataSync: vi.fn().mockResolvedValue({ requestId: "request-1" })
    } satisfies WhatsAppCloudAuthProvider;
    const service = createService({ store, authProvider });
    const start = await service.startWhatsAppCloudConnection(session());

    await expect(
      service.completeWhatsAppCloudConnection(
        {
          state: start.state,
          code: "code-1",
          session: {
            event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
            wabaId: "waba-1"
          }
        },
        session()
      )
    ).resolves.toMatchObject({ status: "connected", channelConnection: { id: connectionId } });

    expect(authProvider.resolvePhoneNumber).toHaveBeenCalledWith({
      accessToken: "token",
      wabaId: "waba-1",
      phoneNumberId: undefined
    });
    expect(store.completeWhatsAppCloudConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        connectionId,
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        historySyncStatus: "requested",
        contactSyncStatus: "requested"
      })
    );
  });

  it("persists the WhatsApp connection when best-effort sync requests fail", async () => {
    const store = {
      startWhatsAppCloudConnection: vi.fn().mockResolvedValue({ connectionId }),
      completeWhatsAppCloudConnection: vi.fn().mockResolvedValue({ kind: "recorded" }),
      updateWhatsAppCloudConnectionSyncStatus: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;
    const authProvider = {
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: "token",
        grantedScopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
        expiresAt: null
      }),
      resolvePhoneNumber: vi.fn().mockResolvedValue({
        wabaId: "waba-1",
        businessId: "business-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "+15550783881",
        verifiedName: "ElevenHouse",
        platformType: "CLOUD_API",
        isOnBizApp: true
      }),
      subscribeWabaToWebhooks: vi.fn().mockResolvedValue(undefined),
      requestSmbAppDataSync: vi.fn().mockRejectedValue(new Error("Meta sync temporarily unavailable"))
    } satisfies WhatsAppCloudAuthProvider;
    const service = createService({ store, authProvider });
    const start = await service.startWhatsAppCloudConnection(session());

    await expect(
      service.completeWhatsAppCloudConnection(
        {
          state: start.state,
          code: "code-1",
          session: {
            event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
            wabaId: "waba-1"
          }
        },
        session()
      )
    ).resolves.toMatchObject({ status: "connected", channelConnection: { id: connectionId } });

    expect(store.completeWhatsAppCloudConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        historySyncStatus: "requested",
        contactSyncStatus: "requested"
      })
    );
    expect(store.updateWhatsAppCloudConnectionSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        historySyncStatus: "failed",
        contactSyncStatus: "failed"
      })
    );
    expect(authProvider.requestSmbAppDataSync).toHaveBeenCalledTimes(2);
  });

  it("deduplicates WhatsApp webhook messages and preserves separate status event keys", async () => {
    const store = {
      recordWhatsAppCloudWebhookEvent: vi
        .fn()
        .mockResolvedValueOnce({ kind: "recorded" })
        .mockResolvedValueOnce({ kind: "duplicate" })
        .mockResolvedValueOnce({ kind: "recorded" })
        .mockResolvedValueOnce({ kind: "recorded" }),
      recordWhatsAppCloudMessage: vi.fn().mockResolvedValue({ kind: "unmatched" }),
      markWhatsAppCloudWebhookEventIgnored: vi.fn().mockResolvedValue({ kind: "recorded" }),
      markWhatsAppCloudWebhookEventProcessed: vi.fn().mockResolvedValue({ kind: "recorded" }),
      recordWhatsAppCloudStatus: vi
        .fn()
        .mockResolvedValue({ kind: "recorded", updatedCount: 1 })
    } as unknown as MessagingStore;
    const service = createService({ store });

    await service.handleWhatsAppCloudWebhookChanges([
      {
        field: "messages",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "15550783881",
        contacts: [],
        messages: [
          {
            id: "wamid.inbound.1",
            from: "15551234567",
            type: "text",
            text: "hello",
            providerSentAt: "2026-08-18T20:31:00.000Z"
          },
          {
            id: "wamid.inbound.1",
            from: "15551234567",
            type: "text",
            text: "hello again",
            providerSentAt: "2026-08-18T20:31:00.000Z"
          }
        ],
        echoes: [],
        statuses: [
          {
            id: "wamid.outbound.1",
            status: "delivered",
            recipientId: "15551234567",
            providerSentAt: "2026-08-18T20:32:00.000Z"
          },
          {
            id: "wamid.outbound.1",
            status: "read",
            recipientId: "15551234567",
            providerSentAt: "2026-08-18T20:32:01.000Z"
          }
        ],
        accountUpdate: null,
        syncEvents: []
      }
    ]);

    expect(store.recordWhatsAppCloudMessage).toHaveBeenCalledTimes(1);
    expect(store.recordWhatsAppCloudStatus).toHaveBeenCalledTimes(2);
    expect(store.markWhatsAppCloudWebhookEventIgnored).toHaveBeenCalledWith({
      eventKey: "whatsapp:message:phone-1:wamid.inbound.1",
      errorCode: "whatsapp_cloud_connection_unmatched",
      errorMessage: "No active WhatsApp Cloud channel connection matched phone_number_id",
      now: now.toISOString()
    });
    expect(store.markWhatsAppCloudWebhookEventProcessed).toHaveBeenCalledTimes(2);
    expect(store.markWhatsAppCloudWebhookEventProcessed).toHaveBeenNthCalledWith(1, {
      eventKey: "whatsapp:status:phone-1:wamid.outbound.1:delivered:1787085120000",
      now: now.toISOString()
    });
    expect(store.markWhatsAppCloudWebhookEventProcessed).toHaveBeenNthCalledWith(2, {
      eventKey: "whatsapp:status:phone-1:wamid.outbound.1:read:1787085121000",
      now: now.toISOString()
    });
    expect(store.recordWhatsAppCloudWebhookEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        eventKey: "whatsapp:status:phone-1:wamid.outbound.1:delivered:1787085120000"
      })
    );
    expect(store.recordWhatsAppCloudWebhookEvent).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        eventKey: "whatsapp:status:phone-1:wamid.outbound.1:read:1787085121000"
      })
    );
  });

  it("marks a matched WhatsApp message webhook processed after recording the inbox message", async () => {
    const store = {
      recordWhatsAppCloudWebhookEvent: vi.fn().mockResolvedValue({ kind: "recorded" }),
      recordWhatsAppCloudMessage: vi.fn().mockResolvedValue({ kind: "created" }),
      markWhatsAppCloudWebhookEventProcessed: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;
    const service = createService({ store });

    await service.handleWhatsAppCloudWebhookChanges([
      {
        field: "messages",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "15550783881",
        contacts: [],
        messages: [
          {
            id: "wamid.inbound.processed",
            from: "15551234567",
            type: "text",
            text: "hello",
            providerSentAt: "2026-08-18T20:31:00.000Z"
          }
        ],
        echoes: [],
        statuses: [],
        accountUpdate: null,
        syncEvents: []
      }
    ]);

    expect(store.markWhatsAppCloudWebhookEventProcessed).toHaveBeenCalledWith({
      eventKey: "whatsapp:message:phone-1:wamid.inbound.processed",
      now: now.toISOString()
    });
  });

  it("durably records WhatsApp SMB echoes before mirroring outbound messages", async () => {
    const store = {
      recordWhatsAppCloudWebhookEvent: vi.fn().mockResolvedValue({ kind: "recorded" }),
      recordWhatsAppCloudEcho: vi.fn().mockResolvedValue({ kind: "created" }),
      markWhatsAppCloudWebhookEventProcessed: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;
    const service = createService({ store });

    await service.handleWhatsAppCloudWebhookChanges([
      {
        field: "smb_message_echoes",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "15550783881",
        contacts: [],
        messages: [],
        statuses: [],
        echoes: [
          {
            id: "wamid.echo.1",
            from: "15550783881",
            to: "15551234567",
            type: "text",
            text: "sent from phone",
            providerSentAt: "2026-08-18T20:33:00.000Z"
          }
        ],
        accountUpdate: null,
        syncEvents: []
      }
    ]);

    expect(store.recordWhatsAppCloudWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "whatsapp:echo:phone-1:wamid.echo.1:smb_message_echoes",
        field: "smb_message_echoes",
        normalizedSummary: {
          messageId: "wamid.echo.1",
          type: "text",
          hasText: true,
          recipientWaId: "15551234567"
        }
      })
    );
    expect(store.recordWhatsAppCloudEcho).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumberId: "phone-1",
        providerMessageId: "wamid.echo.1",
        senderWaId: "15550783881",
        recipientWaId: "15551234567",
        text: "sent from phone",
        providerSentAt: "2026-08-18T20:33:00.000Z"
      })
    );
    expect(store.markWhatsAppCloudWebhookEventProcessed).toHaveBeenCalledWith({
      eventKey: "whatsapp:echo:phone-1:wamid.echo.1:smb_message_echoes",
      now: now.toISOString()
    });
  });

  it("durably records WhatsApp history and contact sync events for async processing", async () => {
    const store = {
      recordWhatsAppCloudWebhookEvent: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore;
    const service = createService({ store });

    await service.handleWhatsAppCloudWebhookChanges([
      {
        field: "history",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "15550783881",
        contacts: [],
        messages: [],
        statuses: [],
        echoes: [],
        accountUpdate: null,
        syncEvents: [
          {
            kind: "history",
            keyPart: "chunk-1",
            action: "initial",
            timestamp: "2026-08-18T20:35:00.000Z",
            summary: { itemCount: 2, hasMessages: true }
          }
        ]
      },
      {
        field: "smb_app_state_sync",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "15550783881",
        contacts: [],
        messages: [],
        statuses: [],
        echoes: [],
        accountUpdate: null,
        syncEvents: [
          {
            kind: "contact_sync",
            keyPart: "15551234567",
            action: "upsert",
            timestamp: "2026-08-18T20:36:00.000Z",
            summary: { hasContact: true }
          }
        ]
      }
    ]);

    expect(store.recordWhatsAppCloudWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "whatsapp:history-chunk:waba-1:phone-1:initial:chunk-1",
        field: "history",
        externalAccountId: "phone-1",
        externalOwnerUserId: "waba-1",
        normalizedSummary: {
          action: "initial",
          kind: "history",
          timestamp: "2026-08-18T20:35:00.000Z",
          itemCount: 2,
          hasMessages: true
        }
      })
    );
    expect(store.recordWhatsAppCloudWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "whatsapp:contact-sync:phone-1:15551234567:upsert:1787085360000",
        field: "smb_app_state_sync",
        externalAccountId: "phone-1",
        externalOwnerUserId: "waba-1",
        normalizedSummary: {
          action: "upsert",
          kind: "contact_sync",
          timestamp: "2026-08-18T20:36:00.000Z",
          hasContact: true
        }
      })
    );
  });
});

function createService(input: {
  readonly store?: MessagingStore;
  readonly authProvider?: WhatsAppCloudAuthProvider | null;
} = {}) {
  const store =
    input.store ??
    ({
      startWhatsAppCloudConnection: vi.fn().mockResolvedValue({ connectionId }),
      completeWhatsAppCloudConnection: vi.fn().mockResolvedValue({ kind: "recorded" })
    } as unknown as MessagingStore);
  const readStore = {
    listChannelConnections: vi.fn().mockResolvedValue({
      channelConnections: [whatsappConnection()]
    })
  } as unknown as MessagingReadStore;
  return new MessagingService(
    store,
    readStore,
    null,
    null,
    null,
    input.authProvider ?? null,
    {} as never,
    { now: () => now },
    new ConfigService({
      astrologerApi: {
        whatsappCloud: {
          enabled: true,
          appId: "app-id",
          appSecret: "app-secret",
          configurationId: "config-id",
          graphApiBaseUrl: "https://graph.facebook.com/v26.0",
          webhookVerifyToken: "verify",
          tokenEncryptionKey: Buffer.alloc(32, 1),
          callbackStateTtlSeconds: 30,
          historySyncEnabled: true
        }
      }
    })
  );
}

function session() {
  return {
    currentAstrologerAccount: {
      account: { id: astrologerUserId, status: "active" as const, roles: ["astrologer" as const] }
    }
  };
}

function whatsappConnection() {
  return {
    id: connectionId,
    provider: "whatsapp",
    mode: "whatsapp_cloud",
    status: "active",
    displayName: "ElevenHouse",
    username: "+15550783881",
    connectedAt: "2026-08-18T20:30:00.000Z",
    lastSyncedAt: "2026-08-18T20:30:00.000Z",
    lastErrorCode: null,
    capabilities: {
      canSend: true,
      canReceive: true,
      canRead: true,
      supportsHistoryImport: true,
      supportsMessageEdits: false,
      supportsMessageDeletes: false,
      supportsAttachments: false
    }
  };
}
