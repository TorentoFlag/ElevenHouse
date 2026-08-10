import { describe, expect, it } from "vitest";

import {
  areHostedCardFieldsReady,
  needsProviderStatusPolling,
  resolveBuyerContact,
  toBrowserInfoRequest
} from "./tariffPaymentWorkflowModel";
import * as tariffPaymentWorkflowModel from "./tariffPaymentWorkflowModel";

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

  it("uses ElevenHouse styling inside ArcPay hosted card iframes", () => {
    expect(tariffPaymentWorkflowModel.hostedCardFieldsAppearance).toEqual({
      theme: "none",
      variables: {
        fontFamily: '"Onest", system-ui, -apple-system, sans-serif',
        fontSize: "15px",
        lineHeight: "24px",
        colorText: "#eceaf7",
        colorPlaceholder: "#6f6a93",
        colorDanger: "#f47a7a",
        colorSuccess: "#4ec8a0",
        colorBackground: "#171432",
        caretColor: "#f4c430"
      },
      rules: {
        focus: { "font-weight": "500" },
        invalid: { color: "#f47a7a" },
        complete: { color: "#eceaf7" }
      }
    });
  });

  it("keeps tokenization disabled until ArcPay confirms every secure field", () => {
    expect(areHostedCardFieldsReady({ cardNumber: true, cardExpiry: true, cardCvv: false })).toBe(false);
    expect(areHostedCardFieldsReady({ cardNumber: true, cardExpiry: true, cardCvv: true })).toBe(true);
  });

  it("uses an authenticated buyer's email or phone without inventing a receipt contact", () => {
    expect(resolveBuyerContact("  billing@example.com ")).toEqual({
      kind: "email",
      value: "billing@example.com"
    });
    expect(resolveBuyerContact("+7 (999) 000-00-00")).toEqual({
      kind: "phone",
      value: "+79990000000"
    });
    expect(resolveBuyerContact("not-a-contact")).toBeNull();
  });
});
