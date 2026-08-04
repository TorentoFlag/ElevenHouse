import { createHash } from "node:crypto";
import {
  canonicalChartAiConsentNotices,
  chartAiConsentNoticeSha256ByLocale,
  currentChartAiConsentPolicy
} from "@elevenhouse/contracts";
import type {
  ClientDataConsentLocale,
  ClientDataConsentNotice,
  ClientDataConsentRecord,
  ClientDataConsentSha256,
  ClientDataConsentState,
  ClientConsentRelationshipStatus
} from "./client-consent-types";

export { canonicalChartAiConsentNotices, currentChartAiConsentPolicy };
export const canonicalChartAiConsentNoticeHashes = chartAiConsentNoticeSha256ByLocale;

for (const locale of ["ru", "en"] as const) {
  if (
    computeCanonicalChartAiConsentNoticeHash(canonicalChartAiConsentNotices[locale]) !==
    canonicalChartAiConsentNoticeHashes[locale]
  ) {
    throw new Error(`Canonical ${locale} chart AI consent notice hash is inconsistent`);
  }
}

export function getCanonicalChartAiConsentNotice(locale: ClientDataConsentLocale): {
  readonly notice: ClientDataConsentNotice;
  readonly noticeSha256: ClientDataConsentSha256;
} {
  return {
    notice: canonicalChartAiConsentNotices[locale],
    noticeSha256: canonicalChartAiConsentNoticeHashes[locale]
  };
}

export function resolveClientDataConsentState(input: {
  readonly relationshipStatus: ClientConsentRelationshipStatus;
  readonly consent: ClientDataConsentRecord | null;
}): ClientDataConsentState {
  if (!input.consent) return "missing";
  if (input.consent.revokedAt !== null) return "revoked";
  if (input.relationshipStatus !== "active") return "stale";
  return matchesCurrentChartAiConsentPolicy(input.consent) ? "granted" : "stale";
}

export function isCurrentChartAiConsent(input: {
  readonly relationshipStatus: ClientConsentRelationshipStatus;
  readonly consent: ClientDataConsentRecord | null;
}): boolean {
  return resolveClientDataConsentState(input) === "granted";
}

function matchesCurrentChartAiConsentPolicy(consent: ClientDataConsentRecord): boolean {
  if (
    consent.purpose !== currentChartAiConsentPolicy.purpose ||
    consent.policyVersion !== currentChartAiConsentPolicy.policyVersion ||
    consent.processorCode !== currentChartAiConsentPolicy.processorCode ||
    !isClientDataConsentLocale(consent.noticeLocale)
  ) {
    return false;
  }
  return consent.noticeSha256 === canonicalChartAiConsentNoticeHashes[consent.noticeLocale];
}

export function isClientDataConsentLocale(value: string): value is ClientDataConsentLocale {
  return value === "ru" || value === "en";
}

export function canonicalizeClientConsentNotice(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical consent JSON requires finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeClientConsentNotice(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical consent JSON requires plain objects");
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => {
        if (item === undefined) {
          throw new TypeError("Canonical consent JSON does not permit undefined values");
        }
        return `${JSON.stringify(key)}:${canonicalizeClientConsentNotice(item)}`;
      });
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("Canonical consent JSON contains an unsupported value");
}

export function computeCanonicalChartAiConsentNoticeHash(
  value: ClientDataConsentNotice
): ClientDataConsentSha256 {
  return `sha256:${createHash("sha256")
    .update(canonicalizeClientConsentNotice(value), "utf8")
    .digest("hex")}`;
}
