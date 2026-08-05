import { Temporal } from "@js-temporal/polyfill";
import { types as nodeUtilTypes } from "node:util";
import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../finance-authorization/canonical-command-payload";
import { economicPaymentPurposeValues, type EconomicPaymentPurpose } from "./economic-payment";
import type { ArcProviderAccountIdentity } from "./provider-account";
import {
  createProviderAccountIdentityBinding,
  sameProviderAccountIdentityBinding,
  type ProviderAccountIdentityBinding
} from "./provider-account-binding";
import {
  createProviderDispatchEnvelope,
  type ProviderDispatchEnvelope
} from "./provider-dispatch-envelope";

export const providerOperationKindValues = [
  "checkout_session_create",
  "card_setup",
  "card_setup_execute",
  "card_setup_3ds_method_complete",
  "saved_card_charge",
  "saved_card_charge_3ds_method_complete",
  "refund",
  "void"
] as const;
export type ProviderOperationKind = (typeof providerOperationKindValues)[number];

export type ProviderOperationSource = Readonly<{
  kind: EconomicPaymentPurpose;
  id: string;
  economicIntentId: string;
  economicSessionId: string | null;
  providerAccount: ProviderAccountIdentityBinding;
}>;

export type ProviderOperationCanonicalEvidenceRef = Readonly<{
  kind: "canonical_provider_read" | "verified_webhook" | "settlement_entry";
  reference: string;
  digest: FinanceAuthorizationPayloadHash;
  observedAt: string;
}>;

export type ProviderOperationCanonicalResult = Readonly<{
  outcome: "succeeded" | "failed";
  evidence: ProviderOperationCanonicalEvidenceRef;
}>;

export type ProviderOperationFailedCanonicalResult = Readonly<{
  outcome: "failed";
  evidence: ProviderOperationCanonicalEvidenceRef;
}>;

export type ProviderOperationReplacementAuthority = Readonly<{
  authorityVersion: 1;
  predecessorIntentId: string;
  predecessorVersion: number;
  predecessorCreatedAt: string;
  predecessorProviderAccount: ArcProviderAccountIdentity;
  predecessorProviderAccountBinding: ProviderAccountIdentityBinding;
  predecessorPurpose: EconomicPaymentPurpose;
  predecessorOperationKind: ProviderOperationKind;
  predecessorSource: ProviderOperationSource;
  predecessorCanonicalRequestDigest: FinanceAuthorizationPayloadHash;
  predecessorCanonicalResult: ProviderOperationFailedCanonicalResult;
  candidateRequestDigest: FinanceAuthorizationPayloadHash;
  authorityDigest: FinanceAuthorizationPayloadHash;
}>;

type ProviderOperationReplacementAuthorityCore = Omit<
  ProviderOperationReplacementAuthority,
  "authorityDigest"
>;

export type ProviderOperationIntentStatus =
  | "pending_dispatch"
  | "requires_customer_action"
  | "provider_unknown"
  | "succeeded"
  | "failed";

export type ProviderOperationIntent = Readonly<{
  intentId: string;
  version: number;
  providerAccount: ArcProviderAccountIdentity;
  providerAccountBinding: ProviderAccountIdentityBinding;
  purpose: EconomicPaymentPurpose;
  operationKind: ProviderOperationKind;
  source: ProviderOperationSource;
  dispatchEnvelope: ProviderDispatchEnvelope;
  canonicalRequestDigest: FinanceAuthorizationPayloadHash;
  idempotencyKey: string;
  createdAt: string;
  idempotencyRetentionDeadline: string;
  status: ProviderOperationIntentStatus;
  providerUnknownObservedAt: string | null;
  canonicalResult: ProviderOperationCanonicalResult | null;
  predecessorIntentId: string | null;
  replacementAuthority: ProviderOperationReplacementAuthority | null;
}>;

export type CreateProviderOperationIntentInput = Readonly<{
  intentId: string;
  providerAccount: ArcProviderAccountIdentity;
  providerAccountBinding: ProviderAccountIdentityBinding;
  purpose: EconomicPaymentPurpose;
  operationKind: ProviderOperationKind;
  source: ProviderOperationSource;
  dispatchEnvelope: ProviderDispatchEnvelope;
  idempotencyKey: string;
  createdAt: string;
  idempotencyRetentionDeadline: string;
}>;

export type ProviderOperationSourceChain = Readonly<{
  source: ProviderOperationSource;
  version: number;
  intents: readonly ProviderOperationIntent[];
}>;

export type CreateProviderOperationIntentCommand = Readonly<{
  candidate: CreateProviderOperationIntentInput;
  sourceChain: ProviderOperationSourceChain;
  expectedSourceChainVersion: number;
  replacementAuthority: ProviderOperationReplacementAuthority | null;
}>;

export type CreateProviderOperationIntentResult = Readonly<{
  intent: ProviderOperationIntent;
  nextSourceChainVersion: number;
}>;

export type UnverifiedProviderOperationResultObservation =
  | Readonly<{
      kind: "provider_unknown";
      observedAt: string;
    }>
  | Readonly<{
      kind: "definitive_success" | "definitive_failure";
      canonicalEvidence: ProviderOperationCanonicalEvidenceRef;
    }>;

export type UnverifiedProviderOperationResultPlan = Readonly<{
  kind: "unverified_provider_operation_result_plan";
  authorityStatus: "unverified";
  currentIntent: ProviderOperationIntent;
  observation: UnverifiedProviderOperationResultObservation;
  proposedResult: Readonly<{
    nextVersion: number;
    status: Exclude<ProviderOperationIntentStatus, "pending_dispatch" | "requires_customer_action">;
    providerUnknownObservedAt: string | null;
    canonicalResult: ProviderOperationCanonicalResult | null;
  }>;
}>;

