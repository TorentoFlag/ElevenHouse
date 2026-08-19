import { describe, expect, it } from "vitest";

import {
  CompleteWhatsAppCloudConnectionBodySchema,
  CompleteWhatsAppCloudConnectionResponseSchema,
  MessagingChannelConnectionSchema,
  MessagingChannelModeSchema,
  MessagingThreadSchema,
  MessagingProviderSchema,
  StartWhatsAppCloudConnectionResponseSchema
} from "./messaging";

describe("messaging contracts WhatsApp Cloud", () => {
  it("accepts WhatsApp provider and Cloud mode", () => {
    expect(MessagingProviderSchema.parse("whatsapp")).toBe("whatsapp");
    expect(MessagingChannelModeSchema.parse("whatsapp_cloud")).toBe("whatsapp_cloud");
  });

  it("parses WhatsApp channel connection responses", () => {
    expect(
      MessagingChannelConnectionSchema.parse({
        id: "10000000-0000-4000-8000-000000000001",
        provider: "whatsapp",
        mode: "whatsapp_cloud",
        status: "active",
        displayName: "ElevenHouse Test",
        username: "+15550783881",
        capabilities: {
          canSend: true,
          canReceive: true,
          canRead: true,
          supportsHistoryImport: true,
          supportsMessageEdits: false,
          supportsMessageDeletes: false,
          supportsAttachments: false
        },
        connectedAt: "2026-08-18T20:30:00.000Z",
        lastSyncedAt: "2026-08-18T20:30:00.000Z",
        lastErrorCode: null
      })
    ).toMatchObject({ provider: "whatsapp", mode: "whatsapp_cloud" });
  });

  it("parses WhatsApp Embedded Signup start and complete contracts", () => {
    expect(
      StartWhatsAppCloudConnectionResponseSchema.parse({
        channelConnection: whatsappConnection(),
        appId: "app-id",
        configurationId: "config-id",
        graphApiVersion: "v26.0",
        state: "state"
      })
    ).toMatchObject({ appId: "app-id", configurationId: "config-id" });

    expect(
      CompleteWhatsAppCloudConnectionBodySchema.parse({
        state: "state",
        code: "code",
        session: {
          event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          wabaId: "waba-1"
        }
      })
    ).toMatchObject({ session: { wabaId: "waba-1" } });

    expect(
      CompleteWhatsAppCloudConnectionResponseSchema.parse({
        status: "connected",
        channelConnection: whatsappConnection(),
        code: null
      })
    ).toMatchObject({ status: "connected" });
  });
});

describe("messaging thread client snapshot contract", () => {
  it("parses the linked CRM client summary with the thread", () => {
    expect(
      MessagingThreadSchema.parse({
        id: "10000000-0000-4000-8000-000000000010",
        clientUserId: "10000000-0000-4000-8000-000000000020",
        linkedClient: {
          userId: "10000000-0000-4000-8000-000000000020",
          displayName: "QA Inbox Client",
          birthDate: "1991-04-03"
        },
        status: "open",
        primaryIdentity: null,
        lastMessage: null,
        lastMessageAt: null,
        unreadCount: 0,
        createdAt: "2026-08-19T12:00:00.000Z",
        updatedAt: "2026-08-19T12:00:00.000Z"
      })
    ).toMatchObject({
      clientUserId: "10000000-0000-4000-8000-000000000020",
      linkedClient: {
        displayName: "QA Inbox Client",
        birthDate: "1991-04-03"
      }
    });
  });
});

function whatsappConnection() {
  return {
    id: "10000000-0000-4000-8000-000000000001",
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
