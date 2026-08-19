import { createHmac } from "node:crypto";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { MessagingWebhooksController } from "./messaging-webhooks.controller";
import type { MessagingService } from "./messaging.service";
import { parseWhatsAppCloudWebhookChanges } from "./whatsapp-cloud-webhook";

const whatsappConfig: NonNullable<AstrologerApiRuntimeConfig["whatsappCloud"]> = {
  enabled: true,
  appId: "app-1",
  appSecret: "app-secret-1",
  configurationId: "configuration-1",
  graphApiBaseUrl: "https://graph.facebook.com/v26.0",
  webhookVerifyToken: "verify-token-1",
  tokenEncryptionKey: Buffer.alloc(32),
  callbackStateTtlSeconds: 30,
  historySyncEnabled: true
};

describe("parseWhatsAppCloudWebhookChanges", () => {
  it("normalizes WhatsApp Business Account message changes", () => {
    const changes = parseWhatsAppCloudWebhookChanges({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  phone_number_id: "phone-1",
                  display_phone_number: "15550783881"
                },
                contacts: [
                  {
                    wa_id: "16505551234",
                    profile: { name: "Client One" }
                  }
                ],
                messages: [
                  {
                    from: "16505551234",
                    id: "wamid.1",
                    timestamp: "1750263773",
                    type: "text",
                    text: { body: "hello" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(changes).toEqual([
      {
        field: "messages",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        displayPhoneNumber: "15550783881",
        accountUpdate: null,
        messages: [
          {
            from: "16505551234",
            id: "wamid.1",
            providerSentAt: "2025-06-18T16:22:53.000Z",
            text: "hello",
            type: "text"
          }
        ],
        echoes: [],
        statuses: [],
        contacts: [{ waId: "16505551234", displayName: "Client One" }],
        syncEvents: []
      }
    ]);
  });

  it("rejects non WhatsApp Business Account webhook payloads", () => {
    expect(() => parseWhatsAppCloudWebhookChanges({ object: "instagram", entry: [] })).toThrow(
      "Invalid WhatsApp Cloud webhook payload"
    );
  });

  it("normalizes SMB message echoes separately from inbound messages", () => {
    const changes = parseWhatsAppCloudWebhookChanges({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "phone-1" },
                message_echoes: [
                  {
                    from: "15550783881",
                    to: "16505551234",
                    id: "wamid.echo.1",
                    timestamp: "1750263774",
                    type: "text",
                    text: { body: "sent from phone" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(changes).toEqual([
      expect.objectContaining({
        field: "smb_message_echoes",
        phoneNumberId: "phone-1",
        messages: [],
        echoes: [
          {
            from: "15550783881",
            to: "16505551234",
            id: "wamid.echo.1",
            providerSentAt: "2025-06-18T16:22:54.000Z",
            text: "sent from phone",
            type: "text"
          }
        ]
      })
    ]);
  });
});

describe("MessagingWebhooksController WhatsApp Cloud boundary", () => {
  it("returns Meta challenge when verify token matches", () => {
    const controller = createController();

    expect(
      controller.verifyWhatsAppCloudWebhook("subscribe", "verify-token-1", "challenge-1")
    ).toBe("challenge-1");
  });

  it("rejects Meta verification with an invalid token", () => {
    const controller = createController();

    expect(() =>
      controller.verifyWhatsAppCloudWebhook("subscribe", "wrong-token", "challenge-1")
    ).toThrow(UnauthorizedException);
  });

  it("rejects invalid HMAC before parsing webhook payload", async () => {
    const controller = createController();

    await expect(
      controller.handleWhatsAppCloudWebhook({ object: "not-whatsapp" }, "sha256=bad", {
        rawBody: Buffer.from("not-json")
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it("parses signed payload and delegates normalized changes", async () => {
    const service = {
      handleWhatsAppCloudWebhookChanges: vi.fn().mockResolvedValue(undefined)
    } as unknown as MessagingService;
    const controller = createController(service);
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "phone-1" },
                messages: [
                  {
                    from: "16505551234",
                    id: "wamid.1",
                    timestamp: "1750263773",
                    type: "text",
                    text: { body: "hello" }
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    const rawBody = Buffer.from(JSON.stringify(body));

    await expect(
      controller.handleWhatsAppCloudWebhook(body, sign(rawBody), { rawBody })
    ).resolves.toEqual({ ok: true });
    expect(service.handleWhatsAppCloudWebhookChanges).toHaveBeenCalledWith([
      expect.objectContaining({ field: "messages", wabaId: "waba-1", phoneNumberId: "phone-1" })
    ]);
  });

  it("rejects invalid signed WhatsApp payload after signature verification", async () => {
    const controller = createController();
    const body = { object: "whatsapp_business_account", entry: [{ id: "waba-1" }] };
    const rawBody = Buffer.from(JSON.stringify(body));

    await expect(
      controller.handleWhatsAppCloudWebhook(body, sign(rawBody), { rawBody })
    ).rejects.toThrow(BadRequestException);
  });
});

function createController(service: MessagingService = {} as MessagingService) {
  return new MessagingWebhooksController(service, {
    get(key: string) {
      if (key === "astrologerApi.whatsappCloud") return whatsappConfig;
      if (key === "astrologerApi.instagramGraph") return null;
      return undefined;
    },
    getOrThrow() {
      return "telegram-secret";
    }
  } as unknown as ConfigService);
}

function sign(rawBody: Buffer) {
  return `sha256=${createHmac("sha256", whatsappConfig.appSecret).update(rawBody).digest("hex")}`;
}