export type ProviderOperationRetryDecision =
  | Readonly<{
      kind: "retry_same_operation";
      intentId: string;
      expectedVersion: number;
      providerAccountBinding: ProviderAccountIdentityBinding;
      operationKind: ProviderOperationKind;
      source: ProviderOperationSource;
      dispatchEnvelope: ProviderDispatchEnvelope;
      canonicalRequestDigest: FinanceAuthorizationPayloadHash;
      idempotencyKey: string;
    }>
  | Readonly<{
      kind: "blocked_reconciliation_required";
      intentId: string;
      reason: "idempotency_retention_expired" | "sealed_secret_expired";
    }>;

export class ProviderOperationIntentIntegrityError extends Error {
  readonly code = "FINANCE_PROVIDER_OPERATION_INTENT_INTEGRITY_ERROR";

  constructor() {
    super("Provider operation intent integrity check failed");
    this.name = "ProviderOperationIntentIntegrityError";
  }
}

export class ProviderOperationIntentConflictError extends Error {
  readonly code = "FINANCE_PROVIDER_OPERATION_INTENT_CONFLICT";

  constructor() {
    super("Provider operation intent conflicts with current state");
    this.name = "ProviderOperationIntentConflictError";
  }
}

/**
 * Binds persisted saved-card dispatch to the authorization-issued logical credential identity.
 * Provider token resolution remains an outside-transaction I/O responsibility.
 */
export function assertSavedCardCredentialAuthorizationBinding(
  dispatchEnvelopeInput: unknown,
  savedCardCredentialIdInput: unknown,
  savedCardCredentialVersionInput: unknown
): void {
  const dispatchEnvelope = normalizeDispatchEnvelope(dispatchEnvelopeInput);
  if (dispatchEnvelope.kind !== "saved_card_charge") throw integrityError();
  const savedCardCredentialId = normalizeOpaqueValue(savedCardCredentialIdInput, 160);
  const savedCardCredentialVersion = normalizePositiveVersion(savedCardCredentialVersionInput);
  if (
    dispatchEnvelope.savedCardCredential.credentialId !== savedCardCredentialId ||
    dispatchEnvelope.savedCardCredential.credentialVersion !== savedCardCredentialVersion
  ) {
    throw integrityError();
  }
}

const operationKinds = new Set<string>(providerOperationKindValues);
const paymentPurposes = new Set<string>(economicPaymentPurposeValues);
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]+$/;
const idempotencyRetentionHours = 72;

const createIntentCommandKeys = [
  "candidate",
  "sourceChain",
  "expectedSourceChainVersion",
  "replacementAuthority"
] as const;
const createIntentCandidateKeys = [
  "intentId",
  "providerAccount",
  "providerAccountBinding",
  "purpose",
  "operationKind",
  "source",
  "dispatchEnvelope",
  "idempotencyKey",
  "createdAt",
  "idempotencyRetentionDeadline"
] as const;
const sourceChainKeys = ["source", "version", "intents"] as const;
const intentKeys = [
  "intentId",
  "version",
  "providerAccount",
  "providerAccountBinding",
  "purpose",
  "operationKind",
  "source",
  "dispatchEnvelope",
  "canonicalRequestDigest",
  "idempotencyKey",
  "createdAt",
  "idempotencyRetentionDeadline",
  "status",
  "providerUnknownObservedAt",
  "canonicalResult",
  "predecessorIntentId",
  "replacementAuthority"
] as const;
const providerAccountKeys = [
  "providerAccountId",
  "identityVersion",
  "provider",
  "merchantTenantId",
  "environment",
  "terminalScope",
  "settlementScope"
] as const;
const sourceKeys = [
  "kind",
  "id",
  "economicIntentId",
  "economicSessionId",
  "providerAccount"
] as const;
const recordResultKeys = ["intent", "expectedVersion", "result"] as const;
const retryKeys = ["intent", "now", "idempotencyKey"] as const;
const unknownResultKeys = ["kind", "observedAt"] as const;
const definitiveResultKeys = ["kind", "canonicalEvidence"] as const;
const canonicalEvidenceKeys = ["kind", "reference", "digest", "observedAt"] as const;
const canonicalResultKeys = ["outcome", "evidence"] as const;
const replacementAuthorityKeys = [
  "authorityVersion",
  "predecessorIntentId",
  "predecessorVersion",
  "predecessorCreatedAt",
  "predecessorProviderAccount",
  "predecessorProviderAccountBinding",
  "predecessorPurpose",
  "predecessorOperationKind",
  "predecessorSource",
  "predecessorCanonicalRequestDigest",
  "predecessorCanonicalResult",
  "candidateRequestDigest",
  "authorityDigest"
] as const;
const createReplacementAuthorityKeys = ["predecessor", "candidateRequestDigest"] as const;

export function createProviderOperationReplacementAuthority(
  input: unknown
): ProviderOperationReplacementAuthority {
  const fields = readExactOwnDataObject(input, createReplacementAuthorityKeys);
  const predecessor = normalizeIntent(fields.predecessor);
  const candidateRequestDigest = normalizeDigest(fields.candidateRequestDigest);
  if (
    predecessor.status !== "failed" ||
    predecessor.canonicalResult?.outcome !== "failed" ||
    candidateRequestDigest !== predecessor.canonicalRequestDigest
  ) {
    throw integrityError();
  }
  const core = createReplacementAuthorityCore(predecessor, candidateRequestDigest);
  return Object.freeze({ ...core, authorityDigest: hashReplacementAuthorityCore(core) });
}

