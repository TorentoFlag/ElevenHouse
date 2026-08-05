import { and, eq, gt } from "drizzle-orm";
import type {
  FinanceAuthorizationChallenge,
  FinanceAuthorizationGrant,
  FinanceAuthorizationStore,
  FinanceAuthorizationVerificationTransaction,
  FinanceAuthorizationVerificationUnitOfWork,
  FinanceWebAuthnCredential,
  FinanceWebAuthnCredentialCounterMutationResult,
  FinanceWebAuthnCredentialStore
} from "@elevenhouse/domain";
import type { FinanceSensitiveActionKind } from "@elevenhouse/contracts";

import type { ElevenHouseDatabase } from "../../runtime";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  financeAuthorizationChallenges,
  financeAuthorizationGrants,
  financeWebAuthnCredentials,
  financeWebAuthnRegistrationChallenges
} from "../../schema";

type FinanceAuthorizationDrizzleExecutor = Pick<
  ElevenHouseDatabase,
  "insert" | "select" | "update"
>;

export type FinanceWebAuthnRegistrationChallenge = {
  readonly id: string;
  readonly actorUserId: string;
  readonly sessionId: string;
  readonly challenge: string;
  readonly rpId: string;
  readonly origin: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly status: "active" | "consumed";
  readonly consumedAt: string | null;
};

export type FinanceWebAuthnCredentialMaterial = {
  readonly credentialId: string;
  readonly ownerUserId: string;
  readonly publicKey: Buffer;
  readonly transports: readonly string[];
  readonly signatureCounter: number;
};

/**
 * The only adapter boundary intended for a financial command that consumes a WebAuthn grant.
 * The callback receives the exact PostgreSQL transaction used by the authorization store, so a
 * rejected protected command rolls the grant consumption back instead of burning a valid grant.
 */
export type DrizzleFinanceAuthorizationCommandTransaction = Readonly<{
  transaction: FinanceTransaction;
  authorizationStore: FinanceAuthorizationStore;
}>;

const active = "active";
const consumed = "consumed";
const quarantined = "quarantined";

/**
 * PostgreSQL persistence for high-risk finance step-up. It deliberately exposes the verification
 * transaction separately: consuming a grant must be composed with the protected money command.
 */
export function createDrizzleFinanceAuthorizationStore(
  database: FinanceAuthorizationDrizzleExecutor
): FinanceAuthorizationStore {
  return Object.freeze({
    async createChallenge(draft) {
      const [row] = await database
        .insert(financeAuthorizationChallenges)
        .values({
          actorUserId: draft.actorUserId,
          sessionId: draft.sessionId,
          actionKind: draft.actionKind,
          aggregateId: draft.aggregateId,
          expectedVersion: draft.expectedVersion,
          payloadHash: draft.payloadHash,
          challenge: draft.challenge,
          rpId: draft.rpId,
          origin: draft.origin,
          issuedAt: date(draft.issuedAt),
          expiresAt: date(draft.expiresAt),
          status: draft.status,
          consumedAt: null
        })
        .returning();
      if (!row) throw new Error("Expected finance authorization challenge insert to return a row");
      return toChallenge(row);
    },

    async findChallengeById(challengeId) {
      const [row] = await database
        .select()
        .from(financeAuthorizationChallenges)
        .where(eq(financeAuthorizationChallenges.id, challengeId))
        .limit(1);
      return row ? toChallenge(row) : null;
    },

    async consumeChallengeAndCreateGrant(input) {
      const consumedAt = date(input.consumedAt);
      const [challenge] = await database
        .update(financeAuthorizationChallenges)
        .set({ status: consumed, consumedAt })
        .where(
          and(
            eq(financeAuthorizationChallenges.id, input.challengeId),
            eq(financeAuthorizationChallenges.status, active),
            gt(financeAuthorizationChallenges.expiresAt, consumedAt)
          )
        )
        .returning();
      if (!challenge) return null;

      const [grant] = await database
        .insert(financeAuthorizationGrants)
        .values({
          actorUserId: input.grant.actorUserId,
          sessionId: input.grant.sessionId,
          actionKind: input.grant.actionKind,
          aggregateId: input.grant.aggregateId,
          expectedVersion: input.grant.expectedVersion,
          payloadHash: input.grant.payloadHash,
          verifiedAt: date(input.grant.verifiedAt),
          expiresAt: date(input.grant.expiresAt),
          status: input.grant.status,
          consumedAt: null
        })
        .returning();
      if (!grant) throw new Error("Expected finance authorization grant insert to return a row");
      return toGrant(grant);
    },

    async findGrantById(authorizationId) {
      const [row] = await database
        .select()
        .from(financeAuthorizationGrants)
        .where(eq(financeAuthorizationGrants.authorizationId, authorizationId))
        .limit(1);
      return row ? toGrant(row) : null;
    },

    async consumeGrant(input) {
      const consumedAt = date(input.consumedAt);
      const [row] = await database
        .update(financeAuthorizationGrants)
        .set({ status: consumed, consumedAt })
        .where(
          and(
            eq(financeAuthorizationGrants.authorizationId, input.authorizationId),
            eq(financeAuthorizationGrants.status, active),
            gt(financeAuthorizationGrants.expiresAt, consumedAt)
          )
        )
        .returning();
      return row ? toGrant(row) : null;
    }
  } satisfies FinanceAuthorizationStore);
}

