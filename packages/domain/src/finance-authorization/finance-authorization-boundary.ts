import type { FinanceSensitiveActionKind } from "@elevenhouse/contracts";
import type { FinanceAuthorizationPayloadHash } from "./canonical-command-payload";

export type FinanceAuthorizationSessionKind = "standard" | "recovery";

export type FinanceAuthorizationCommand = {
  readonly actorUserId: string;
  readonly sessionId: string;
  readonly sessionKind: FinanceAuthorizationSessionKind;
  readonly actionKind: FinanceSensitiveActionKind;
  readonly aggregateId: string;
  readonly expectedVersion: number;
  readonly payload: unknown;
};

export type FinanceAuthorizationBinding = Omit<
  FinanceAuthorizationCommand,
  "sessionKind" | "payload"
> & {
  readonly payloadHash: FinanceAuthorizationPayloadHash;
};

export type FinanceAuthorizationChallengeDraft = FinanceAuthorizationBinding & {
  readonly challenge: string;
  readonly rpId: string;
  readonly origin: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly status: "active";
  readonly consumedAt: null;
};

export type FinanceAuthorizationChallenge = Omit<
  FinanceAuthorizationChallengeDraft,
  "status" | "consumedAt"
> & {
  readonly id: string;
  readonly status: "active" | "consumed";
  readonly consumedAt: string | null;
};

export type FinanceAuthorizationGrantDraft = FinanceAuthorizationBinding & {
  readonly verifiedAt: string;
  readonly expiresAt: string;
  readonly status: "active";
  readonly consumedAt: null;
};

export type FinanceAuthorizationGrant = Omit<
  FinanceAuthorizationGrantDraft,
  "status" | "consumedAt"
> & {
  readonly authorizationId: string;
  readonly status: "active" | "consumed";
  readonly consumedAt: string | null;
};

export type FinanceTransactionAuthorizationProof = FinanceAuthorizationBinding & {
  readonly authorizationId: string;
  readonly verifiedAt: string;
  readonly expiresAt: string;
  readonly status: "consumed";
};

export type FinanceAuthorizationStore = {
  readonly createChallenge: (
    challenge: FinanceAuthorizationChallengeDraft
  ) => Promise<FinanceAuthorizationChallenge>;
  readonly findChallengeById: (
    challengeId: string
  ) => Promise<FinanceAuthorizationChallenge | null>;
  /** Atomically consumes an active unexpired challenge and creates its one active grant. */
  readonly consumeChallengeAndCreateGrant: (input: {
    readonly challengeId: string;
    readonly consumedAt: string;
    readonly grant: FinanceAuthorizationGrantDraft;
  }) => Promise<FinanceAuthorizationGrant | null>;
  readonly findGrantById: (authorizationId: string) => Promise<FinanceAuthorizationGrant | null>;
  /**
   * Atomically consumes one matching active, unexpired grant. The sensitive command must call
   * this CAS through the same transaction that mutates its protected aggregate.
   */
  readonly consumeGrant: (input: {
    readonly authorizationId: string;
    readonly consumedAt: string;
  }) => Promise<FinanceAuthorizationGrant | null>;
};

export type FinanceWebAuthnCredential = {
  readonly credentialId: string;
  readonly ownerUserId: string;
  readonly status: "active" | "quarantined";
  readonly signatureCounter: number;
};

export type FinanceWebAuthnCredentialCounterMutationResult =
  | { readonly outcome: "advanced"; readonly signatureCounter: number }
  | { readonly outcome: "unchanged_zero"; readonly signatureCounter: 0 }
  | {
      readonly outcome: "quarantined";
      readonly reason: "counter_regression" | "compare_and_set_conflict";
    }
  | { readonly outcome: "unavailable" };

export type FinanceWebAuthnCredentialStore = {
  readonly findCredentialById: (credentialId: string) => Promise<FinanceWebAuthnCredential | null>;
  /**
   * Atomically advances a valid counter. A regression/replay or compare-and-set conflict
   * quarantines the persisted credential instead of retrying against a newer counter.
   */
  readonly advanceSignatureCounterOrQuarantine: (input: {
    readonly credentialId: string;
    readonly expectedSignatureCounter: number;
    readonly assertedSignatureCounter: number;
    readonly verifiedAt: string;
  }) => Promise<FinanceWebAuthnCredentialCounterMutationResult>;
};

export type FinanceAuthorizationVerificationTransaction = {
  readonly lockedChallenge: FinanceAuthorizationChallenge | null;
  readonly authorizationStore: FinanceAuthorizationStore;
  readonly credentialStore: FinanceWebAuthnCredentialStore;
};

export type FinanceAuthorizationVerificationUnitOfWork = {
  /**
   * Starts one transaction, locks the named challenge before exposing credential state, and
   * commits or rolls back authorization-store and credential-store mutations together. Calls
   * for the same challenge ID must be serialized by this boundary.
   */
  readonly transactForChallenge: <T>(
    challengeId: string,
    operation: (transaction: FinanceAuthorizationVerificationTransaction) => Promise<T>
  ) => Promise<T>;
};

export type FinanceWebAuthnAssertionVerification =
  | { readonly verified: false }
  | {
      readonly verified: true;
      readonly credentialId: string;
      readonly userVerified: boolean;
      readonly signatureCounter: number;
    };

export type FinanceWebAuthnAssertionVerifier = {
  /**
   * Returns verified=true only after the complete WebAuthn assertion checks, including type,
   * challenge, origin, RP ID hash, user presence, required user verification and signature.
   * Binary parsing and credential-public-key handling stay inside the adapter.
   */
  readonly verifyAssertion: (input: {
    readonly assertion: unknown;
    readonly expectedChallenge: string;
    readonly allowedOrigin: string;
    readonly rpId: string;
    readonly requireUserVerification: true;
  }) => Promise<FinanceWebAuthnAssertionVerification>;
};

export type FinanceAuthorizationRandomSource = {
  readonly randomBytes: (byteLength: number) => Uint8Array;
};

export type FinanceAuthorizationClock = {
  readonly now: () => string;
};

export class FinanceAuthorizationRejectedError extends Error {
  readonly code = "FINANCE_AUTHORIZATION_REJECTED";

  constructor() {
    super("Finance transaction authorization was rejected");
    this.name = "FinanceAuthorizationRejectedError";
  }
}

export class FinanceAuthorizationIntegrityError extends Error {
  readonly code = "FINANCE_AUTHORIZATION_INTEGRITY_ERROR";

  constructor() {
    super("Finance transaction authorization integrity check failed");
    this.name = "FinanceAuthorizationIntegrityError";
  }
}

export type BeginFinanceAuthorizationResult = {
  readonly challengeId: string;
  readonly expiresAt: string;
  readonly publicKey: {
    readonly challenge: string;
    readonly rpId: string;
    readonly timeout: 300_000;
    readonly userVerification: "required";
  };
};