export function createProviderOperationIntent(
  command: unknown
): CreateProviderOperationIntentResult {
  const commandFields = readExactOwnDataObject(command, createIntentCommandKeys);
  const candidateFields = readExactOwnDataObject(
    commandFields.candidate,
    createIntentCandidateKeys
  );
  const sourceChainFields = readExactOwnDataObject(commandFields.sourceChain, sourceChainKeys);
  const sourceChainVersion = normalizeVersion(sourceChainFields.version);
  assertExpectedVersion(sourceChainVersion, commandFields.expectedSourceChainVersion);
  const history = normalizeIntentHistory(sourceChainFields.intents);
  if (sourceChainVersion !== history.length) throw integrityError();
  assertIntentHistory(history);

  const created = parseInstant(candidateFields.createdAt);
  const retentionDeadline = parseInstant(candidateFields.idempotencyRetentionDeadline);
  assertRetentionDeadline(created, retentionDeadline);
  const providerAccount = normalizeProviderAccount(candidateFields.providerAccount);
  const providerAccountBinding = normalizeProviderAccountBinding(
    candidateFields.providerAccountBinding
  );
  assertFullIdentityMatchesBinding(providerAccount, providerAccountBinding);
  const purpose = normalizePurpose(candidateFields.purpose);
  const operationKind = normalizeOperationKind(candidateFields.operationKind);
  const source = normalizeSource(candidateFields.source);
  const dispatchEnvelope = normalizeDispatchEnvelope(candidateFields.dispatchEnvelope);
  assertPurposeOperationSourceMatrix(purpose, operationKind, source);
  assertProviderOperationCorrelation(
    operationKind,
    providerAccountBinding,
    source,
    dispatchEnvelope
  );
  assertDispatchEnvelopeValidAtCreation(dispatchEnvelope, created);
  const canonicalRequestDigest = hashDispatchEnvelope(dispatchEnvelope);
  const candidate = Object.freeze({
    intentId: normalizeOpaqueValue(candidateFields.intentId, 160),
    providerAccount,
    providerAccountBinding,
    purpose,
    operationKind,
    source,
    dispatchEnvelope,
    canonicalRequestDigest,
    idempotencyKey: normalizeIdempotencyKey(candidateFields.idempotencyKey),
    createdAt: created.toString(),
    idempotencyRetentionDeadline: retentionDeadline.toString()
  });
  const replacementAuthority = normalizeReplacementAuthority(commandFields.replacementAuthority);
  const sourceChainSource = normalizeSource(sourceChainFields.source);
  if (!sourcesEqual(sourceChainSource, source)) throw integrityError();
  if (history.some((intent) => !sourcesEqual(intent.source, sourceChainSource))) {
    throw integrityError();
  }
  if (
    history.some(
      (intent) =>
        intent.intentId === candidate.intentId || intent.idempotencyKey === candidate.idempotencyKey
    )
  ) {
    throw conflictError();
  }

  const predecessor = findHistoryLeaf(history);
  if (predecessor) {
    if (predecessor.status !== "failed") throw conflictError();
    if (
      predecessor.purpose !== candidate.purpose ||
      predecessor.operationKind !== candidate.operationKind ||
      !providerAccountsEqual(predecessor.providerAccount, candidate.providerAccount) ||
      !sameProviderAccountIdentityBinding(
        predecessor.providerAccountBinding,
        candidate.providerAccountBinding
      ) ||
      predecessor.canonicalRequestDigest !== candidate.canonicalRequestDigest
    ) {
      throw conflictError();
    }
    const terminalObservedAt = predecessor.canonicalResult?.evidence.observedAt;
    if (
      terminalObservedAt === undefined ||
      Temporal.Instant.compare(created, parseInstant(terminalObservedAt)) < 0
    ) {
      throw integrityError();
    }
    if (
      replacementAuthority === null ||
      !replacementAuthorityMatches(replacementAuthority, predecessor, candidate)
    ) {
      throw conflictError();
    }
  } else if (replacementAuthority !== null) {
    throw conflictError();
  }

  const intent = freezeIntent({
    ...candidate,
    version: 0,
    status: "pending_dispatch",
    providerUnknownObservedAt: null,
    canonicalResult: null,
    predecessorIntentId: predecessor?.intentId ?? null,
    replacementAuthority
  });
  return Object.freeze({ intent, nextSourceChainVersion: nextVersion(sourceChainVersion) });
}

/**
 * Validates an external observation and returns an explicitly unverified proposal. Only the
 * persistence result-application UoW may turn verified provider evidence into stored state.
 */
export function planUnverifiedProviderOperationResult(
  input: unknown
): UnverifiedProviderOperationResultPlan {
  const fields = readExactOwnDataObject(input, recordResultKeys);
  const intent = normalizeIntent(fields.intent);
  assertExpectedVersion(intent.version, fields.expectedVersion);
  if (intent.status === "succeeded" || intent.status === "failed") throw conflictError();

  const resultKind = readOwnDataDiscriminant(fields.result, "kind");
  if (resultKind === "provider_unknown") {
    const result = readExactOwnDataObject(fields.result, unknownResultKeys);
    const observedAt = parseInstant(result.observedAt);
    const priorObservedAt = intent.providerUnknownObservedAt
      ? parseInstant(intent.providerUnknownObservedAt)
      : parseInstant(intent.createdAt);
    if (Temporal.Instant.compare(observedAt, priorObservedAt) < 0) throw integrityError();
    const observation = Object.freeze({
      kind: "provider_unknown" as const,
      observedAt: observedAt.toString()
    });
    return Object.freeze({
      kind: "unverified_provider_operation_result_plan",
      authorityStatus: "unverified",
      currentIntent: intent,
      observation,
      proposedResult: Object.freeze({
        nextVersion: nextVersion(intent.version),
        status: "provider_unknown" as const,
        providerUnknownObservedAt: observation.observedAt,
        canonicalResult: null
      })
    });
  }
  if (resultKind !== "definitive_success" && resultKind !== "definitive_failure") {
    throw integrityError();
  }
  const result = readExactOwnDataObject(fields.result, definitiveResultKeys);
  const evidence = normalizeCanonicalEvidence(result.canonicalEvidence);
  const earliestCanonicalAt = intent.providerUnknownObservedAt ?? intent.createdAt;
  if (
    Temporal.Instant.compare(parseInstant(evidence.observedAt), parseInstant(earliestCanonicalAt)) <
    0
  ) {
    throw integrityError();
  }
  const outcome = resultKind === "definitive_success" ? "succeeded" : "failed";
  const canonicalResult = Object.freeze({ outcome, evidence });
  return Object.freeze({
    kind: "unverified_provider_operation_result_plan",
    authorityStatus: "unverified",
    currentIntent: intent,
    observation: Object.freeze({
      kind: resultKind,
      canonicalEvidence: evidence
    }),
    proposedResult: Object.freeze({
      nextVersion: nextVersion(intent.version),
      status: outcome,
      providerUnknownObservedAt: intent.providerUnknownObservedAt,
      canonicalResult
    })
  });
}

