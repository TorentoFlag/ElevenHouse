import type { TelegramMtprotoLoginResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  createInitialTelegramMtprotoWizardState,
  deriveTelegramMtprotoWizardState,
  isTelegramMtprotoPhoneStepSubmittable
} from "./telegramMtprotoConnectionWizard";

describe("telegramMtprotoConnectionWizard", () => {
  it("requires an explicit consent before the phone step can start", () => {
    expect(isTelegramMtprotoPhoneStepSubmittable("+78005553535", false)).toBe(false);
    expect(isTelegramMtprotoPhoneStepSubmittable("", true)).toBe(false);
    expect(isTelegramMtprotoPhoneStepSubmittable("+78005553535", true)).toBe(true);
  });

  it("derives the next UI step from Telegram MTProto login response", () => {
    expect(createInitialTelegramMtprotoWizardState()).toEqual({
      step: "phone",
      channelConnectionId: null,
      maskedPhoneNumber: null,
      retryAfterSeconds: null
    });

    expect(deriveTelegramMtprotoWizardState(response("code_required"))).toEqual({
      step: "code",
      channelConnectionId: "55555555-5555-4555-8555-555555555555",
      maskedPhoneNumber: "+7******3535",
      retryAfterSeconds: null
    });
    expect(deriveTelegramMtprotoWizardState(response("password_required"))).toEqual({
      step: "password",
      channelConnectionId: "55555555-5555-4555-8555-555555555555",
      maskedPhoneNumber: "+7******3535",
      retryAfterSeconds: null
    });
    expect(deriveTelegramMtprotoWizardState(response("connected"))).toEqual({
      step: "connected",
      channelConnectionId: "55555555-5555-4555-8555-555555555555",
      maskedPhoneNumber: "+7******3535",
      retryAfterSeconds: null
    });
  });
});

function response(
  loginStep: TelegramMtprotoLoginResponse["loginStep"]
): TelegramMtprotoLoginResponse {
  return {
    channelConnection: {
      id: "55555555-5555-4555-8555-555555555555",
      provider: "telegram",
      mode: "telegram_mtproto_account",
      status: loginStep === "connected" ? "active" : "connecting",
      displayName: "Telegram account",
      username: null,
      capabilities: {
        canRead: true,
        canReceive: true,
        canSend: true,
        supportsAttachments: true,
        supportsHistoryImport: false,
        supportsMessageDeletes: true,
        supportsMessageEdits: true
      },
      connectedAt: loginStep === "connected" ? "2026-07-28T10:00:00.000Z" : null,
      lastSyncedAt: null,
      lastErrorCode: null
    },
    loginStep,
    maskedPhoneNumber: "+7******3535",
    retryAfterSeconds: null
  };
}
