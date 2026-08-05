import type { Money } from "../money";
import { types as nodeUtilTypes } from "node:util";
import {
  createProviderAccountIdentityBinding,
  sameProviderAccountIdentityBinding,
  type ProviderAccountIdentityBinding
} from "./provider-account-binding";

export const economicPaymentPurposeValues = Object.freeze([
  "client_order",
  "platform_invoice",
  "platform_card_setup"
] as const);

export const economicPaymentStateValues = Object.freeze([
  "created",
  "checkout_opened",
  "pending",
  "pending_3ds",
  "authorized",
  "captured",
  "declined",
  "failed",
  "expired",
  "voided",
  "timeout",
  "provider_unknown"
] as const);

export const paymentClearingStateValues = Object.freeze([
  "unmatched",
  "settlement_seen",
  "provider_matched",
  "bank_matched"
] as const);

export type EconomicPaymentPurpose = (typeof economicPaymentPurposeValues)[number];
export type EconomicPaymentState = (typeof economicPaymentStateValues)[number];
export type PaymentClearingState = (typeof paymentClearingStateValues)[number];
export type EconomicPaymentSessionState = Exclude<EconomicPaymentState, "created">;
export type EconomicPaymentEvidenceKind = "canonical_provider_result" | "ambiguous_provider_result";

export type EconomicPaymentTransitionEvidence = Readonly<{
  fromState: EconomicPaymentSessionState;
  toState: EconomicPaymentSessionState;
  kind: EconomicPaymentEvidenceKind;
  evidenceId: string;
}>;

export type EconomicPaymentSession = Readonly<{
  sessionId: string;
  providerAccount: ProviderAccountIdentityBinding;
  state: EconomicPaymentSessionState;
  evidenceHistory: readonly EconomicPaymentTransitionEvidence[];
}>;

type EconomicCaptureEffectBase = Readonly<{
  intentId: string;
  sourceId: string;
  providerAccount: ProviderAccountIdentityBinding;
  providerPaymentId: string;
  amount: Money;
  canonicalEvidenceId: string;
}>;

export type EconomicCaptureEffect =
  | (EconomicCaptureEffectBase & { readonly kind: "client_sale_captured" })
  | (EconomicCaptureEffectBase & { readonly kind: "platform_invoice_captured" })
  | (EconomicCaptureEffectBase & { readonly kind: "platform_card_setup_captured" });

export type EconomicPaymentIntent = Readonly<{
  intentId: string;
  version: number;
  purpose: EconomicPaymentPurpose;
  sourceId: string;
  providerAccount: ProviderAccountIdentityBinding;
  amount: Money;
  state: EconomicPaymentState;
  sessions: readonly EconomicPaymentSession[];
  capture: EconomicCaptureEffect | null;
  captureSessionId: string | null;
}>;

export type PaymentClearingProjection = Readonly<{
  intentId: string;
  providerAccount: ProviderAccountIdentityBinding;
  currency: Money["currency"];
  version: number;
  state: PaymentClearingState;
  evidenceIds: readonly string[];
}>;

export type EconomicPaymentIntegrityReason =
  | "invalid_shape"
  | "unknown_field"
  | "invalid_field"
  | "amount_invalid"
  | "amount_invalid_for_purpose"
  | "intent_id_exists"
  | "source_intent_exists"
  | "version_conflict"
  | "economic_correlation_mismatch"
  | "active_or_unknown_session_exists"
  | "duplicate_session"
  | "session_not_found"
  | "state_transition_invalid"
  | "definitive_terminal_evidence_required"
  | "clearing_transition_invalid";

export class EconomicPaymentIntegrityError extends Error {
  readonly code = "economic_payment_integrity_violation";

  constructor(readonly reason: EconomicPaymentIntegrityReason) {
    super("Economic payment integrity check failed");
    this.name = "EconomicPaymentIntegrityError";
  }
}

export type EconomicPaymentCorrelation = Readonly<{
  intentId: string;
  purpose: EconomicPaymentPurpose;
  sourceId: string;
  providerAccount: ProviderAccountIdentityBinding;
  amount: Money;
}>;

export type ResolvedEconomicPaymentSourceSetInput = Readonly<{
  kind: "resolved_economic_payment_source_set_input";
  authorityStatus: "unverified";
  sourceId: string;
  intents: readonly EconomicPaymentIntent[];
}>;

export type UnverifiedProviderPaymentFact = Readonly<{
  kind: "unverified_provider_payment_fact";
  authorityStatus: "unverified";
  observedState: "captured";
  economicIntentId: string;
  economicSessionId: string;
  providerAccount: ProviderAccountIdentityBinding;
  providerPaymentId: string;
  evidenceRef: string;
  amount: Money;
}>;

export type UnverifiedProviderPaymentObservation = Readonly<{
  kind: "unverified_provider_payment_observation";
  authorityStatus: "unverified";
  confidence: "ambiguous" | "definitive";
  economicIntentId: string;
  economicSessionId: string;
  providerAccount: ProviderAccountIdentityBinding;
  observedState: EconomicPaymentSessionState;
  evidenceRef: string;
  amount: Money;
}>;

export type UnverifiedEconomicPaymentTransitionPlan = Readonly<{
  kind: "unverified_economic_payment_transition_plan";
  authorityStatus: "unverified";
  currentIntent: EconomicPaymentIntent;
  observation: UnverifiedProviderPaymentObservation;
  proposedTransition: Readonly<{
    economicSessionId: string;
    fromState: EconomicPaymentSessionState;
    toState: EconomicPaymentSessionState;
    evidenceRef: string;
  }>;
}>;