export function decideProviderOperationRetry(input: unknown): ProviderOperationRetryDecision {
  const fields = readExactOwnDataObject(input, retryKeys);
  const intent = normalizeIntent(fields.intent);
  if (intent.status !== "provider_unknown") throw conflictError();
  if (normalizeIdempotencyKey(fields.idempotencyKey) !== intent.idempotencyKey) {
    throw conflictError();
  }
  const now = parseInstant(fields.now);
  const unknownObservedAt = parseInstant(intent.providerUnknownObservedAt);
  if (Temporal.Instant.compare(now, unknownObservedAt) < 0) throw integrityError();
  if (Temporal.Instant.compare(now, parseInstant(intent.idempotencyRetentionDeadline)) >= 0) {
    return Object.freeze({
      kind: "blocked_reconciliation_required",
      intentId: intent.intentId,
      reason: "idempotency_retention_expired"
    });
  }
  if (
    intent.dispatchEnvelope.kind === "card_setup" &&
    intent.dispatchEnvelope.step === "execute" &&
    Temporal.Instant.compare(
      now,
      parseInstant(intent.dispatchEnvelope.tokenizationSecret.providerExpiresAt)
    ) >= 0
  ) {
    return Object.freeze({
      kind: "blocked_reconciliation_required",
      intentId: intent.intentId,
      reason: "sealed_secret_expired"
    });
  }
  return Object.freeze({
    kind: "retry_same_operation",
    intentId: intent.intentId,
    expectedVersion: intent.version,
    providerAccountBinding: intent.providerAccountBinding,
    operationKind: intent.operationKind,
    source: intent.source,
    dispatchEnvelope: intent.dispatchEnvelope,
    canonicalRequestDigest: intent.canonicalRequestDigest,
    idempotencyKey: intent.idempotencyKey
  });
}

function normalizeIntentHistory(value: unknown): readonly ProviderOperationIntent[] {
  return Object.freeze(readExactOwnDataArray(value).map((intent) => normalizeIntent(intent)));
}

function assertIntentHistory(history: readonly ProviderOperationIntent[]): void {
  const byId = new Map<string, ProviderOperationIntent>();
  const idempotencyKeys = new Set<string>();
  const childByPredecessor = new Set<string>();
  for (const intent of history) {
    if (byId.has(intent.intentId) || idempotencyKeys.has(intent.idempotencyKey)) {
      throw integrityError();
    }
    byId.set(intent.intentId, intent);
    idempotencyKeys.add(intent.idempotencyKey);
  }
  for (const intent of history) {
    if (intent.predecessorIntentId === null) {
      if (intent.replacementAuthority !== null) throw integrityError();
      continue;
    }
    if (childByPredecessor.has(intent.predecessorIntentId)) throw integrityError();
    childByPredecessor.add(intent.predecessorIntentId);
    const predecessor = byId.get(intent.predecessorIntentId);
    if (
      !predecessor ||
      predecessor.status !== "failed" ||
      !sourcesEqual(predecessor.source, intent.source) ||
      predecessor.purpose !== intent.purpose ||
      predecessor.operationKind !== intent.operationKind ||
      !providerAccountsEqual(predecessor.providerAccount, intent.providerAccount) ||
      !sameProviderAccountIdentityBinding(
        predecessor.providerAccountBinding,
        intent.providerAccountBinding
      ) ||
      predecessor.canonicalRequestDigest !== intent.canonicalRequestDigest ||
      intent.replacementAuthority === null ||
      !replacementAuthorityMatches(intent.replacementAuthority, predecessor, intent)
    ) {
      throw integrityError();
    }
    const predecessorObservedAt = predecessor.canonicalResult?.evidence.observedAt;
    if (
      predecessorObservedAt === undefined ||
      Temporal.Instant.compare(
        parseInstant(predecessorObservedAt),
        parseInstant(intent.createdAt)
      ) > 0
    ) {
      throw integrityError();
    }
  }
  if (history.length === 0) return;
  const roots = history.filter((intent) => intent.predecessorIntentId === null);
  const predecessorIds = new Set(
    history.flatMap((intent) =>
      intent.predecessorIntentId === null ? [] : [intent.predecessorIntentId]
    )
  );
  const leaves = history.filter((intent) => !predecessorIds.has(intent.intentId));
  if (roots.length !== 1 || leaves.length !== 1) throw integrityError();
  const seen = new Set<string>();
  let cursor: ProviderOperationIntent | undefined = leaves[0];
  while (cursor) {
    if (seen.has(cursor.intentId)) throw integrityError();
    seen.add(cursor.intentId);
    cursor = cursor.predecessorIntentId ? byId.get(cursor.predecessorIntentId) : undefined;
  }
  if (seen.size !== history.length) throw integrityError();
}

function findHistoryLeaf(
  history: readonly ProviderOperationIntent[]
): ProviderOperationIntent | null {
  if (history.length === 0) return null;
  const predecessorIds = new Set(
    history.flatMap((intent) =>
      intent.predecessorIntentId === null ? [] : [intent.predecessorIntentId]
    )
  );
  const leaves = history.filter((intent) => !predecessorIds.has(intent.intentId));
  if (leaves.length !== 1) throw integrityError();
  return leaves[0] ?? null;
}

