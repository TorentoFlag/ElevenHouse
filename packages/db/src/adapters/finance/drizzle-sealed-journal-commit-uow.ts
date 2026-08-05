import { types as nodeUtilTypes } from "node:util";

import {
  digestFinanceCanonicalValueV1,
  normalizeFinancePostingDecoderEnvelope,
  rehydrateFinanceJournalLinkProof,
  sameFinanceCanonicalValueV1,
  type FinancePostingDecoderEnvelope,
  type FinanceProviderAccountIdentity,
  type SealedJournalMutationCommand,
  type VerifiedFinanceJournalCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  writeSealedJournalTransaction,
  type ResolvedJournalSourceScope
} from "./journal-transaction-writer";

const commandKeys = [
  "operationId",
  "postingRecipe",
  "journalLinkProof",
  "operationEnvelope"
] as const;
const postingRecipeKeys = [
  "kind",
  "authorizationStatus",
  "atomicityStatus",
  "transaction",
  "linkProof"
] as const;
const operationEnvelopeKeys = [
  "kind",
  "policyId",
  "policyVersion",
  "policyDigest",
  "maximumRows",
  "maximumDecimalDigits",
  "maximumArtifactBytes",
  "journalPosting"
] as const;
const journalPostingKeys = ["decoderEnvelope"] as const;
declare const resolvedPersistedProviderJournalScopeBrand: unique symbol;

export type PreparedSealedJournalMutation = Readonly<{
  operationId: string;
  transaction: SealedJournalMutationCommand["postingRecipe"]["transaction"];
  proof: SealedJournalMutationCommand["journalLinkProof"];
  decoderEnvelope: FinancePostingDecoderEnvelope;
}>;

export type ResolvedPersistedProviderJournalScope = Extract<
  ResolvedJournalSourceScope,
  { kind: "provider_account" | "provider_account_and_astrologer" }
> & {
  readonly [resolvedPersistedProviderJournalScopeBrand]: true;
};

export type SealedJournalCommitWriteBoundary = "sealed_journal";
export type SealedJournalCommitFailureInjector = (
  boundary: SealedJournalCommitWriteBoundary
) => void | Promise<void>;

export type SealedJournalCommitPersistenceReason =
  | "invalid_command"
  | "provider_identity_mismatch"
  | "journal_source_scope_mismatch"
  | "persistence_write_incomplete";

export class SealedJournalCommitPersistenceError extends Error {
  readonly code = "sealed_journal_commit_persistence_error";

  constructor(readonly reason: SealedJournalCommitPersistenceReason) {
    super("Sealed journal-only mutation could not be committed atomically");
    this.name = "SealedJournalCommitPersistenceError";
  }
}

/**
 * Internal composition seam. The caller owns the PostgreSQL transaction and supplies a provider
 * scope rehydrated from the exact immutable provider identity row, never from the public command.
 */
export async function commitSealedJournalMutationInTransaction(
  transaction: FinanceTransaction,
  command: SealedJournalMutationCommand,
  resolvedSourceScope: ResolvedPersistedProviderJournalScope,
  afterWriteBoundary: SealedJournalCommitFailureInjector = noFailureInjection
): Promise<VerifiedFinanceJournalCommitReceipt> {
  const prepared = prepareSealedJournalMutation(command);
  assertResolvedScopeMatchesTransaction(prepared, resolvedSourceScope);
  const receipt = await writeSealedJournalTransaction(transaction, {
    transaction: prepared.transaction,
    proof: prepared.proof,
    resolvedSourceScope,
    decoderEnvelope: prepared.decoderEnvelope
  });
  if (
    receipt.journalTransactionId !== prepared.transaction.id ||
    receipt.journalTransactionDigest !== digestFinanceCanonicalValueV1(prepared.transaction) ||
    receipt.journalLinkProofId !== prepared.proof.proofId ||
    receipt.journalLinkProofVersion !== prepared.proof.version ||
    receipt.journalLinkProofDigest !== prepared.proof.proofDigest
  ) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("sealed_journal");
  return receipt;
}

export function prepareSealedJournalMutation(
  command: SealedJournalMutationCommand
): PreparedSealedJournalMutation {
  return boundary(() => {
    assertExactOwnDataRecord(command, commandKeys);
    const candidate = command as SealedJournalMutationCommand;
    if (!identifier(candidate.operationId, 200)) fail("invalid_command");
    assertExactOwnDataRecord(candidate.postingRecipe, postingRecipeKeys);
    if (
      candidate.postingRecipe.kind !== "journal" ||
      candidate.postingRecipe.authorizationStatus !== "unverified" ||
      candidate.postingRecipe.atomicityStatus !== "unverified"
    ) {
      fail("invalid_command");
    }

    assertExactOwnDataRecord(candidate.operationEnvelope, operationEnvelopeKeys);
    assertExactOwnDataRecord(candidate.operationEnvelope.journalPosting, journalPostingKeys);
    const envelope = candidate.operationEnvelope;
    if (
      envelope.kind !== "resolved_finance_operation_envelope" ||
      !identifier(envelope.policyId, 200) ||
      !positiveInteger(envelope.policyVersion) ||
      !digest(envelope.policyDigest) ||
      !positiveInteger(envelope.maximumRows) ||
      !positiveInteger(envelope.maximumDecimalDigits) ||
      !positiveInteger(envelope.maximumArtifactBytes)
    ) {
      fail("invalid_command");
    }
    const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(
      envelope.journalPosting.decoderEnvelope
    );
    if (
      decoderEnvelope.maxJournalEntries > envelope.maximumRows ||
      decoderEnvelope.maxProofEdges > envelope.maximumRows ||
      decoderEnvelope.maxDecimalDigits > envelope.maximumDecimalDigits
    ) {
      fail("invalid_command");
    }
    const proof = rehydrateFinanceJournalLinkProof(candidate.journalLinkProof, decoderEnvelope);
    const recipeProof = rehydrateFinanceJournalLinkProof(
      candidate.postingRecipe.linkProof,
      decoderEnvelope
    );
    if (
      candidate.operationId !== proof.operationId ||
      !sameFinanceCanonicalValueV1(proof, recipeProof) ||
      proof.journalTransactionId !== candidate.postingRecipe.transaction.id
    ) {
      fail("invalid_command");
    }
    return Object.freeze({
      operationId: candidate.operationId,
      transaction: candidate.postingRecipe.transaction,
      proof,
      decoderEnvelope
    });
  });
}

