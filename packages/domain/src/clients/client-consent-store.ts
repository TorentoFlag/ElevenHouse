import type {
  ChartAiConsentPolicyVersion,
  ChartAiConsentProcessorCode,
  ClientDataConsentLocale,
  ClientDataConsentPurpose,
  ClientDataConsentRecord,
  ClientDataConsentSha256,
  ClientConsentRelationshipStatus
} from "./client-consent-types";

export type ClientConsentRelationshipEvidence = {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly publicHandle: string;
  readonly publicName: string;
  readonly status: ClientConsentRelationshipStatus;
};

export type ClientConsentAuthorizationEvidence = {
  readonly relationship: ClientConsentRelationshipEvidence;
  readonly consent: ClientDataConsentRecord | null;
};

export type ClientConsentGrantAtomicInput = {
  readonly consentId: string;
  readonly auditEntryId: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly purpose: ClientDataConsentPurpose;
  readonly policyVersion: ChartAiConsentPolicyVersion;
  readonly processorCode: ChartAiConsentProcessorCode;
  readonly noticeLocale: ClientDataConsentLocale;
  readonly noticeSha256: ClientDataConsentSha256;
  readonly grantedAt: string;
};

export type ClientConsentGrantAtomicResult =
  | { readonly status: "granted"; readonly consent: ClientDataConsentRecord }
  | { readonly status: "already_current"; readonly consent: ClientDataConsentRecord }
  | { readonly status: "relationship_not_found" }
  | {
      readonly status: "relationship_inactive";
      readonly relationshipStatus: Exclude<ClientConsentRelationshipStatus, "active">;
    };

export type ClientConsentRevokeAtomicInput = {
  readonly consentId: string;
  readonly auditEntryId: string;
  readonly clientUserId: string;
  readonly revokedAt: string;
};

export type ClientConsentRevokeAtomicResult =
  | { readonly status: "revoked"; readonly consent: ClientDataConsentRecord }
  | { readonly status: "already_revoked"; readonly consent: ClientDataConsentRecord }
  | { readonly status: "not_found" };

/**
 * Mutation methods are transaction boundaries. Implementations must lock the
 * owned relationship/consent, apply immutable-history rules and append the
 * matching audit entry atomically before returning.
 *
 * An exact repeated grant returns `already_current` without inserting another
 * row or audit entry. Re-consent supersedes a stale/revoked row and inserts a
 * new immutable grant row. Repeated revoke returns `already_revoked` without a
 * second audit entry. Owner mismatches are returned as `not_found`.
 */
export type ClientConsentStore = {
  readonly listRelationshipConsentsForClient: (input: {
    readonly clientUserId: string;
  }) => Promise<readonly ClientConsentAuthorizationEvidence[]>;
  readonly grantConsentAtomically: (
    input: ClientConsentGrantAtomicInput
  ) => Promise<ClientConsentGrantAtomicResult>;
  readonly revokeConsentAtomically: (
    input: ClientConsentRevokeAtomicInput
  ) => Promise<ClientConsentRevokeAtomicResult>;
  readonly findChartAiConsentEvidence: (input: {
    readonly astrologerUserId: string;
    readonly clientUserIds: readonly string[];
  }) => Promise<readonly ClientConsentAuthorizationEvidence[]>;
};