function normalizeIntent(value: unknown): ProviderOperationIntent {
  const fields = readExactOwnDataObject(value, intentKeys);
  const version = normalizeVersion(fields.version);
  const intentId = normalizeOpaqueValue(fields.intentId, 160);
  const providerAccount = normalizeProviderAccount(fields.providerAccount);
  const providerAccountBinding = normalizeProviderAccountBinding(fields.providerAccountBinding);
  assertFullIdentityMatchesBinding(providerAccount, providerAccountBinding);
  const purpose = normalizePurpose(fields.purpose);
  const operationKind = normalizeOperationKind(fields.operationKind);
  const source = normalizeSource(fields.source);
  const dispatchEnvelope = normalizeDispatchEnvelope(fields.dispatchEnvelope);
  assertPurposeOperationSourceMatrix(purpose, operationKind, source);
  assertProviderOperationCorrelation(
    operationKind,
    providerAccountBinding,
    source,
    dispatchEnvelope
  );
  const canonicalRequestDigest = normalizeDigest(fields.canonicalRequestDigest);
  if (canonicalRequestDigest !== hashDispatchEnvelope(dispatchEnvelope)) throw integrityError();
  const idempotencyKey = normalizeIdempotencyKey(fields.idempotencyKey);
  const createdAt = parseInstant(fields.createdAt);
  assertDispatchEnvelopeValidAtCreation(dispatchEnvelope, createdAt);
  const retentionDeadline = parseInstant(fields.idempotencyRetentionDeadline);
  assertRetentionDeadline(createdAt, retentionDeadline);
  const status = normalizeStatus(fields.status);
  const providerUnknownObservedAt =
    fields.providerUnknownObservedAt === null
      ? null
      : parseInstant(fields.providerUnknownObservedAt).toString();
  const canonicalResult = normalizeCanonicalResult(fields.canonicalResult);
  const predecessorIntentId =
    fields.predecessorIntentId === null
      ? null
      : normalizeOpaqueValue(fields.predecessorIntentId, 160);
  const replacementAuthority = normalizeReplacementAuthority(fields.replacementAuthority);
  if (predecessorIntentId === intentId) throw integrityError();
  if ((predecessorIntentId === null) !== (replacementAuthority === null)) throw integrityError();
  if (
    replacementAuthority !== null &&
    (replacementAuthority.predecessorIntentId !== predecessorIntentId ||
      !sourcesEqual(replacementAuthority.predecessorSource, source) ||
      replacementAuthority.predecessorPurpose !== purpose ||
      replacementAuthority.predecessorOperationKind !== operationKind ||
      !providerAccountsEqual(replacementAuthority.predecessorProviderAccount, providerAccount) ||
      !sameProviderAccountIdentityBinding(
        replacementAuthority.predecessorProviderAccountBinding,
        providerAccountBinding
      ) ||
      replacementAuthority.candidateRequestDigest !== canonicalRequestDigest ||
      Temporal.Instant.compare(
        parseInstant(replacementAuthority.predecessorCanonicalResult.evidence.observedAt),
        createdAt
      ) > 0)
  ) {
    throw integrityError();
  }
  if (
    providerUnknownObservedAt !== null &&
    Temporal.Instant.compare(parseInstant(providerUnknownObservedAt), createdAt) < 0
  ) {
    throw integrityError();
  }
  if (
    canonicalResult !== null &&
    (Temporal.Instant.compare(parseInstant(canonicalResult.evidence.observedAt), createdAt) < 0 ||
      (providerUnknownObservedAt !== null &&
        Temporal.Instant.compare(
          parseInstant(canonicalResult.evidence.observedAt),
          parseInstant(providerUnknownObservedAt)
        ) < 0))
  ) {
    throw integrityError();
  }
  if (
    (status === "pending_dispatch" &&
      (version !== 0 || providerUnknownObservedAt !== null || canonicalResult !== null)) ||
    (status === "requires_customer_action" &&
      ((operationKind !== "card_setup_execute" &&
        operationKind !== "card_setup_3ds_method_complete" &&
        operationKind !== "saved_card_charge" &&
        operationKind !== "saved_card_charge_3ds_method_complete") ||
        version < 1 ||
        providerUnknownObservedAt !== null ||
        canonicalResult !== null)) ||
    (status === "provider_unknown" &&
      (version < 1 || providerUnknownObservedAt === null || canonicalResult !== null)) ||
    (status === "succeeded" &&
      (version < (providerUnknownObservedAt === null ? 1 : 2) ||
        canonicalResult?.outcome !== "succeeded")) ||
    (status === "failed" &&
      (version < (providerUnknownObservedAt === null ? 1 : 2) ||
        canonicalResult?.outcome !== "failed"))
  ) {
    throw integrityError();
  }
  return freezeIntent({
    intentId,
    version,
    providerAccount,
    providerAccountBinding,
    purpose,
    operationKind,
    source,
    dispatchEnvelope,
    canonicalRequestDigest,
    idempotencyKey,
    createdAt: createdAt.toString(),
    idempotencyRetentionDeadline: retentionDeadline.toString(),
    status,
    providerUnknownObservedAt,
    canonicalResult,
    predecessorIntentId,
    replacementAuthority
  });
}

function normalizeProviderAccount(value: unknown): ArcProviderAccountIdentity {
  const fields = readExactOwnDataObject(value, providerAccountKeys);
  if (
    fields.provider !== "arc_pay" ||
    (fields.environment !== "sandbox" && fields.environment !== "live") ||
    !Number.isSafeInteger(fields.identityVersion) ||
    Number(fields.identityVersion) < 1
  ) {
    throw integrityError();
  }
  return Object.freeze({
    providerAccountId: normalizeOpaqueValue(fields.providerAccountId, 160),
    identityVersion: Number(fields.identityVersion),
    provider: fields.provider,
    merchantTenantId: normalizeOpaqueValue(fields.merchantTenantId, 160),
    environment: fields.environment,
    terminalScope: normalizeOpaqueValue(fields.terminalScope, 160),
    settlementScope: normalizeOpaqueValue(fields.settlementScope, 160)
  });
}

