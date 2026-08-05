import { describe, expect, it } from "vitest";

import { needsProviderStatusPolling, toBrowserInfoRequest } from "./tariffPaymentWorkflowModel";

describe("tariff payment workflow model", () => {
  it("maps ArcPay browser facts into the server contract without manufacturing values", () => {
    expect(toBrowserInfoRequest({
      accept_header: "text/html",
      language: "ru-RU",
      screen_width: 1440,
      screen_height: 900,
      color_depth: 24,
      timezone_offset_minutes: -180,
      user_agent: "browser"
    })).toEqual({
      acceptHeader: "text/html",
      language: "ru-RU",
      screenWidth: 1440,
      screenHeight: 900,
      colorDepth: 24,
      timezoneOffsetMinutes: -180,
      userAgent: "browser"
    });
  });

  it("polls only while a provider outcome can still change the server state", () => {
    expect(needsProviderStatusPolling({ nextAction: "initial_payment_pending" } as never, null)).toBe(true);
    expect(needsProviderStatusPolling(null, { nextAction: "complete_3ds" } as never)).toBe(false);
  });
});
