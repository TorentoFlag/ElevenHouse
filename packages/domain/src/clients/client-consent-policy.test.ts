import { describe, expect, it } from "vitest";
import {
  canonicalChartAiConsentNotices as contractChartAiConsentNotices,
  chartAiConsentNoticeSha256ByLocale,
  currentChartAiConsentPolicy as contractChartAiConsentPolicy
} from "@elevenhouse/contracts";
import {
  canonicalChartAiConsentNoticeHashes,
  canonicalChartAiConsentNotices,
  canonicalizeClientConsentNotice,
  computeCanonicalChartAiConsentNoticeHash,
  currentChartAiConsentPolicy,
  getCanonicalChartAiConsentNotice,
  isCurrentChartAiConsent,
  resolveClientDataConsentState
} from "./client-consent-policy";
import type { ClientDataConsentRecord } from "./client-consent-types";

const consent = (overrides: Partial<ClientDataConsentRecord> = {}): ClientDataConsentRecord => ({
  id: "33333333-3333-4333-8333-333333333333",
  relationshipId: "55555555-5555-4555-8555-555555555555",
  clientUserId: "11111111-1111-4111-8111-111111111111",
  astrologerUserId: "22222222-2222-4222-8222-222222222222",
  purpose: "external_chart_ai_interpretation",
  policyVersion: "chart-ai-external-processing.v1",
  processorCode: "openai",
  noticeLocale: "ru",
  noticeSha256: "sha256:a64936b4efaa5b559c8aed2f0cb66926902708e36e7a2c7ba6236ab4f327216b",
  grantedAt: "2026-08-03T10:00:00.000Z",
  revokedAt: null,
  ...overrides
});

describe("chart AI client-consent policy", () => {
  it("pins the exact purpose, policy version and provider without legal-authority claims", () => {
    expect(currentChartAiConsentPolicy).toEqual({
      purpose: "external_chart_ai_interpretation",
      policyVersion: "chart-ai-external-processing.v1",
      processorCode: "openai"
    });
    expect(currentChartAiConsentPolicy).not.toHaveProperty("processingAuthorityVersion");
  });

  it("uses contracts as the single canonical notice and hash source", () => {
    expect(currentChartAiConsentPolicy).toBe(contractChartAiConsentPolicy);
    expect(canonicalChartAiConsentNotices).toBe(contractChartAiConsentNotices);
    expect(canonicalChartAiConsentNoticeHashes).toBe(chartAiConsentNoticeSha256ByLocale);
    expect(computeCanonicalChartAiConsentNoticeHash(contractChartAiConsentNotices.ru)).toBe(
      chartAiConsentNoticeSha256ByLocale.ru
    );
    expect(computeCanonicalChartAiConsentNoticeHash(contractChartAiConsentNotices.en)).toBe(
      chartAiConsentNoticeSha256ByLocale.en
    );
  });

  it("exposes canonical RU and EN notices with independently fixed deterministic hashes", () => {
    expect(canonicalChartAiConsentNoticeHashes).toEqual({
      ru: "sha256:a64936b4efaa5b559c8aed2f0cb66926902708e36e7a2c7ba6236ab4f327216b",
      en: "sha256:9730fb95b7f4c8ce35a4b150d3360383cdea3dfdae097518e7dcea8efd51103f"
    });
    expect(canonicalChartAiConsentNotices.ru.processor).toEqual({
      code: "openai",
      name: "OpenAI"
    });
    expect(canonicalChartAiConsentNotices.en.dataSent.map(({ code }) => code)).toEqual([
      "calculated_positions",
      "calculated_houses",
      "calculated_aspects",
      "calculation_settings",
      "calculation_warnings",
      "bounded_dictionary_excerpts"
    ]);
    expect(canonicalChartAiConsentNotices.ru.dataExcluded.map(({ code }) => code)).toEqual([
      "identity",
      "contacts",
      "birth_data",
      "coordinates",
      "crm_data",
      "calculation_id",
      "result_checksum"
    ]);
    expect(getCanonicalChartAiConsentNotice("en")).toEqual({
      notice: canonicalChartAiConsentNotices.en,
      noticeSha256: canonicalChartAiConsentNoticeHashes.en
    });
  });

  it("canonicalizes object keys without changing array order", () => {
    expect(canonicalizeClientConsentNotice({ z: 1, a: { y: true, b: ["second", "first"] } })).toBe(
      '{"a":{"b":["second","first"],"y":true},"z":1}'
    );
  });

  it("treats only an active exact-policy record as granted", () => {
    expect(isCurrentChartAiConsent({ relationshipStatus: "active", consent: consent() })).toBe(
      true
    );
    expect(
      isCurrentChartAiConsent({
        relationshipStatus: "active",
        consent: consent({
          noticeLocale: "en",
          noticeSha256: "sha256:9730fb95b7f4c8ce35a4b150d3360383cdea3dfdae097518e7dcea8efd51103f"
        })
      })
    ).toBe(true);
  });

  it("derives missing, revoked and stale without treating UI locale changes as revocation", () => {
    expect(resolveClientDataConsentState({ relationshipStatus: "active", consent: null })).toBe(
      "missing"
    );
    expect(
      resolveClientDataConsentState({
        relationshipStatus: "active",
        consent: consent({ revokedAt: "2026-08-03T11:00:00.000Z" })
      })
    ).toBe("revoked");

    expect(
      resolveClientDataConsentState({
        relationshipStatus: "active",
        consent: consent({ purpose: "generic_ai" })
      })
    ).toBe("stale");
    expect(
      resolveClientDataConsentState({
        relationshipStatus: "active",
        consent: consent({ policyVersion: "chart-ai-external-processing.v0" })
      })
    ).toBe("stale");
    expect(
      resolveClientDataConsentState({
        relationshipStatus: "active",
        consent: consent({ processorCode: "another-provider" })
      })
    ).toBe("stale");
    expect(
      resolveClientDataConsentState({
        relationshipStatus: "active",
        consent: consent({ noticeSha256: `sha256:${"b".repeat(64)}` })
      })
    ).toBe("stale");
    expect(
      resolveClientDataConsentState({
        relationshipStatus: "active",
        consent: consent({ noticeLocale: "en" })
      })
    ).toBe("stale");
    expect(
      resolveClientDataConsentState({
        relationshipStatus: "active",
        consent: consent({ noticeLocale: "de" })
      })
    ).toBe("stale");
    expect(
      resolveClientDataConsentState({ relationshipStatus: "blocked", consent: consent() })
    ).toBe("stale");

    expect(
      resolveClientDataConsentState({
        relationshipStatus: "active",
        consent: consent({
          noticeLocale: "ru",
          noticeSha256: canonicalChartAiConsentNoticeHashes.ru
        })
      })
    ).toBe("granted");
  });
});