function normalizeProviderAccountBinding(value: unknown): ProviderAccountIdentityBinding {
  try {
    return createProviderAccountIdentityBinding(value);
  } catch {
    throw integrityError();
  }
}

function assertFullIdentityMatchesBinding(
  identity: ArcProviderAccountIdentity,
  binding: ProviderAccountIdentityBinding
): void {
  if (
    identity.providerAccountId !== binding.providerAccountId ||
    identity.identityVersion !== binding.identityVersion
  ) {
    throw integrityError();
  }
}

function normalizePurpose(value: unknown): EconomicPaymentPurpose {
  if (typeof value !== "string" || !paymentPurposes.has(value)) throw integrityError();
  return value as EconomicPaymentPurpose;
}

function normalizeOperationKind(value: unknown): ProviderOperationKind {
  if (typeof value !== "string" || !operationKinds.has(value)) throw integrityError();
  return value as ProviderOperationKind;
}

function normalizeSource(value: unknown): ProviderOperationSource {
  const fields = readExactOwnDataObject(value, sourceKeys);
  return Object.freeze({
    kind: normalizePurpose(fields.kind),
    id: normalizeOpaqueValue(fields.id, 160),
    economicIntentId: normalizeOpaqueValue(fields.economicIntentId, 160),
    economicSessionId:
      fields.economicSessionId === null
        ? null
        : normalizeOpaqueValue(fields.economicSessionId, 160),
    providerAccount: normalizeProviderAccountBinding(fields.providerAccount)
  });
}

function normalizeDispatchEnvelope(value: unknown): ProviderDispatchEnvelope {
  try {
    return createProviderDispatchEnvelope(value);
  } catch {
    throw integrityError();
  }
}

function assertPurposeOperationSourceMatrix(
  purpose: EconomicPaymentPurpose,
  operationKind: ProviderOperationKind,
  source: ProviderOperationSource
): void {
  if (source.kind !== purpose) throw integrityError();
  const allowed =
    (operationKind === "checkout_session_create" && purpose === "client_order") ||
    ((operationKind === "card_setup" || operationKind === "card_setup_execute" || operationKind === "card_setup_3ds_method_complete") &&
      purpose === "platform_card_setup") ||
    ((operationKind === "saved_card_charge" ||
      operationKind === "saved_card_charge_3ds_method_complete") &&
      purpose === "platform_invoice") ||
    (operationKind === "refund" && purpose === "client_order") ||
    (operationKind === "void" && (purpose === "client_order" || purpose === "platform_invoice"));
  if (!allowed) throw integrityError();
}

function assertProviderOperationCorrelation(
  operationKind: ProviderOperationKind,
  providerAccountBinding: ProviderAccountIdentityBinding,
  source: ProviderOperationSource,
  dispatchEnvelope: ProviderDispatchEnvelope
): void {
  if (
    !operationEnvelopeMatchesKind(dispatchEnvelope, operationKind) ||
    !sameProviderAccountIdentityBinding(providerAccountBinding, source.providerAccount)
  ) {
    throw integrityError();
  }
  const requiresEconomicSession =
    operationKind === "checkout_session_create" ||
    operationKind === "card_setup" ||
    operationKind === "card_setup_execute" ||
    operationKind === "card_setup_3ds_method_complete" ||
    operationKind === "saved_card_charge" ||
    operationKind === "saved_card_charge_3ds_method_complete";
  if (
    (requiresEconomicSession && source.economicSessionId === null) ||
    (!requiresEconomicSession && source.economicSessionId !== null)
  ) {
    throw integrityError();
  }
}

function operationEnvelopeMatchesKind(
  envelope: ProviderDispatchEnvelope,
  operationKind: ProviderOperationKind
): boolean {
  return (
    (operationKind === "checkout_session_create" && envelope.kind === "checkout_session_create") ||
    (operationKind === "card_setup" && envelope.kind === "card_setup" && envelope.step === "create") ||
    (operationKind === "card_setup_execute" &&
      envelope.kind === "card_setup" &&
      envelope.step === "execute") ||
    (operationKind === "card_setup_3ds_method_complete" &&
      envelope.kind === "card_setup" &&
      envelope.step === "complete_3ds_method") ||
    (operationKind === "saved_card_charge" && envelope.kind === "saved_card_charge") ||
    (operationKind === "saved_card_charge_3ds_method_complete" &&
      envelope.kind === "saved_card_charge_3ds_method") ||
    (operationKind === "refund" && envelope.kind === "refund") ||
    (operationKind === "void" && envelope.kind === "void")
  );
}

function assertDispatchEnvelopeValidAtCreation(
  envelope: ProviderDispatchEnvelope,
  createdAt: Temporal.Instant
): void {
  if (
    ((envelope.kind === "card_setup" && envelope.step === "execute") ||
      (envelope.kind === "card_setup" && envelope.step === "complete_3ds_method") ||
      envelope.kind === "saved_card_charge_3ds_method") &&
    Temporal.Instant.compare(
      parseInstant(
        envelope.kind === "card_setup" && envelope.step === "execute"
          ? envelope.tokenizationSecret.providerExpiresAt
          : envelope.threeDsMethodContextSecret.providerExpiresAt
      ),
      createdAt
    ) <= 0
  ) {
    throw integrityError();
  }
}

function normalizeCanonicalEvidence(value: unknown): ProviderOperationCanonicalEvidenceRef {
  const fields = readExactOwnDataObject(value, canonicalEvidenceKeys);
  if (
    fields.kind !== "canonical_provider_read" &&
    fields.kind !== "verified_webhook" &&
    fields.kind !== "settlement_entry"
  ) {
    throw integrityError();
  }
  return Object.freeze({
    kind: fields.kind,
    reference: normalizeOpaqueValue(fields.reference, 320),
    digest: normalizeDigest(fields.digest),
    observedAt: parseInstant(fields.observedAt).toString()
  });
}

