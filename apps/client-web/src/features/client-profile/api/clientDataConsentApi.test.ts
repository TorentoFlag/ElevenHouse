import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalChartAiConsentNotices,
  chartAiConsentNoticeSha256ByLocale,
  chartAiConsentPolicyVersion
} from "@elevenhouse/contracts";
import { application } from "../../../Application";
import {
  getClientDataConsents,
  grantClientChartAiConsent,
  revokeClientDataConsent
} from "./clientDataConsentApi";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const consentId = "44444444-4444-4444-8444-444444444444";

describe("clientDataConsentApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("validates list/grant/revoke contracts and sends CSRF mutations", async () => {
    const listResponse = {
      policy: {
        purpose: "external_chart_ai_interpretation",
        policyVersion: chartAiConsentPolicyVersion,
        processorCode: "openai"
      },
      notice: canonicalChartAiConsentNotices.ru,
      noticeSha256: chartAiConsentNoticeSha256ByLocale.ru,
      consents: [
        {
          astrologerUserId,
          publicHandle: "alice-vega",
          publicName: "Alice Vega",
          relationshipStatus: "active",
          state: "missing",
          consentId: null,
          noticeLocale: null,
          grantedAt: null,
          revokedAt: null
        }
      ]
    };
    const get = vi.spyOn(application.http, "get").mockResolvedValue(listResponse);
    const put = vi.spyOn(application.http, "put").mockResolvedValue({
      state: "granted",
      consent: {
        id: consentId,
        clientUserId: "11111111-1111-4111-8111-111111111111",
        astrologerUserId,
        purpose: "external_chart_ai_interpretation",
        policyVersion: chartAiConsentPolicyVersion,
        processorCode: "openai",
        noticeLocale: "ru",
        noticeSha256: chartAiConsentNoticeSha256ByLocale.ru,
        grantedAt: "2026-08-03T12:00:00.000Z"
      }
    });
    const deleteRequest = vi.spyOn(application.http, "delete").mockResolvedValue({
      state: "revoked",
      consentId,
      revokedAt: "2026-08-03T12:05:00.000Z"
    });

    await expect(getClientDataConsents("ru")).resolves.toEqual(listResponse);
    await grantClientChartAiConsent(astrologerUserId, {
      accepted: true,
      policyVersion: chartAiConsentPolicyVersion,
      noticeSha256: chartAiConsentNoticeSha256ByLocale.ru,
      locale: "ru"
    });
    await revokeClientDataConsent(consentId);

    expect(get).toHaveBeenCalledWith("/me/consents?locale=ru");
    expect(put).toHaveBeenCalledWith(
      `/me/consents/${astrologerUserId}/chart-ai`,
      expect.objectContaining({ accepted: true, locale: "ru" }),
      { csrf: true }
    );
    expect(deleteRequest).toHaveBeenCalledWith(`/me/consents/${consentId}`, {}, { csrf: true });
  });
});