/**
 * Composes a one-time finance authorization grant with a protected finance mutation in one
 * transaction. Callers must consume the grant through the supplied store and perform every
 * protected write through the supplied transaction; provider I/O remains outside this boundary.
 */
export async function transactDrizzleFinanceAuthorizationCommand<T>(input: {
  readonly database: ElevenHouseDatabase;
  readonly operation: (transaction: DrizzleFinanceAuthorizationCommandTransaction) => Promise<T>;
}): Promise<T> {
  return input.database.transaction((transaction) =>
    input.operation({
      transaction,
      authorizationStore: createDrizzleFinanceAuthorizationStore(
        transaction as unknown as FinanceAuthorizationDrizzleExecutor
      )
    })
  );
}

export function createDrizzleFinanceWebAuthnCredentialStore(
  database: FinanceAuthorizationDrizzleExecutor
): FinanceWebAuthnCredentialStore {
  return Object.freeze({
    async findCredentialById(credentialId) {
      const [row] = await database
        .select()
        .from(financeWebAuthnCredentials)
        .where(eq(financeWebAuthnCredentials.credentialId, credentialId))
        .limit(1);
      return row ? toCredential(row) : null;
    },

    async advanceSignatureCounterOrQuarantine(input) {
      const verifiedAt = date(input.verifiedAt);
      if (
        !Number.isSafeInteger(input.expectedSignatureCounter) ||
        !Number.isSafeInteger(input.assertedSignatureCounter) ||
        input.expectedSignatureCounter < 0 ||
        input.assertedSignatureCounter < 0
      ) {
        return quarantineCredential(database, input.credentialId, verifiedAt, "compare_and_set_conflict");
      }

      if (
        (input.expectedSignatureCounter !== 0 || input.assertedSignatureCounter !== 0) &&
        input.assertedSignatureCounter <= input.expectedSignatureCounter
      ) {
        return quarantineCredential(database, input.credentialId, verifiedAt, "counter_regression");
      }

      const [updated] = await database
        .update(financeWebAuthnCredentials)
        .set({
          signatureCounter: input.assertedSignatureCounter,
          lastUsedAt: verifiedAt
        })
        .where(
          and(
            eq(financeWebAuthnCredentials.credentialId, input.credentialId),
            eq(financeWebAuthnCredentials.status, active),
            eq(financeWebAuthnCredentials.signatureCounter, input.expectedSignatureCounter)
          )
        )
        .returning({ signatureCounter: financeWebAuthnCredentials.signatureCounter });
      if (!updated) {
        return quarantineCredential(database, input.credentialId, verifiedAt, "compare_and_set_conflict");
      }
      return updated.signatureCounter === 0
        ? { outcome: "unchanged_zero", signatureCounter: 0 }
        : { outcome: "advanced", signatureCounter: updated.signatureCounter };
    }
  } satisfies FinanceWebAuthnCredentialStore);
}

/** App-facing material reader. It returns only public credential data required by WebAuthn verification. */
export function createDrizzleFinanceWebAuthnCredentialMaterialReader(
  database: FinanceAuthorizationDrizzleExecutor
): {
  readonly findActiveByCredentialId: (
    credentialId: string
  ) => Promise<FinanceWebAuthnCredentialMaterial | null>;
  readonly listActiveByOwnerUserId: (
    ownerUserId: string
  ) => Promise<readonly FinanceWebAuthnCredentialMaterial[]>;
} {
  return Object.freeze({
    async findActiveByCredentialId(credentialId) {
      const [row] = await database
        .select()
        .from(financeWebAuthnCredentials)
        .where(
          and(
            eq(financeWebAuthnCredentials.credentialId, credentialId),
            eq(financeWebAuthnCredentials.status, active)
          )
        )
        .limit(1);
      return row ? toCredentialMaterial(row) : null;
    },

    async listActiveByOwnerUserId(ownerUserId) {
      const rows = await database
        .select()
        .from(financeWebAuthnCredentials)
        .where(
          and(
            eq(financeWebAuthnCredentials.ownerUserId, ownerUserId),
            eq(financeWebAuthnCredentials.status, active)
          )
        );
      return rows.map(toCredentialMaterial);
    }
  });
}