function normalizeCanonicalResult(value: unknown): ProviderOperationCanonicalResult | null {
  if (value === null) return null;
  const fields = readExactOwnDataObject(value, canonicalResultKeys);
  if (fields.outcome !== "succeeded" && fields.outcome !== "failed") throw integrityError();
  return Object.freeze({
    outcome: fields.outcome,
    evidence: normalizeCanonicalEvidence(fields.evidence)
  });
}

function normalizeFailedCanonicalResult(value: unknown): ProviderOperationFailedCanonicalResult {
  const fields = readExactOwnDataObject(value, canonicalResultKeys);
  if (fields.outcome !== "failed") throw integrityError();
  return Object.freeze({
    outcome: "failed",
    evidence: normalizeCanonicalEvidence(fields.evidence)
  });
}

function normalizeReplacementAuthority(
  value: unknown
): ProviderOperationReplacementAuthority | null {
  if (value === null) return null;
  const fields = readExactOwnDataObject(value, replacementAuthorityKeys);
  if (fields.authorityVersion !== 1) throw integrityError();
  const core: ProviderOperationReplacementAuthorityCore = Object.freeze({
    authorityVersion: 1,
    predecessorIntentId: normalizeOpaqueValue(fields.predecessorIntentId, 160),
    predecessorVersion: normalizePositiveVersion(fields.predecessorVersion),
    predecessorCreatedAt: parseInstant(fields.predecessorCreatedAt).toString(),
    predecessorProviderAccount: normalizeProviderAccount(fields.predecessorProviderAccount),
    predecessorProviderAccountBinding: normalizeProviderAccountBinding(
      fields.predecessorProviderAccountBinding
    ),
    predecessorPurpose: normalizePurpose(fields.predecessorPurpose),
    predecessorOperationKind: normalizeOperationKind(fields.predecessorOperationKind),
    predecessorSource: normalizeSource(fields.predecessorSource),
    predecessorCanonicalRequestDigest: normalizeDigest(fields.predecessorCanonicalRequestDigest),
    predecessorCanonicalResult: normalizeFailedCanonicalResult(fields.predecessorCanonicalResult),
    candidateRequestDigest: normalizeDigest(fields.candidateRequestDigest)
  });
  assertFullIdentityMatchesBinding(
    core.predecessorProviderAccount,
    core.predecessorProviderAccountBinding
  );
  assertPurposeOperationSourceMatrix(
    core.predecessorPurpose,
    core.predecessorOperationKind,
    core.predecessorSource
  );
  if (
    core.predecessorCanonicalRequestDigest !== core.candidateRequestDigest ||
    Temporal.Instant.compare(
      parseInstant(core.predecessorCanonicalResult.evidence.observedAt),
      parseInstant(core.predecessorCreatedAt)
    ) < 0 ||
    !sameProviderAccountIdentityBinding(
      core.predecessorProviderAccountBinding,
      core.predecessorSource.providerAccount
    )
  ) {
    throw integrityError();
  }
  const authorityDigest = normalizeDigest(fields.authorityDigest);
  if (authorityDigest !== hashReplacementAuthorityCore(core)) throw integrityError();
  return Object.freeze({ ...core, authorityDigest });
}

function createReplacementAuthorityCore(
  predecessor: ProviderOperationIntent,
  candidateRequestDigest: FinanceAuthorizationPayloadHash
): ProviderOperationReplacementAuthorityCore {
  if (predecessor.status !== "failed" || predecessor.canonicalResult?.outcome !== "failed") {
    throw integrityError();
  }
  return Object.freeze({
    authorityVersion: 1,
    predecessorIntentId: predecessor.intentId,
    predecessorVersion: predecessor.version,
    predecessorCreatedAt: predecessor.createdAt,
    predecessorProviderAccount: predecessor.providerAccount,
    predecessorProviderAccountBinding: predecessor.providerAccountBinding,
    predecessorPurpose: predecessor.purpose,
    predecessorOperationKind: predecessor.operationKind,
    predecessorSource: predecessor.source,
    predecessorCanonicalRequestDigest: predecessor.canonicalRequestDigest,
    predecessorCanonicalResult: Object.freeze({
      outcome: "failed",
      evidence: predecessor.canonicalResult.evidence
    }),
    candidateRequestDigest
  });
}

function replacementAuthorityMatches(
  authority: ProviderOperationReplacementAuthority,
  predecessor: ProviderOperationIntent,
  candidate: Readonly<{
    providerAccount: ArcProviderAccountIdentity;
    providerAccountBinding: ProviderAccountIdentityBinding;
    purpose: EconomicPaymentPurpose;
    operationKind: ProviderOperationKind;
    source: ProviderOperationSource;
    canonicalRequestDigest: FinanceAuthorizationPayloadHash;
    createdAt: string;
  }>
): boolean {
  return (
    predecessor.status === "failed" &&
    predecessor.canonicalResult?.outcome === "failed" &&
    authority.predecessorIntentId === predecessor.intentId &&
    authority.predecessorVersion === predecessor.version &&
    authority.predecessorCreatedAt === predecessor.createdAt &&
    providerAccountsEqual(authority.predecessorProviderAccount, predecessor.providerAccount) &&
    providerAccountsEqual(authority.predecessorProviderAccount, candidate.providerAccount) &&
    sameProviderAccountIdentityBinding(
      authority.predecessorProviderAccountBinding,
      predecessor.providerAccountBinding
    ) &&
    sameProviderAccountIdentityBinding(
      authority.predecessorProviderAccountBinding,
      candidate.providerAccountBinding
    ) &&
    authority.predecessorPurpose === predecessor.purpose &&
    authority.predecessorPurpose === candidate.purpose &&
    authority.predecessorOperationKind === predecessor.operationKind &&
    authority.predecessorOperationKind === candidate.operationKind &&
    sourcesEqual(authority.predecessorSource, predecessor.source) &&
    sourcesEqual(authority.predecessorSource, candidate.source) &&
    authority.predecessorCanonicalRequestDigest === predecessor.canonicalRequestDigest &&
    authority.candidateRequestDigest === candidate.canonicalRequestDigest &&
    authority.candidateRequestDigest === predecessor.canonicalRequestDigest &&
    canonicalResultEqual(authority.predecessorCanonicalResult, predecessor.canonicalResult) &&
    Temporal.Instant.compare(
      parseInstant(authority.predecessorCanonicalResult.evidence.observedAt),
      parseInstant(candidate.createdAt)
    ) <= 0
  );
}