export type ProposedEconomicCaptureEffect = Readonly<{
  kind:
    | "proposed_client_sale_capture"
    | "proposed_platform_invoice_capture"
    | "proposed_platform_card_setup_capture";
  confirmationStatus: "unverified_proposal";
  intentId: string;
  sourceId: string;
  providerAccount: ProviderAccountIdentityBinding;
  providerPaymentId: string;
  amount: Money;
  providerFactRef: string;
}>;

export type UnverifiedCapturePlanningResult =
  | Readonly<{
      kind: "unverified_capture_plan";
      authorityStatus: "unverified";
      currentIntent: EconomicPaymentIntent;
      providerFact: UnverifiedProviderPaymentFact;
      proposedEffect: ProposedEconomicCaptureEffect;
    }>
  | Readonly<{
      kind: "unverified_capture_replay_observation";
      authorityStatus: "unverified";
      currentIntent: EconomicPaymentIntent;
      providerFact: UnverifiedProviderPaymentFact;
    }>
  | Readonly<{
      kind: "unverified_over_capture_observation";
      authorityStatus: "unverified";
      currentIntent: EconomicPaymentIntent;
      providerFact: UnverifiedProviderPaymentFact;
      observation: Readonly<{
        code: "economic_payment_over_capture";
        intentId: string;
        existingProviderPaymentId: string;
        laterProviderPaymentId: string;
        laterSessionId: string;
        laterEvidenceRef: string;
      }>;
    }>;

declare const persistedVerifiedEconomicPaymentCaptureReceiptBrand: unique symbol;

/**
 * Persistence-issued capture authority. The nominal brand deliberately has no public issuer:
 * only an adapter implementing the verified-capture persistence boundary may return this type.
 */
export type PersistedVerifiedEconomicPaymentCaptureReceipt = Readonly<{
  kind: "verified_provider_capture_receipt";
  authorityStatus: "verified_persisted";
  receiptId: string;
  intent: EconomicPaymentIntent;
  effect: EconomicCaptureEffect;
  [persistedVerifiedEconomicPaymentCaptureReceiptBrand]: true;
}>;

export type UnverifiedStoredEconomicPaymentCaptureCandidate = Readonly<{
  kind: "unverified_stored_economic_payment_capture_candidate";
  authorityStatus: "unverified";
  intent: EconomicPaymentIntent;
  effect: EconomicCaptureEffect;
}>;

const intentInputKeyValues = [
  "intentId",
  "version",
  "purpose",
  "sourceId",
  "providerAccount",
  "amount"
] as const;
const intentSnapshotKeyValues = [
  ...intentInputKeyValues,
  "state",
  "sessions",
  "capture",
  "captureSessionId"
] as const;
const moneyKeyValues = ["amountMinor", "currency"] as const;
const sessionKeyValues = ["sessionId", "providerAccount", "state", "evidenceHistory"] as const;
const transitionEvidenceKeyValues = ["fromState", "toState", "kind", "evidenceId"] as const;
const captureEffectKeyValues = [
  "kind",
  "intentId",
  "sourceId",
  "providerAccount",
  "providerPaymentId",
  "amount",
  "canonicalEvidenceId"
] as const;
const clearingProjectionKeyValues = [
  "intentId",
  "providerAccount",
  "currency",
  "version",
  "state",
  "evidenceIds"
] as const;
const correlationKeyValues = [
  "intentId",
  "purpose",
  "sourceId",
  "providerAccount",
  "amount"
] as const;
const openSessionCommandKeyValues = ["expectedVersion", "sessionId", "correlation"] as const;
const transitionPlanCommandKeyValues = ["expectedVersion", "observation"] as const;
const unverifiedProviderPaymentObservationKeyValues = [
  "kind",
  "authorityStatus",
  "confidence",
  "economicIntentId",
  "economicSessionId",
  "providerAccount",
  "observedState",
  "evidenceRef",
  "amount"
] as const;
const sourceSetInputKeyValues = ["kind", "authorityStatus", "sourceId", "intents"] as const;
const capturePlanCommandKeyValues = ["expectedVersion", "providerFact"] as const;
const unverifiedProviderPaymentFactKeyValues = [
  "kind",
  "authorityStatus",
  "observedState",
  "economicIntentId",
  "economicSessionId",
  "providerAccount",
  "providerPaymentId",
  "evidenceRef",
  "amount"
] as const;
const persistedVerifiedCaptureReceiptKeyValues = [
  "kind",
  "authorityStatus",
  "receiptId",
  "intent",
  "effect"
] as const;
const unverifiedStoredCaptureCandidateKeyValues = ["intent", "effect"] as const;
const clearingCommandKeyValues = ["expectedVersion", "nextState", "evidenceId"] as const;

const definitiveTerminalStates = new Set<EconomicPaymentState>([
  "captured",
  "declined",
  "failed",
  "expired",
  "voided"
]);
const ambiguousStates = new Set<EconomicPaymentState>(["timeout", "provider_unknown"]);