export function createDrizzleFinanceWebAuthnRegistrationStore(input: {
  readonly database: ElevenHouseDatabase;
}): {
  readonly createChallenge: (input: {
    readonly actorUserId: string;
    readonly sessionId: string;
    readonly challenge: string;
    readonly rpId: string;
    readonly origin: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
  }) => Promise<FinanceWebAuthnRegistrationChallenge>;
  readonly findChallengeById: (
    challengeId: string
  ) => Promise<FinanceWebAuthnRegistrationChallenge | null>;
  readonly consumeChallengeAndCreateCredential: (input: {
    readonly registrationChallengeId: string;
    readonly actorUserId: string;
    readonly sessionId: string;
    readonly consumedAt: string;
    readonly credential: {
      readonly credentialId: string;
      readonly publicKey: Buffer;
      readonly transports: readonly string[];
      readonly deviceType: "singleDevice" | "multiDevice";
      readonly backedUp: boolean;
      readonly signatureCounter: number;
    };
  }) => Promise<FinanceWebAuthnCredentialMaterial | null>;
} {
  return Object.freeze({
    async createChallenge(command) {
      const [row] = await input.database
        .insert(financeWebAuthnRegistrationChallenges)
        .values({
          actorUserId: command.actorUserId,
          sessionId: command.sessionId,
          challenge: command.challenge,
          rpId: command.rpId,
          origin: command.origin,
          issuedAt: date(command.issuedAt),
          expiresAt: date(command.expiresAt),
          status: active,
          consumedAt: null
        })
        .returning();
      if (!row) throw new Error("Expected finance WebAuthn registration challenge insert to return a row");
      return toRegistrationChallenge(row);
    },

    async findChallengeById(challengeId) {
      const [row] = await input.database
        .select()
        .from(financeWebAuthnRegistrationChallenges)
        .where(eq(financeWebAuthnRegistrationChallenges.id, challengeId))
        .limit(1);
      return row ? toRegistrationChallenge(row) : null;
    },

    async consumeChallengeAndCreateCredential(command) {
      const consumedAt = date(command.consumedAt);
      return input.database.transaction(async (transaction) => {
        const [challenge] = await transaction
          .select()
          .from(financeWebAuthnRegistrationChallenges)
          .where(eq(financeWebAuthnRegistrationChallenges.id, command.registrationChallengeId))
          .limit(1)
          .for("update");
        if (
          !challenge ||
          challenge.status !== active ||
          challenge.actorUserId !== command.actorUserId ||
          challenge.sessionId !== command.sessionId ||
          challenge.expiresAt <= consumedAt
        ) {
          return null;
        }
        const [consumedChallenge] = await transaction
          .update(financeWebAuthnRegistrationChallenges)
          .set({ status: consumed, consumedAt })
          .where(
            and(
              eq(financeWebAuthnRegistrationChallenges.id, challenge.id),
              eq(financeWebAuthnRegistrationChallenges.status, active)
            )
          )
          .returning({ id: financeWebAuthnRegistrationChallenges.id });
        if (!consumedChallenge) return null;
        const [credential] = await transaction
          .insert(financeWebAuthnCredentials)
          .values({
            credentialId: command.credential.credentialId,
            ownerUserId: command.actorUserId,
            publicKey: command.credential.publicKey,
            transports: [...command.credential.transports],
            deviceType: command.credential.deviceType,
            backedUp: command.credential.backedUp,
            signatureCounter: command.credential.signatureCounter,
            status: active,
            quarantinedAt: null
          })
          .returning();
        if (!credential) throw new Error("Expected finance WebAuthn credential insert to return a row");
        return toCredentialMaterial(credential);
      });
    }
  });
}

export function createDrizzleFinanceAuthorizationVerificationUnitOfWork(input: {
  readonly database: ElevenHouseDatabase;
}): FinanceAuthorizationVerificationUnitOfWork {
  return Object.freeze({
    async transactForChallenge(challengeId, operation) {
      return input.database.transaction(async (transaction) => {
        const [lockedChallenge] = await transaction
          .select()
          .from(financeAuthorizationChallenges)
          .where(eq(financeAuthorizationChallenges.id, challengeId))
          .limit(1)
          .for("update");
        const scoped = transaction as unknown as FinanceAuthorizationDrizzleExecutor;
        const value: FinanceAuthorizationVerificationTransaction = {
          lockedChallenge: lockedChallenge ? toChallenge(lockedChallenge) : null,
          authorizationStore: createDrizzleFinanceAuthorizationStore(scoped),
          credentialStore: createDrizzleFinanceWebAuthnCredentialStore(scoped)
        };
        return operation(value);
      });
    }
  } satisfies FinanceAuthorizationVerificationUnitOfWork);
}

