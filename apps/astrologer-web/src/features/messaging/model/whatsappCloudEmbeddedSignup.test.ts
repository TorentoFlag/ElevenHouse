import { describe, expect, it } from "vitest";
import {
  buildWhatsAppCloudEmbeddedSignupLoginOptions,
  parseWhatsAppCloudEmbeddedSignupMessage
} from "./whatsappCloudEmbeddedSignup";

describe("whatsappCloudEmbeddedSignup model", () => {
  it("builds Coexistence login options for Facebook Login for Business", () => {
    expect(
      buildWhatsAppCloudEmbeddedSignupLoginOptions({
        configurationId: "config-id",
        state: "state-1"
      })
    ).toEqual({
      config_id: "config-id",
      response_type: "code",
      override_default_response_type: true,
      state: "state-1",
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3"
      }
    });
  });

  it("parses the WhatsApp Business App onboarding session message from Meta", () => {
    expect(
      parseWhatsAppCloudEmbeddedSignupMessage({
        origin: "https://www.facebook.com",
        data: JSON.stringify({
          type: "WA_EMBEDDED_SIGNUP",
          event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          data: {
            waba_id: "waba-1",
            phone_number_id: "phone-1",
            business_id: "business-1"
          }
        })
      })
    ).toEqual({
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      businessId: "business-1"
    });
  });

  it("ignores non-Meta origins and unrelated postMessage traffic", () => {
    expect(
      parseWhatsAppCloudEmbeddedSignupMessage({
        origin: "https://evil.example",
        data: JSON.stringify({ type: "WA_EMBEDDED_SIGNUP" })
      })
    ).toBeNull();
    expect(
      parseWhatsAppCloudEmbeddedSignupMessage({
        origin: "https://web.facebook.com",
        data: JSON.stringify({ type: "OTHER" })
      })
    ).toBeNull();
  });
});