export function createEconomicPaymentIntent(
  input: unknown,
  sourceSetInput: unknown
): EconomicPaymentIntent {
  const candidate = parseIntentInput(input);
  const sourceSet = readExactOwnDataObject(
    sourceSetInput,
    sourceSetInputKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  if (
    sourceSet.kind !== "resolved_economic_payment_source_set_input" ||
    sourceSet.authorityStatus !== "unverified"
  ) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  const sourceId = requireOpaqueId(sourceSet.sourceId);
  if (sourceId !== candidate.sourceId) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
  const existing = readExactOwnDataArray(sourceSet.intents, "invalid_shape").map((value) =>
    hydrateEconomicPaymentIntent(value)
  );
  if (
    existing.some(
      (intent) => intent.sourceId !== candidate.sourceId && intent.intentId !== candidate.intentId
    )
  ) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
  if (existing.some((intent) => intent.intentId === candidate.intentId)) {
    throw new EconomicPaymentIntegrityError("intent_id_exists");
  }
  if (existing.some((intent) => intent.sourceId === candidate.sourceId)) {
    throw new EconomicPaymentIntegrityError("source_intent_exists");
  }

  return freezeIntent({
    ...candidate,
    state: "created",
    sessions: [],
    capture: null,
    captureSessionId: null
  });
}

export function openEconomicPaymentSession(
  intent: EconomicPaymentIntent,
  input: unknown
): EconomicPaymentIntent {
  const current = hydrateEconomicPaymentIntent(intent);
  const command = readExactOwnDataObject(
    input,
    openSessionCommandKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  assertExpectedVersion(current.version, command.expectedVersion);
  assertEconomicCorrelation(current, command.correlation);
  const sessionId = requireOpaqueId(command.sessionId);
  if (current.capture) {
    throw new EconomicPaymentIntegrityError("state_transition_invalid");
  }
  if (current.sessions.some((session) => session.sessionId === sessionId)) {
    throw new EconomicPaymentIntegrityError("duplicate_session");
  }

  const latestSession = current.sessions.at(-1);
  if (latestSession && !definitiveTerminalStates.has(latestSession.state)) {
    throw new EconomicPaymentIntegrityError("active_or_unknown_session_exists");
  }

  const nextSession = freezeSession({
    sessionId,
    providerAccount: current.providerAccount,
    state: "checkout_opened",
    evidenceHistory: []
  });
  return freezeIntent({
    ...current,
    version: current.version + 1,
    state: "checkout_opened",
    sessions: [...current.sessions, nextSession]
  });
}

export function planUnverifiedEconomicPaymentTransition(
  intent: EconomicPaymentIntent,
  input: unknown
): UnverifiedEconomicPaymentTransitionPlan {
  const currentIntent = hydrateEconomicPaymentIntent(intent);
  const command = readExactOwnDataObject(
    input,
    transitionPlanCommandKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  assertExpectedVersion(currentIntent.version, command.expectedVersion);
  const observation = parseUnverifiedProviderPaymentObservation(command.observation);
  if (
    observation.economicIntentId !== currentIntent.intentId ||
    !sameProviderAccountIdentityBinding(
      observation.providerAccount,
      currentIntent.providerAccount
    ) ||
    observation.amount.amountMinor !== currentIntent.amount.amountMinor ||
    observation.amount.currency !== currentIntent.amount.currency
  ) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
  const sessionId = observation.economicSessionId;
  const nextState = observation.observedState;
  const currentIndex = currentIntent.sessions.findIndex(
    (session) => session.sessionId === sessionId
  );
  if (currentIndex < 0) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
  if (currentIndex !== currentIntent.sessions.length - 1) {
    throw new EconomicPaymentIntegrityError("state_transition_invalid");
  }
  const currentSession = currentIntent.sessions[currentIndex];
  if (!currentSession || definitiveTerminalStates.has(currentSession.state)) {
    throw new EconomicPaymentIntegrityError("state_transition_invalid");
  }
  if (!isAllowedEconomicTransition(currentSession.state, nextState)) {
    throw new EconomicPaymentIntegrityError("state_transition_invalid");
  }

  const expectedConfidence = ambiguousStates.has(nextState) ? "ambiguous" : "definitive";
  if (observation.confidence !== expectedConfidence) {
    if (definitiveTerminalStates.has(nextState) || nextState === "authorized") {
      throw new EconomicPaymentIntegrityError("definitive_terminal_evidence_required");
    }
    throw new EconomicPaymentIntegrityError("state_transition_invalid");
  }

  return Object.freeze({
    kind: "unverified_economic_payment_transition_plan",
    authorityStatus: "unverified",
    currentIntent,
    observation,
    proposedTransition: Object.freeze({
      economicSessionId: sessionId,
      fromState: currentSession.state,
      toState: nextState,
      evidenceRef: observation.evidenceRef
    })
  });
}

export function planUnverifiedCapture(
  intent: EconomicPaymentIntent,
  input: unknown
): UnverifiedCapturePlanningResult {
  const current = hydrateEconomicPaymentIntent(intent);
  const command = readExactOwnDataObject(
    input,
    capturePlanCommandKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  assertExpectedVersion(current.version, command.expectedVersion);
  const providerFact = parseUnverifiedProviderPaymentFact(command.providerFact);
  if (
    providerFact.economicIntentId !== current.intentId ||
    !sameProviderAccountIdentityBinding(providerFact.providerAccount, current.providerAccount) ||
    providerFact.amount.amountMinor !== current.amount.amountMinor ||
    providerFact.amount.currency !== current.amount.currency
  ) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
  const sessionId = providerFact.economicSessionId;
  const sessionIndex = current.sessions.findIndex((session) => session.sessionId === sessionId);
  const session = current.sessions[sessionIndex];
  if (!session) {
    throw new EconomicPaymentIntegrityError("session_not_found");
  }

  if (current.capture) {
    if (current.capture.providerPaymentId === providerFact.providerPaymentId) {
      if (current.captureSessionId !== sessionId) {
        throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
      }
      return Object.freeze({
        kind: "unverified_capture_replay_observation",
        authorityStatus: "unverified",
        currentIntent: current,
        providerFact
      });
    }

    return Object.freeze({
      kind: "unverified_over_capture_observation",
      authorityStatus: "unverified",
      currentIntent: current,
      providerFact,
      observation: Object.freeze({
        code: "economic_payment_over_capture",
        intentId: current.intentId,
        existingProviderPaymentId: current.capture.providerPaymentId,
        laterProviderPaymentId: providerFact.providerPaymentId,
        laterSessionId: sessionId,
        laterEvidenceRef: providerFact.evidenceRef
      })
    });
  }

  if (sessionIndex !== current.sessions.length - 1 || definitiveTerminalStates.has(session.state)) {
    throw new EconomicPaymentIntegrityError("state_transition_invalid");
  }

  return Object.freeze({
    kind: "unverified_capture_plan",
    authorityStatus: "unverified",
    currentIntent: current,
    providerFact,
    proposedEffect: freezeProposedCaptureEffect({
      kind: proposedCaptureEffectKind(current.purpose),
      confirmationStatus: "unverified_proposal",
      intentId: current.intentId,
      sourceId: current.sourceId,
      providerAccount: current.providerAccount,
      providerPaymentId: providerFact.providerPaymentId,
      amount: current.amount,
      providerFactRef: providerFact.evidenceRef
    })
  });
}

/**
 * Validates and projects an already nominal persistence-issued receipt. This is a consumer, not
 * an issuer: structurally matching unknown data cannot enter through its TypeScript boundary.
 */
export function readPersistedVerifiedEconomicPaymentCaptureReceipt(
  input: PersistedVerifiedEconomicPaymentCaptureReceipt
): PersistedVerifiedEconomicPaymentCaptureReceipt {
  const fields = readExactOwnDataObject(
    input,
    persistedVerifiedCaptureReceiptKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  if (
    fields.kind !== "verified_provider_capture_receipt" ||
    fields.authorityStatus !== "verified_persisted"
  ) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  const receiptId = requireOpaqueId(fields.receiptId);
  const { intent, effect } = normalizeCapturedEconomicPaymentSnapshot(fields.intent, fields.effect);
  if (receiptId !== effect.canonicalEvidenceId) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
  return Object.freeze({
    ...input,
    kind: fields.kind,
    authorityStatus: fields.authorityStatus,
    receiptId,
    intent,
    effect
  });
}

/** Strict reconstruction/audit decoder. Its result is deliberately never payment authority. */
export function readUnverifiedStoredEconomicPaymentCaptureCandidate(
  input: unknown
): UnverifiedStoredEconomicPaymentCaptureCandidate {
  const fields = readExactOwnDataObject(
    input,
    unverifiedStoredCaptureCandidateKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  const { intent, effect } = normalizeCapturedEconomicPaymentSnapshot(fields.intent, fields.effect);
  return Object.freeze({
    kind: "unverified_stored_economic_payment_capture_candidate",
    authorityStatus: "unverified",
    intent,
    effect
  });
}

export function createPaymentClearingProjection(
  intent: EconomicPaymentIntent
): PaymentClearingProjection {
  const current = hydrateEconomicPaymentIntent(intent);
  return freezeClearingProjection({
    intentId: current.intentId,
    providerAccount: current.providerAccount,
    currency: current.amount.currency,
    version: 1,
    state: "unmatched",
    evidenceIds: []
  });
}

export function advancePaymentClearing(
  projection: PaymentClearingProjection,
  input: unknown
): PaymentClearingProjection {
  const current = hydrateClearingProjection(projection);
  const command = readExactOwnDataObject(
    input,
    clearingCommandKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  assertExpectedVersion(current.version, command.expectedVersion);
  const nextState = parseClearingState(command.nextState);
  if (nextState !== clearingSuccessor(current.state)) {
    throw new EconomicPaymentIntegrityError("clearing_transition_invalid");
  }
  const evidenceId = requireOpaqueId(command.evidenceId);
  if (current.evidenceIds.includes(evidenceId)) {
    throw new EconomicPaymentIntegrityError("clearing_transition_invalid");
  }

  return freezeClearingProjection({
    ...current,
    version: current.version + 1,
    state: nextState,
    evidenceIds: [...current.evidenceIds, evidenceId]
  });
}

function parseIntentInput(
  input: unknown
): Pick<
  EconomicPaymentIntent,
  "intentId" | "version" | "purpose" | "sourceId" | "providerAccount" | "amount"
> {
  const fields = readExactOwnDataObject(
    input,
    intentInputKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  const intentId = requireOpaqueId(fields.intentId);
  const sourceId = requireOpaqueId(fields.sourceId);
  const providerAccount = parseProviderAccountBinding(fields.providerAccount, "invalid_field");
  if (fields.version !== 1) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  const purpose = parsePurpose(fields.purpose);
  const amount = parseMoney(fields.amount);
  assertAmountMatchesPurpose(purpose, amount);
  return { intentId, version: 1, purpose, sourceId, providerAccount, amount };
}

function hydrateEconomicPaymentIntent(value: unknown): EconomicPaymentIntent {
  const fields = readExactOwnDataObject(
    value,
    intentSnapshotKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  const intentId = requireOpaqueId(fields.intentId);
  const sourceId = requireOpaqueId(fields.sourceId);
  const providerAccount = parseProviderAccountBinding(fields.providerAccount, "invalid_field");
  if (!Number.isSafeInteger(fields.version) || Number(fields.version) < 1) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  const version = Number(fields.version);
  const purpose = parsePurpose(fields.purpose);
  const amount = parseMoney(fields.amount);
  assertAmountMatchesPurpose(purpose, amount);
  const state = parseEconomicPaymentState(fields.state);
  const sessions = readExactOwnDataArray(fields.sessions, "invalid_shape").map((session) =>
    hydratePaymentSession(session)
  );
  const capture =
    fields.capture === null ? null : hydrateCaptureEffect(fields.capture, "invalid_shape");
  const captureSessionId = parseNullableOpaqueId(fields.captureSessionId);

  const sessionIds = new Set<string>();
  for (const [index, session] of sessions.entries()) {
    if (sessionIds.has(session.sessionId)) {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
    sessionIds.add(session.sessionId);
    if (!sameProviderAccountIdentityBinding(session.providerAccount, providerAccount)) {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
    if (index < sessions.length - 1 && !definitiveTerminalStates.has(session.state)) {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
  }
  const latestSession = sessions.at(-1);
  if (latestSession ? latestSession.state !== state : state !== "created") {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  const derivedVersion =
    1 +
    sessions.length +
    sessions.reduce((total, session) => total + session.evidenceHistory.length, 0);
  if (version !== derivedVersion) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }

  if (capture === null) {
    if (captureSessionId !== null || state === "captured") {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
  } else {
    if (captureSessionId === null) {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
    assertCaptureCorrelation(capture, { intentId, purpose, sourceId, providerAccount, amount });
    const capturedSession = sessions.find((session) => session.sessionId === captureSessionId);
    const latestEvidence = capturedSession?.evidenceHistory.at(-1);
    if (
      state !== "captured" ||
      latestSession?.sessionId !== captureSessionId ||
      capturedSession?.state !== "captured" ||
      latestEvidence?.toState !== "captured" ||
      latestEvidence.kind !== "canonical_provider_result" ||
      latestEvidence.evidenceId !== capture.canonicalEvidenceId
    ) {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
  }

  return freezeIntent({
    intentId,
    version,
    purpose,
    sourceId,
    providerAccount,
    amount,
    state,
    sessions,
    capture,
    captureSessionId
  });
}

function hydratePaymentSession(value: unknown): EconomicPaymentSession {
  const fields = readExactOwnDataObject(value, sessionKeyValues, "invalid_shape", "invalid_shape");
  const sessionId = requireOpaqueId(fields.sessionId);
  const providerAccount = parseProviderAccountBinding(fields.providerAccount, "invalid_field");
  const state = parseTransitionState(fields.state);
  const evidenceHistory = readExactOwnDataArray(fields.evidenceHistory, "invalid_shape").map(
    (evidence) => hydrateTransitionEvidence(evidence)
  );

  let observedState: EconomicPaymentSessionState = "checkout_opened";
  for (const [index, evidence] of evidenceHistory.entries()) {
    if (
      evidence.fromState !== observedState ||
      !isAllowedEvidenceTransition(evidence.fromState, evidence.toState)
    ) {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
    const expectedKind = ambiguousStates.has(evidence.toState)
      ? "ambiguous_provider_result"
      : "canonical_provider_result";
    if (evidence.kind !== expectedKind) {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
    if (index < evidenceHistory.length - 1 && definitiveTerminalStates.has(evidence.toState)) {
      throw new EconomicPaymentIntegrityError("invalid_field");
    }
    observedState = evidence.toState;
  }
  if (observedState !== state) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return freezeSession({ sessionId, providerAccount, state, evidenceHistory });
}

function hydrateTransitionEvidence(value: unknown): EconomicPaymentTransitionEvidence {
  const fields = readExactOwnDataObject(
    value,
    transitionEvidenceKeyValues,
    "invalid_shape",
    "invalid_shape"
  );
  return freezeTransitionEvidence({
    fromState: parseTransitionState(fields.fromState),
    toState: parseTransitionState(fields.toState),
    kind: parseEvidenceKind(fields.kind),
    evidenceId: requireOpaqueId(fields.evidenceId)
  });
}

function hydrateCaptureEffect(
  value: unknown,
  invalidReason: EconomicPaymentIntegrityReason
): EconomicCaptureEffect {
  const fields = readExactOwnDataObject(
    value,
    captureEffectKeyValues,
    invalidReason,
    invalidReason
  );
  const kind = parseCaptureEffectKind(fields.kind);
  return freezeCaptureEffect({
    kind,
    intentId: requireOpaqueId(fields.intentId),
    sourceId: requireOpaqueId(fields.sourceId),
    providerAccount: parseProviderAccountBinding(fields.providerAccount, invalidReason),
    providerPaymentId: requireOpaqueId(fields.providerPaymentId),
    amount: parseMoney(fields.amount),
    canonicalEvidenceId: requireOpaqueId(fields.canonicalEvidenceId)
  } as EconomicCaptureEffect);
}

function hydrateClearingProjection(value: unknown): PaymentClearingProjection {
  const fields = readExactOwnDataObject(
    value,
    clearingProjectionKeyValues,
    "invalid_shape",
    "invalid_shape"
  );
  const intentId = requireOpaqueId(fields.intentId);
  const providerAccount = parseProviderAccountBinding(fields.providerAccount, "invalid_field");
  if (fields.currency !== "RUB" || !Number.isSafeInteger(fields.version)) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  const version = Number(fields.version);
  const state = parseClearingState(fields.state);
  const evidenceIds = readExactOwnDataArray(fields.evidenceIds, "invalid_shape").map((value) =>
    requireOpaqueId(value)
  );
  const expectedEvidenceCount = paymentClearingStateValues.indexOf(state);
  if (version !== expectedEvidenceCount + 1 || evidenceIds.length !== expectedEvidenceCount) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return freezeClearingProjection({
    intentId,
    providerAccount,
    currency: "RUB",
    version,
    state,
    evidenceIds
  });
}

function assertEconomicCorrelation(intent: EconomicPaymentIntent, value: unknown): void {
  const fields = readExactOwnDataObject(
    value,
    correlationKeyValues,
    "economic_correlation_mismatch",
    "economic_correlation_mismatch"
  );
  const amount = parseCorrelationMoney(fields.amount);
  const providerAccount = parseProviderAccountBinding(
    fields.providerAccount,
    "economic_correlation_mismatch"
  );
  if (
    fields.intentId !== intent.intentId ||
    fields.purpose !== intent.purpose ||
    fields.sourceId !== intent.sourceId ||
    !sameProviderAccountIdentityBinding(providerAccount, intent.providerAccount) ||
    amount.amountMinor !== intent.amount.amountMinor ||
    amount.currency !== intent.amount.currency
  ) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
}

function assertCaptureCorrelation(
  effect: EconomicCaptureEffect,
  expected: Pick<
    EconomicPaymentIntent,
    "intentId" | "purpose" | "sourceId" | "providerAccount" | "amount"
  >
): void {
  if (
    effect.kind !== captureEffectKind(expected.purpose) ||
    effect.intentId !== expected.intentId ||
    effect.sourceId !== expected.sourceId ||
    !sameProviderAccountIdentityBinding(effect.providerAccount, expected.providerAccount) ||
    effect.amount.amountMinor !== expected.amount.amountMinor ||
    effect.amount.currency !== expected.amount.currency
  ) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
}

function sameCaptureEffect(left: EconomicCaptureEffect, right: EconomicCaptureEffect): boolean {
  return (
    left.kind === right.kind &&
    left.intentId === right.intentId &&
    left.sourceId === right.sourceId &&
    sameProviderAccountIdentityBinding(left.providerAccount, right.providerAccount) &&
    left.providerPaymentId === right.providerPaymentId &&
    left.amount.amountMinor === right.amount.amountMinor &&
    left.amount.currency === right.amount.currency &&
    left.canonicalEvidenceId === right.canonicalEvidenceId
  );
}

function normalizeCapturedEconomicPaymentSnapshot(
  intentInput: unknown,
  effectInput: unknown
): Readonly<{ intent: EconomicPaymentIntent; effect: EconomicCaptureEffect }> {
  const intent = hydrateEconomicPaymentIntent(intentInput);
  const effect = hydrateCaptureEffect(effectInput, "invalid_shape");
  if (intent.capture === null || !sameCaptureEffect(intent.capture, effect)) {
    throw new EconomicPaymentIntegrityError("economic_correlation_mismatch");
  }
  return Object.freeze({ intent, effect });
}

function parseUnverifiedProviderPaymentFact(value: unknown): UnverifiedProviderPaymentFact {
  const fields = readExactOwnDataObject(
    value,
    unverifiedProviderPaymentFactKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  if (
    fields.kind !== "unverified_provider_payment_fact" ||
    fields.authorityStatus !== "unverified" ||
    fields.observedState !== "captured"
  ) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return freezeUnverifiedProviderPaymentFact({
    kind: fields.kind,
    authorityStatus: fields.authorityStatus,
    observedState: fields.observedState,
    economicIntentId: requireOpaqueId(fields.economicIntentId),
    economicSessionId: requireOpaqueId(fields.economicSessionId),
    providerAccount: parseProviderAccountBinding(fields.providerAccount, "invalid_field"),
    providerPaymentId: requireOpaqueId(fields.providerPaymentId),
    evidenceRef: requireOpaqueId(fields.evidenceRef),
    amount: parseMoney(fields.amount)
  });
}

function parseUnverifiedProviderPaymentObservation(
  value: unknown
): UnverifiedProviderPaymentObservation {
  const fields = readExactOwnDataObject(
    value,
    unverifiedProviderPaymentObservationKeyValues,
    "invalid_shape",
    "unknown_field"
  );
  if (
    fields.kind !== "unverified_provider_payment_observation" ||
    fields.authorityStatus !== "unverified" ||
    (fields.confidence !== "ambiguous" && fields.confidence !== "definitive")
  ) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return freezeUnverifiedProviderPaymentObservation({
    kind: fields.kind,
    authorityStatus: fields.authorityStatus,
    confidence: fields.confidence,
    economicIntentId: requireOpaqueId(fields.economicIntentId),
    economicSessionId: requireOpaqueId(fields.economicSessionId),
    providerAccount: parseProviderAccountBinding(fields.providerAccount, "invalid_field"),
    observedState: parseTransitionState(fields.observedState),
    evidenceRef: requireOpaqueId(fields.evidenceRef),
    amount: parseMoney(fields.amount)
  });
}

function isAllowedEconomicTransition(
  current: EconomicPaymentSessionState,
  next: EconomicPaymentSessionState
): boolean {
  if (current === next || next === "captured" || next === "checkout_opened") return false;
  switch (current) {
    case "checkout_opened":
    case "pending":
    case "pending_3ds":
    case "timeout":
    case "provider_unknown":
      return true;
    case "authorized":
      return next === "voided" || next === "timeout" || next === "provider_unknown";
    case "captured":
    case "declined":
    case "failed":
    case "expired":
    case "voided":
      return false;
  }
}

function isAllowedEvidenceTransition(
  current: EconomicPaymentSessionState,
  next: EconomicPaymentSessionState
): boolean {
  if (next === "captured") return !definitiveTerminalStates.has(current);
  return isAllowedEconomicTransition(current, next);
}

function parseEvidenceKind(value: unknown): EconomicPaymentEvidenceKind {
  if (value !== "canonical_provider_result" && value !== "ambiguous_provider_result") {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return value;
}

function parseEconomicPaymentState(value: unknown): EconomicPaymentState {
  if (typeof value !== "string" || !economicPaymentStateValues.some((state) => state === value)) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return value as EconomicPaymentState;
}

function parseTransitionState(value: unknown): EconomicPaymentSessionState {
  if (
    typeof value !== "string" ||
    value === "created" ||
    !economicPaymentStateValues.some((state) => state === value)
  ) {
    throw new EconomicPaymentIntegrityError("state_transition_invalid");
  }
  return value as EconomicPaymentSessionState;
}

function parseClearingState(value: unknown): PaymentClearingState {
  if (typeof value !== "string" || !paymentClearingStateValues.some((state) => state === value)) {
    throw new EconomicPaymentIntegrityError("clearing_transition_invalid");
  }
  return value as PaymentClearingState;
}

function clearingSuccessor(state: PaymentClearingState): PaymentClearingState | null {
  switch (state) {
    case "unmatched":
      return "settlement_seen";
    case "settlement_seen":
      return "provider_matched";
    case "provider_matched":
      return "bank_matched";
    case "bank_matched":
      return null;
  }
}

function parsePurpose(value: unknown): EconomicPaymentPurpose {
  if (
    typeof value !== "string" ||
    !economicPaymentPurposeValues.some((purpose) => purpose === value)
  ) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return value as EconomicPaymentPurpose;
}

function parseCaptureEffectKind(value: unknown): EconomicCaptureEffect["kind"] {
  if (
    value !== "client_sale_captured" &&
    value !== "platform_invoice_captured" &&
    value !== "platform_card_setup_captured"
  ) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return value;
}

function captureEffectKind(purpose: EconomicPaymentPurpose): EconomicCaptureEffect["kind"] {
  switch (purpose) {
    case "client_order":
      return "client_sale_captured";
    case "platform_invoice":
      return "platform_invoice_captured";
    case "platform_card_setup":
      return "platform_card_setup_captured";
  }
}

function proposedCaptureEffectKind(
  purpose: EconomicPaymentPurpose
): ProposedEconomicCaptureEffect["kind"] {
  switch (purpose) {
    case "client_order":
      return "proposed_client_sale_capture";
    case "platform_invoice":
      return "proposed_platform_invoice_capture";
    case "platform_card_setup":
      return "proposed_platform_card_setup_capture";
  }
}

function parseMoney(value: unknown): Money {
  return parseMoneyWithReason(value, "amount_invalid");
}

function parseCorrelationMoney(value: unknown): Money {
  return parseMoneyWithReason(value, "economic_correlation_mismatch");
}

function parseProviderAccountBinding(
  value: unknown,
  reason: EconomicPaymentIntegrityReason
): ProviderAccountIdentityBinding {
  try {
    return createProviderAccountIdentityBinding(value);
  } catch {
    throw new EconomicPaymentIntegrityError(reason);
  }
}

function parseMoneyWithReason(value: unknown, reason: EconomicPaymentIntegrityReason): Money {
  const fields = readExactOwnDataObject(value, moneyKeyValues, reason, reason);
  if (
    !Number.isSafeInteger(fields.amountMinor) ||
    Number(fields.amountMinor) < 0 ||
    fields.currency !== "RUB"
  ) {
    throw new EconomicPaymentIntegrityError(reason);
  }
  return Object.freeze({ amountMinor: Number(fields.amountMinor), currency: "RUB" });
}

function assertAmountMatchesPurpose(purpose: EconomicPaymentPurpose, amount: Money): void {
  if (
    (purpose === "platform_card_setup" && amount.amountMinor !== 0) ||
    (purpose !== "platform_card_setup" && amount.amountMinor === 0)
  ) {
    throw new EconomicPaymentIntegrityError("amount_invalid_for_purpose");
  }
}

function assertExpectedVersion(actual: number, expected: unknown): void {
  if (!Number.isSafeInteger(expected) || actual !== expected) {
    throw new EconomicPaymentIntegrityError("version_conflict");
  }
}

function requireOpaqueId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value
  ) {
    throw new EconomicPaymentIntegrityError("invalid_field");
  }
  return value;
}

function parseNullableOpaqueId(value: unknown): string | null {
  if (value === null) return null;
  return requireOpaqueId(value);
}

function freezeTransitionEvidence(
  evidence: EconomicPaymentTransitionEvidence
): EconomicPaymentTransitionEvidence {
  return Object.freeze({ ...evidence });
}

function freezeSession(session: EconomicPaymentSession): EconomicPaymentSession {
  return Object.freeze({
    sessionId: session.sessionId,
    providerAccount: createProviderAccountIdentityBinding(session.providerAccount),
    state: session.state,
    evidenceHistory: Object.freeze(
      session.evidenceHistory.map((evidence) => freezeTransitionEvidence(evidence))
    )
  });
}

function freezeCaptureEffect(effect: EconomicCaptureEffect): EconomicCaptureEffect {
  return Object.freeze({
    ...effect,
    providerAccount: createProviderAccountIdentityBinding(effect.providerAccount),
    amount: Object.freeze({ ...effect.amount })
  });
}

function freezeUnverifiedProviderPaymentFact(
  fact: UnverifiedProviderPaymentFact
): UnverifiedProviderPaymentFact {
  return Object.freeze({
    ...fact,
    providerAccount: createProviderAccountIdentityBinding(fact.providerAccount),
    amount: Object.freeze({ ...fact.amount })
  });
}

function freezeUnverifiedProviderPaymentObservation(
  observation: UnverifiedProviderPaymentObservation
): UnverifiedProviderPaymentObservation {
  return Object.freeze({
    ...observation,
    providerAccount: createProviderAccountIdentityBinding(observation.providerAccount),
    amount: Object.freeze({ ...observation.amount })
  });
}

function freezeProposedCaptureEffect(
  effect: ProposedEconomicCaptureEffect
): ProposedEconomicCaptureEffect {
  return Object.freeze({
    ...effect,
    providerAccount: createProviderAccountIdentityBinding(effect.providerAccount),
    amount: Object.freeze({ ...effect.amount })
  });
}

function freezeIntent(intent: EconomicPaymentIntent): EconomicPaymentIntent {
  return Object.freeze({
    intentId: intent.intentId,
    version: intent.version,
    purpose: intent.purpose,
    sourceId: intent.sourceId,
    providerAccount: createProviderAccountIdentityBinding(intent.providerAccount),
    amount: Object.freeze({ ...intent.amount }),
    state: intent.state,
    sessions: Object.freeze(intent.sessions.map((session) => freezeSession(session))),
    capture: intent.capture === null ? null : freezeCaptureEffect(intent.capture),
    captureSessionId: intent.captureSessionId
  });
}

function freezeClearingProjection(
  projection: PaymentClearingProjection
): PaymentClearingProjection {
  return Object.freeze({
    intentId: projection.intentId,
    providerAccount: createProviderAccountIdentityBinding(projection.providerAccount),
    currency: projection.currency,
    version: projection.version,
    state: projection.state,
    evidenceIds: Object.freeze([...projection.evidenceIds])
  });
}

function readExactOwnDataObject<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
  invalidReason: EconomicPaymentIntegrityReason,
  unknownReason: EconomicPaymentIntegrityReason
): Readonly<Record<Keys[number], unknown>> {
  if (typeof value !== "object" || value === null) {
    throw new EconomicPaymentIntegrityError(invalidReason);
  }
  assertNotProxy(value, invalidReason);
  if (Array.isArray(value)) {
    throw new EconomicPaymentIntegrityError(invalidReason);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new EconomicPaymentIntegrityError(invalidReason);
  }

  const expected = new Set<string>(expectedKeys);
  const keys = Reflect.ownKeys(value);
  const fields = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) {
      throw new EconomicPaymentIntegrityError(unknownReason);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new EconomicPaymentIntegrityError(invalidReason);
    }
    fields[key] = descriptor.value;
  }
  if (keys.length !== expectedKeys.length) {
    throw new EconomicPaymentIntegrityError(invalidReason);
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(fields, key)) {
      throw new EconomicPaymentIntegrityError(invalidReason);
    }
  }
  return fields as Readonly<Record<Keys[number], unknown>>;
}

function readExactOwnDataArray(
  value: unknown,
  invalidReason: EconomicPaymentIntegrityReason
): readonly unknown[] {
  if (typeof value !== "object" || value === null) {
    throw new EconomicPaymentIntegrityError(invalidReason);
  }
  assertNotProxy(value, invalidReason);
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new EconomicPaymentIntegrityError(invalidReason);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.enumerable ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    Number(lengthDescriptor.value) < 0
  ) {
    throw new EconomicPaymentIntegrityError(invalidReason);
  }
  const length = Number(lengthDescriptor.value);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) {
    throw new EconomicPaymentIntegrityError(invalidReason);
  }

  const result: unknown[] = new Array(length);
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string") {
      throw new EconomicPaymentIntegrityError(invalidReason);
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new EconomicPaymentIntegrityError(invalidReason);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new EconomicPaymentIntegrityError(invalidReason);
    }
    result[index] = descriptor.value;
  }
  return Object.freeze(result);
}

function assertNotProxy(value: object, reason: EconomicPaymentIntegrityReason): void {
  try {
    if (nodeUtilTypes.isProxy(value)) {
      throw new EconomicPaymentIntegrityError(reason);
    }
  } catch (error) {
    if (error instanceof EconomicPaymentIntegrityError) throw error;
    throw new EconomicPaymentIntegrityError(reason);
  }
}