async function quarantineCredential(
  database: FinanceAuthorizationDrizzleExecutor,
  credentialId: string,
  verifiedAt: Date,
  reason: "counter_regression" | "compare_and_set_conflict"
): Promise<FinanceWebAuthnCredentialCounterMutationResult> {
  const [quarantinedCredential] = await database
    .update(financeWebAuthnCredentials)
    .set({ status: quarantined, quarantinedAt: verifiedAt })
    .where(
      and(
        eq(financeWebAuthnCredentials.credentialId, credentialId),
        eq(financeWebAuthnCredentials.status, active)
      )
    )
    .returning({ credentialId: financeWebAuthnCredentials.credentialId });
  return quarantinedCredential ? { outcome: "quarantined", reason } : { outcome: "unavailable" };
}

function toChallenge(
  row: typeof financeAuthorizationChallenges.$inferSelect
): FinanceAuthorizationChallenge {
  if (row.status !== active && row.status !== consumed) {
    throw new Error("Unexpected finance authorization challenge status");
  }
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    sessionId: row.sessionId,
    actionKind: row.actionKind as FinanceSensitiveActionKind,
    aggregateId: row.aggregateId,
    expectedVersion: row.expectedVersion,
    payloadHash: row.payloadHash as FinanceAuthorizationChallenge["payloadHash"],
    challenge: row.challenge,
    rpId: row.rpId,
    origin: row.origin,
    issuedAt: canonicalInstant(row.issuedAt),
    expiresAt: canonicalInstant(row.expiresAt),
    status: row.status,
    consumedAt: row.consumedAt ? canonicalInstant(row.consumedAt) : null
  };
}

function toGrant(row: typeof financeAuthorizationGrants.$inferSelect): FinanceAuthorizationGrant {
  if (row.status !== active && row.status !== consumed) {
    throw new Error("Unexpected finance authorization grant status");
  }
  return {
    authorizationId: row.authorizationId,
    actorUserId: row.actorUserId,
    sessionId: row.sessionId,
    actionKind: row.actionKind as FinanceSensitiveActionKind,
    aggregateId: row.aggregateId,
    expectedVersion: row.expectedVersion,
    payloadHash: row.payloadHash as FinanceAuthorizationGrant["payloadHash"],
    verifiedAt: canonicalInstant(row.verifiedAt),
    expiresAt: canonicalInstant(row.expiresAt),
    status: row.status,
    consumedAt: row.consumedAt ? canonicalInstant(row.consumedAt) : null
  };
}

function toCredential(
  row: typeof financeWebAuthnCredentials.$inferSelect
): FinanceWebAuthnCredential {
  if (row.status !== active && row.status !== quarantined) {
    throw new Error("Unexpected finance WebAuthn credential status");
  }
  return {
    credentialId: row.credentialId,
    ownerUserId: row.ownerUserId,
    status: row.status,
    signatureCounter: row.signatureCounter
  };
}

function toCredentialMaterial(
  row: typeof financeWebAuthnCredentials.$inferSelect
): FinanceWebAuthnCredentialMaterial {
  if (!Array.isArray(row.transports) || !row.transports.every((value) => typeof value === "string")) {
    throw new Error("Unexpected finance WebAuthn credential transports");
  }
  return {
    credentialId: row.credentialId,
    ownerUserId: row.ownerUserId,
    publicKey: Buffer.from(row.publicKey),
    transports: row.transports,
    signatureCounter: row.signatureCounter
  };
}

function toRegistrationChallenge(
  row: typeof financeWebAuthnRegistrationChallenges.$inferSelect
): FinanceWebAuthnRegistrationChallenge {
  if (row.status !== active && row.status !== consumed) {
    throw new Error("Unexpected finance WebAuthn registration challenge status");
  }
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    sessionId: row.sessionId,
    challenge: row.challenge,
    rpId: row.rpId,
    origin: row.origin,
    issuedAt: canonicalInstant(row.issuedAt),
    expiresAt: canonicalInstant(row.expiresAt),
    status: row.status,
    consumedAt: row.consumedAt ? canonicalInstant(row.consumedAt) : null
  };
}

function date(value: string): Date {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error("Expected a valid finance authorization instant");
  return result;
}

/** Matches Temporal.Instant#toString(), used by the domain as a persisted evidence equality key. */
function canonicalInstant(value: Date): string {
  return value.toISOString().replace(/\.([0-9]*?)0+Z$/, (_match, fraction: string) =>
    fraction ? `.${fraction}Z` : "Z"
  );
}
