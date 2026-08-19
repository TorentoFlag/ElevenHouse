import "reflect-metadata";

import { createHmac } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { MessagingController } from "./messaging.controller";
import { MessagingWebhooksController } from "./messaging-webhooks.controller";
import { MessagingService } from "./messaging.service";

const astrologerUserId = "10000000-0000-4000-8000-000000000002";
const connectionId = "10000000-0000-4000-8000-000000000001";
const appSecret = "whatsapp-app-secret";

describe("Messaging WhatsApp Cloud HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let service: {
    startWhatsAppCloudConnection: ReturnType<typeof vi.fn>;
    completeWhatsAppCloudConnection: ReturnType<typeof vi.fn>;
    handleWhatsAppCloudWebhookChanges: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      startWhatsAppCloudConnection: vi.fn().mockResolvedValue({
        appId: "app-id",
        configurationId: "configuration-id",
        graphApiVersion: "v26.0",
        state: "signed-state",
        channelConnection: { id: connectionId, status: "connecting" }
      }),
      completeWhatsAppCloudConnection: vi.fn().mockResolvedValue({
        status: "connected",
        channelConnection: { id: connectionId, status: "active" }
      }),
      handleWhatsAppCloudWebhookChanges: vi.fn().mockResolvedValue(undefined)
    };

    const builder = Test.createTestingModule({
      controllers: [MessagingController, MessagingWebhooksController],
      providers: [
        { provide: MessagingService, useValue: service },
        { provide: Reflector, useValue: new Reflector() },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "astrologerApi.whatsappCloud") {
                return {
                  appId: "app-id",
                  appSecret,
                  configurationId: "configuration-id",
                  graphApiBaseUrl: "https://graph.facebook.com/v26.0",
                  webhookVerifyToken: "verify-token",
                  tokenEncryptionKey: Buffer.alloc(32, 1),
                  callbackStateTtlSeconds: 30,
                  historySyncEnabled: true
                };
              }
              return undefined;
            },
            getOrThrow: (key: string) => {
              if (key === "astrologerApi.sessionCookieName") return "astrologer_session";
              throw new Error(`Unexpected config key ${key}`);
            }
          }
        },
        { provide: AstrologerCsrfTokenService, useValue: { assertValidRequest: vi.fn() } },
        CsrfGuard
      ]
    });

    builder.overrideGuard(AstrologerSessionAuthGuard).useValue({
      canActivate(context: {
        switchToHttp(): { getRequest(): Record<string, unknown> & { headers?: Record<string, string> } };
      }) {
        const request = context.switchToHttp().getRequest();
        request.currentAstrologerAccount = {
          account: { id: astrologerUserId, status: "active", roles: ["astrologer"] }
        };
        if (request.headers?.["x-test-mobile"] !== "0") {
          request.currentMobileSessionId = "test-mobile-session";
        }
        return true;
      }
    });

    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("starts and completes WhatsApp Cloud Embedded Signup through authenticated routes", async () => {
    const started = await jsonRequest("/messaging/channel-connections/whatsapp/cloud/start", {
      method: "POST"
    });

    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      appId: "app-id",
      configurationId: "configuration-id",
      state: "signed-state",
      channelConnection: { id: connectionId }
    });
    expect(service.startWhatsAppCloudConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        currentAstrologerAccount: {
          account: { id: astrologerUserId, status: "active", roles: ["astrologer"] }
        }
      })
    );

    const completeBody = {
      state: "signed-state",
      code: "meta-code",
      session: {
        event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        wabaId: "waba-1"
      }
    };
    const completed = await jsonRequest("/messaging/channel-connections/whatsapp/cloud/complete", {
      method: "POST",
      body: completeBody
    });

    expect(completed.status).toBe(201);
    expect(completed.body).toEqual({
      status: "connected",
      channelConnection: { id: connectionId, status: "active" }
    });
    expect(service.completeWhatsAppCloudConnection).toHaveBeenCalledWith(
      completeBody,
      expect.objectContaining({
        currentAstrologerAccount: {
          account: { id: astrologerUserId, status: "active", roles: ["astrologer"] }
        }
      })
    );
  });

  it("requires the CSRF-protected session boundary for cookie-authenticated start", async () => {
    const rejected = await fetch(
      `${baseUrl}/messaging/channel-connections/whatsapp/cloud/start`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-mobile": "0" }
      }
    );

    expect(rejected.status).toBe(401);
    expect(service.startWhatsAppCloudConnection).not.toHaveBeenCalled();
  });

  it("verifies WhatsApp Cloud webhook challenge and requires a valid raw-body signature", async () => {
    const challenge = await fetch(
      `${baseUrl}/messaging/webhooks/whatsapp/cloud?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-1`
    );
    expect(challenge.status).toBe(200);
    expect(await challenge.text()).toBe("challenge-1");

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
                metadata: {
                  phone_number_id: "phone-1",
                  display_phone_number: "15550783881"
                },
                contacts: [],
                messages: [
                  {
                    id: "wamid.inbound.1",
                    from: "15551234567",
                    timestamp: "1787085060",
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
    const rawBody = JSON.stringify(body);

    const rejected = await fetch(`${baseUrl}/messaging/webhooks/whatsapp/cloud`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=bad" },
      body: rawBody
    });
    expect(rejected.status).toBe(401);
    expect(service.handleWhatsAppCloudWebhookChanges).not.toHaveBeenCalled();

    const accepted = await fetch(`${baseUrl}/messaging/webhooks/whatsapp/cloud`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(rawBody)
      },
      body: rawBody
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true });
    expect(service.handleWhatsAppCloudWebhookChanges).toHaveBeenCalledWith([
      expect.objectContaining({
        field: "messages",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        messages: [
          expect.objectContaining({
            id: "wamid.inbound.1",
            from: "15551234567",
            text: "hello"
          })
        ]
      })
    ]);
  });

  async function jsonRequest(
    path: string,
    options: { readonly method: string; readonly body?: unknown }
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method,
      headers: { "content-type": "application/json", "x-test-mobile": "1" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    return {
      status: response.status,
      body: await response.json()
    };
  }
});

function sign(rawBody: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}