export async function resolvePersistedProviderJournalSourceScope(
  transaction: FinanceTransaction,
  identity: FinanceProviderAccountIdentity
): Promise<ResolvedPersistedProviderJournalScope> {
  assertExactOwnDataRecord(identity, ["seriesId", "providerAccountId", "identityVersion"]);
  if (
    !identifier(identity.seriesId, 160) ||
    !identifier(identity.providerAccountId, 160) ||
    !positiveInteger(identity.identityVersion)
  ) {
    fail("provider_identity_mismatch");
  }
  const rows = await transaction
    .select({
      versionId: financeProviderAccounts.id,
      seriesId: financeProviderAccounts.seriesId,
      providerAccountId: financeProviderAccounts.providerAccountId,
      identityVersion: financeProviderAccounts.identityVersion,
      provider: financeProviderAccounts.provider
    })
    .from(financeProviderAccounts)
    .where(
      and(
        eq(financeProviderAccounts.seriesId, identity.seriesId),
        eq(financeProviderAccounts.providerAccountId, identity.providerAccountId),
        eq(financeProviderAccounts.identityVersion, identity.identityVersion)
      )
    )
    .limit(2)
    .for("share");
  const row = rows[0];
  if (
    rows.length !== 1 ||
    !row ||
    row.provider !== "arc_pay" ||
    row.seriesId !== identity.seriesId ||
    row.providerAccountId !== identity.providerAccountId ||
    row.identityVersion !== identity.identityVersion
  ) {
    fail("provider_identity_mismatch");
  }
  return Object.freeze({
    kind: "provider_account" as const,
    providerAccount: Object.freeze({
      versionId: row.versionId,
      seriesId: row.seriesId,
      providerAccountId: row.providerAccountId,
      identityVersion: row.identityVersion
    })
  }) as ResolvedPersistedProviderJournalScope;
}

/**
 * The client-sale full-commission branch has no payable wallet entry, but its order journal is
 * still scoped to the exact astrologer that sold the product.  Resolve that identity from the
 * locked order, not from the provider result or an untrusted journal command.
 */
export async function resolvePersistedProviderAstrologerJournalSourceScope(
  transaction: FinanceTransaction,
  identity: FinanceProviderAccountIdentity,
  astrologerUserId: string
): Promise<ResolvedPersistedProviderJournalScope> {
  if (!uuid(astrologerUserId)) fail("journal_source_scope_mismatch");
  const providerScope = await resolvePersistedProviderJournalSourceScope(transaction, identity);
  return Object.freeze({
    kind: "provider_account_and_astrologer" as const,
    providerAccount: providerScope.providerAccount,
    astrologerUserId
  }) as ResolvedPersistedProviderJournalScope;
}

function assertResolvedScopeMatchesTransaction(
  prepared: PreparedSealedJournalMutation,
  scope: ResolvedPersistedProviderJournalScope
): void {
  const providerIds = new Set(
    prepared.transaction.entries.flatMap((entry) =>
      "arcProviderAccountId" in entry.account ? [entry.account.arcProviderAccountId] : []
    )
  );
  if (
    providerIds.size !== 1 ||
    !providerIds.has(scope.providerAccount.providerAccountId) ||
    prepared.transaction.entries.some((entry) => "bankCashPoolId" in entry.account) ||
    (scope.kind === "provider_account" &&
      prepared.transaction.entries.some((entry) => "astrologerUserId" in entry.account)) ||
    (scope.kind === "provider_account_and_astrologer" &&
      prepared.transaction.entries.some(
        (entry) =>
          "astrologerUserId" in entry.account &&
          entry.account.astrologerUserId !== scope.astrologerUserId
      ))
  ) {
    fail("journal_source_scope_mismatch");
  }
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function assertExactOwnDataRecord(value: unknown, expectedKeys: readonly string[]): void {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    fail("invalid_command");
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    fail("invalid_command");
  }
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail("invalid_command");
    }
  }
}

function identifier(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    })
  );
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function digest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function boundary<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    if (error instanceof SealedJournalCommitPersistenceError) throw error;
    fail("invalid_command");
  }
}

function noFailureInjection(): void {}

function fail(reason: SealedJournalCommitPersistenceReason): never {
  throw new SealedJournalCommitPersistenceError(reason);
}
