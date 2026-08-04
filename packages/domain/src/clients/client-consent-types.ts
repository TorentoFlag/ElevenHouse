import {
  chartAiConsentPolicyVersion,
  chartAiConsentProcessorCode,
  clientDataConsentPurpose
} from "@elevenhouse/contracts";
import type {
  ClientDataConsentLocale,
  ClientDataConsentNotice,
  ClientDataConsentSha256,
  ClientDataConsentState,
  ClientRelationshipStatus,
  CurrentChartAiConsentPolicy
} from "@elevenhouse/contracts";

export { chartAiConsentPolicyVersion, chartAiConsentProcessorCode, clientDataConsentPurpose };
export type {
  ClientDataConsentLocale,
  ClientDataConsentNotice,
  ClientDataConsentSha256,
  ClientDataConsentState,
  CurrentChartAiConsentPolicy
};

export type ClientDataConsentPurpose = typeof clientDataConsentPurpose;
export type ChartAiConsentPolicyVersion = typeof chartAiConsentPolicyVersion;
export type ChartAiConsentProcessorCode = typeof chartAiConsentProcessorCode;
export type ClientConsentRelationshipStatus = ClientRelationshipStatus;
export type ChartAiConsentNoticeSentCode = ClientDataConsentNotice["dataSent"][number]["code"];
export type ChartAiConsentNoticeExcludedCode =
  ClientDataConsentNotice["dataExcluded"][number]["code"];

/**
 * Persistence-facing historical record. Policy fields stay broad because old,
 * revoked or corrupted rows must be classified as stale instead of being
 * silently upgraded to the current policy.
 */
export type ClientDataConsentRecord = {
  readonly id: string;
  readonly relationshipId: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly purpose: string;
  readonly policyVersion: string;
  readonly processorCode: string;
  readonly noticeLocale: string;
  readonly noticeSha256: string;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
};

export type CurrentClientDataConsent = ClientDataConsentRecord & {
  readonly purpose: ClientDataConsentPurpose;
  readonly policyVersion: ChartAiConsentPolicyVersion;
  readonly processorCode: ChartAiConsentProcessorCode;
  readonly noticeLocale: ClientDataConsentLocale;
  readonly noticeSha256: ClientDataConsentSha256;
  readonly revokedAt: null;
};

export type ClientDataConsentGrantRequest = {
  readonly accepted: boolean;
  readonly policyVersion: string;
  readonly noticeSha256: string;
  readonly locale: string;
};

export type ClientDataConsentListItem = {
  readonly astrologerUserId: string;
  readonly publicHandle: string;
  readonly publicName: string;
  readonly relationshipStatus: ClientConsentRelationshipStatus;
  readonly state: ClientDataConsentState;
  readonly consentId: string | null;
  readonly noticeLocale: ClientDataConsentLocale | null;
  readonly grantedAt: string | null;
  readonly revokedAt: string | null;
};

export type ClientDataConsentList = {
  readonly policy: CurrentChartAiConsentPolicy;
  readonly notice: ClientDataConsentNotice;
  readonly noticeSha256: ClientDataConsentSha256;
  readonly consents: readonly ClientDataConsentListItem[];
};

export type ChartAiPersistedParticipant = {
  readonly clientUserId: string;
};

export type AuthorizedChartAiParticipantConsent = {
  readonly clientUserId: string;
  readonly consentId: string;
};
