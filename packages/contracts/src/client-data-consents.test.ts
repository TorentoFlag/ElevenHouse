import { describe, expect, it } from "vitest";
import {
  canonicalChartAiConsentNotices,
  clientDataConsentListQuerySchema,
  clientDataConsentListItemSchema,
  clientDataConsentListResponseSchema,
  grantChartAiConsentParamsSchema,
  grantChartAiConsentRequestSchema,
  grantChartAiConsentResponseSchema,
  revokeClientDataConsentParamsSchema,
  revokeClientDataConsentRequestSchema,
  revokeClientDataConsentResponseSchema
} from "./client-data-consents";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const consentId = "33333333-3333-4333-8333-333333333333";
const ruNoticeSha256 = "sha256:a64936b4efaa5b559c8aed2f0cb66926902708e36e7a2c7ba6236ab4f327216b";
const enNoticeSha256 = "sha256:9730fb95b7f4c8ce35a4b150d3360383cdea3dfdae097518e7dcea8efd51103f";

describe("client data consent contracts", () => {
  it("accepts only a strict RU or EN list query", () => {
    expect(clientDataConsentListQuerySchema.parse({ locale: "ru" })).toEqual({ locale: "ru" });
    expect(clientDataConsentListQuerySchema.parse({ locale: "en" })).toEqual({ locale: "en" });

    expect(() => clientDataConsentListQuerySchema.parse({})).toThrow();
    expect(() =>
      clientDataConsentListQuerySchema.parse({ locale: "de", includeRevoked: true })
    ).toThrow();
  });

  it("keeps the canonical notices immutable at runtime", () => {
    expect(Object.isFrozen(canonicalChartAiConsentNotices)).toBe(true);
    expect(Object.isFrozen(canonicalChartAiConsentNotices.ru)).toBe(true);
    expect(Object.isFrozen(canonicalChartAiConsentNotices.en.dataSent)).toBe(true);
    expect(Object.isFrozen(canonicalChartAiConsentNotices.ru.dataExcluded[0])).toBe(true);
  });

  it("accepts only an explicit exact-policy grant and rejects browser-owned authority fields", () => {
    expect(
      grantChartAiConsentRequestSchema.parse({
        accepted: true,
        policyVersion: "chart-ai-external-processing.v1",
        noticeSha256: ruNoticeSha256,
        locale: "ru"
      })
    ).toEqual({
      accepted: true,
      policyVersion: "chart-ai-external-processing.v1",
      noticeSha256: ruNoticeSha256,
      locale: "ru"
    });

    for (const request of [
      {
        accepted: false,
        policyVersion: "chart-ai-external-processing.v1",
        noticeSha256: ruNoticeSha256,
        locale: "ru"
      },
      {
        accepted: true,
        policyVersion: "chart-ai-external-processing.v0",
        noticeSha256: ruNoticeSha256,
        locale: "ru"
      },
      {
        accepted: true,
        policyVersion: "chart-ai-external-processing.v1",
        noticeSha256: `sha256:${"A".repeat(64)}`,
        locale: "ru"
      },
      {
        accepted: true,
        policyVersion: "chart-ai-external-processing.v1",
        noticeSha256: enNoticeSha256,
        locale: "ru"
      },
      {
        accepted: true,
        policyVersion: "chart-ai-external-processing.v1",
        noticeSha256: ruNoticeSha256,
        locale: "ru",
        clientUserId,
        purpose: "external_chart_ai_interpretation",
        processorCode: "openai",
        processingAuthorityVersion: "invented"
      }
    ]) {
      expect(() => grantChartAiConsentRequestSchema.parse(request)).toThrow();
    }
  });

  it("accepts only canonical owner-scoped grant and revoke parameters", () => {
    expect(grantChartAiConsentParamsSchema.parse({ astrologerUserId })).toEqual({
      astrologerUserId
    });
    expect(revokeClientDataConsentParamsSchema.parse({ consentId })).toEqual({ consentId });

    expect(() =>
      grantChartAiConsentParamsSchema.parse({ astrologerUserId, clientUserId })
    ).toThrow();
    expect(() => revokeClientDataConsentParamsSchema.parse({ consentId: "not-a-uuid" })).toThrow();
    expect(revokeClientDataConsentRequestSchema.parse({})).toEqual({});
    expect(() => revokeClientDataConsentRequestSchema.parse({ accepted: true })).toThrow();
  });

  it("rejects internally inconsistent missing, granted, revoked and stale list states", () => {
    const persistedSnapshot = {
      astrologerUserId,
      publicHandle: "alisa-vega",
      publicName: "Алиса Вега",
      relationshipStatus: "active",
      consentId,
      noticeLocale: "ru",
      grantedAt: "2026-08-03T10:00:00.000Z"
    };

    expect(() =>
      clientDataConsentListItemSchema.parse({
        ...persistedSnapshot,
        state: "missing",
        noticeLocale: null,
        grantedAt: null,
        revokedAt: null
      })
    ).toThrow();
    expect(() =>
      clientDataConsentListItemSchema.parse({
        ...persistedSnapshot,
        state: "stale",
        revokedAt: "2026-08-03T11:00:00.000Z"
      })
    ).toThrow();
    expect(() =>
      clientDataConsentListItemSchema.parse({
        ...persistedSnapshot,
        state: "revoked",
        revokedAt: null
      })
    ).toThrow();
    expect(() =>
      clientDataConsentListItemSchema.parse({
        ...persistedSnapshot,
        relationshipStatus: "blocked",
        state: "granted",
        revokedAt: null
      })
    ).toThrow();
  });

  it("parses safe list, grant and revoke states without exposing processing authority", () => {
    const notice = canonicalChartAiConsentNotices.en;
    const currentConsent = {
      id: consentId,
      clientUserId,
      astrologerUserId,
      purpose: "external_chart_ai_interpretation",
      policyVersion: "chart-ai-external-processing.v1",
      processorCode: "openai",
      noticeLocale: "en",
      noticeSha256: enNoticeSha256,
      grantedAt: "2026-08-03T10:00:00.000Z"
    };

    expect(
      clientDataConsentListResponseSchema.parse({
        policy: {
          purpose: "external_chart_ai_interpretation",
          policyVersion: "chart-ai-external-processing.v1",
          processorCode: "openai"
        },
        notice,
        noticeSha256: enNoticeSha256,
        consents: [
          {
            astrologerUserId,
            publicHandle: "alisa-vega",
            publicName: "Алиса Вега",
            relationshipStatus: "active",
            state: "granted",
            consentId,
            noticeLocale: "en",
            grantedAt: "2026-08-03T10:00:00.000Z",
            revokedAt: null
          },
          {
            astrologerUserId: "44444444-4444-4444-8444-444444444444",
            publicHandle: "mikhail-sever",
            publicName: "Михаил Север",
            relationshipStatus: "active",
            state: "missing",
            consentId: null,
            noticeLocale: null,
            grantedAt: null,
            revokedAt: null
          }
        ]
      })
    ).toMatchObject({ consents: [{ state: "granted" }, { state: "missing" }] });

    expect(
      grantChartAiConsentResponseSchema.parse({ state: "granted", consent: currentConsent })
    ).toEqual({ state: "granted", consent: currentConsent });
    expect(
      revokeClientDataConsentResponseSchema.parse({
        state: "revoked",
        consentId,
        revokedAt: "2026-08-03T11:00:00.000Z"
      })
    ).toEqual({
      state: "revoked",
      consentId,
      revokedAt: "2026-08-03T11:00:00.000Z"
    });

    expect(() =>
      grantChartAiConsentResponseSchema.parse({
        state: "granted",
        consent: currentConsent,
        processingAuthorityVersion: "invented"
      })
    ).toThrow();
    expect(() =>
      grantChartAiConsentResponseSchema.parse({
        state: "granted",
        consent: { ...currentConsent, noticeSha256: ruNoticeSha256 }
      })
    ).toThrow();
    expect(() =>
      clientDataConsentListResponseSchema.parse({
        policy: {
          purpose: "external_chart_ai_interpretation",
          policyVersion: "chart-ai-external-processing.v1",
          processorCode: "openai"
        },
        notice: { ...notice, summary: "Altered text under the canonical hash." },
        noticeSha256: enNoticeSha256,
        consents: []
      })
    ).toThrow();
  });
});
