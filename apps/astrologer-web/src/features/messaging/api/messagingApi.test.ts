import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeWhatsAppCloudConnection,
  startWhatsAppCloudConnection
} from "./messagingApi";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());

vi.mock("../../../Application", () => ({
  application: { http: { get, post } }
}));

describe("messagingApi WhatsApp Cloud connection commands", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("starts WhatsApp Cloud Embedded Signup with CSRF", async () => {
    post.mockResolvedValueOnce(startResponse);

    await expect(startWhatsAppCloudConnection()).resolves.toEqual(startResponse);
    expect(post).toHaveBeenCalledWith(
      "/messaging/channel-connections/whatsapp/cloud/start",
      undefined,
      { csrf: true }
    );
  });

  it("completes WhatsApp Cloud Embedded Signup with the returned code and session", async () => {
    post.mockResolvedValueOnce(completeResponse);
    const body = {
      state: "state-1",
      code: "code-1",
      session: {
        event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        wabaId: "waba-1"
      }
    };

    await expect(completeWhatsAppCloudConnection(body)).resolves.toEqual(completeResponse);
    expect(post).toHaveBeenCalledWith(
      "/messaging/channel-connections/whatsapp/cloud/complete",
      body,
      { csrf: true }
    );
  });
});

const connection = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "whatsapp",
  mode: "whatsapp_cloud",
  status: "connecting",
  displayName: null,
  username: null,
  capabilities: {
    canSend: false,
    canReceive: false,
    canRead: false,
    supportsHistoryImport: true,
    supportsMessageEdits: false,
    supportsMessageDeletes: false,
    supportsAttachments: false
  },
  connectedAt: null,
  lastSyncedAt: null,
  lastErrorCode: null
} as const;

const startResponse = {
  channelConnection: connection,
  appId: "app-id",
  configurationId: "config-id",
  graphApiVersion: "v26.0",
  state: "state-1"
} as const;

const completeResponse = {
  status: "connected",
  channelConnection: { ...connection, status: "active" },
  code: null
} as const;