function hashDispatchEnvelope(envelope: ProviderDispatchEnvelope): FinanceAuthorizationPayloadHash {
  try {
    return hashFinanceCommandPayload(envelope);
  } catch {
    throw integrityError();
  }
}

function hashReplacementAuthorityCore(
  core: ProviderOperationReplacementAuthorityCore
): FinanceAuthorizationPayloadHash {
  try {
    return hashFinanceCommandPayload(core);
  } catch {
    throw integrityError();
  }
}

function canonicalResultEqual(
  left: ProviderOperationCanonicalResult,
  right: ProviderOperationCanonicalResult
): boolean {
  return (
    left.outcome === right.outcome &&
    left.evidence.kind === right.evidence.kind &&
    left.evidence.reference === right.evidence.reference &&
    left.evidence.digest === right.evidence.digest &&
    left.evidence.observedAt === right.evidence.observedAt
  );
}

function sourcesEqual(left: ProviderOperationSource, right: ProviderOperationSource): boolean {
  return (
    left.kind === right.kind &&
    left.id === right.id &&
    left.economicIntentId === right.economicIntentId &&
    left.economicSessionId === right.economicSessionId &&
    sameProviderAccountIdentityBinding(left.providerAccount, right.providerAccount)
  );
}

function providerAccountsEqual(
  left: ArcProviderAccountIdentity,
  right: ArcProviderAccountIdentity
): boolean {
  return (
    left.providerAccountId === right.providerAccountId &&
    left.identityVersion === right.identityVersion &&
    left.provider === right.provider &&
    left.merchantTenantId === right.merchantTenantId &&
    left.environment === right.environment &&
    left.terminalScope === right.terminalScope &&
    left.settlementScope === right.settlementScope
  );
}

function normalizeStatus(value: unknown): ProviderOperationIntentStatus {
  if (
    value !== "pending_dispatch" &&
    value !== "requires_customer_action" &&
    value !== "provider_unknown" &&
    value !== "succeeded" &&
    value !== "failed"
  ) {
    throw integrityError();
  }
  return value;
}

function normalizeVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw integrityError();
  return Number(value);
}

function normalizePositiveVersion(value: unknown): number {
  const version = normalizeVersion(value);
  if (version < 1) throw integrityError();
  return version;
}

function normalizeDigest(value: unknown): FinanceAuthorizationPayloadHash {
  if (typeof value !== "string" || !digestPattern.test(value)) throw integrityError();
  return value as FinanceAuthorizationPayloadHash;
}

function normalizeIdempotencyKey(value: unknown): string {
  const normalized = normalizeOpaqueValue(value, 128);
  if (normalized.length < 8 || !idempotencyKeyPattern.test(normalized)) throw integrityError();
  return normalized;
}

function normalizeOpaqueValue(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })
  ) {
    throw integrityError();
  }
  return value;
}

function parseInstant(value: unknown): Temporal.Instant {
  if (typeof value !== "string") throw integrityError();
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw integrityError();
  }
}

function assertRetentionDeadline(created: Temporal.Instant, deadline: Temporal.Instant): void {
  if (Temporal.Instant.compare(deadline, created.add({ hours: idempotencyRetentionHours })) !== 0) {
    throw integrityError();
  }
}

function assertExpectedVersion(actual: number, expected: unknown): void {
  if (!Number.isSafeInteger(expected) || Number(expected) < 0) throw integrityError();
  if (expected !== actual) throw conflictError();
}

function nextVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 0 || version === Number.MAX_SAFE_INTEGER) {
    throw integrityError();
  }
  return version + 1;
}

function readOwnDataDiscriminant(value: unknown, key: string): unknown {
  assertPlainObject(value);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    throw integrityError();
  }
  return descriptor.value;
}

function readExactOwnDataObject<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  assertPlainObject(value);
  const expected = new Set<string>(expectedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length) throw integrityError();
  const fields = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) throw integrityError();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw integrityError();
    }
    fields[key] = descriptor.value;
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(fields, key)) throw integrityError();
  }
  return fields as Readonly<Record<Keys[number], unknown>>;
}

function readExactOwnDataArray(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null) throw integrityError();
  assertNotProxy(value);
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw integrityError();
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor)) throw integrityError();
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0) throw integrityError();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) throw integrityError();
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw integrityError();
    }
    result.push(descriptor.value);
  }
  return result;
}

function assertPlainObject(value: unknown): asserts value is object {
  if (typeof value !== "object" || value === null) throw integrityError();
  assertNotProxy(value);
  if (Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw integrityError();
  }
}

function assertNotProxy(value: object): void {
  try {
    if (nodeUtilTypes.isProxy(value)) throw integrityError();
  } catch (error) {
    if (error instanceof ProviderOperationIntentIntegrityError) throw error;
    throw integrityError();
  }
}

function freezeIntent(intent: ProviderOperationIntent): ProviderOperationIntent {
  return Object.freeze(intent);
}

function integrityError(): ProviderOperationIntentIntegrityError {
  return new ProviderOperationIntentIntegrityError();
}

function conflictError(): ProviderOperationIntentConflictError {
  return new ProviderOperationIntentConflictError();
}
