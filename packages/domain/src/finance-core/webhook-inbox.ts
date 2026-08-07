import { Temporal } from "@js-temporal/polyfill";
import { types as nodeUtilTypes } from "node:util";
import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../finance-authorization/canonical-command-payload";
import type { Money } from "../money";
import { economicPaymentPurposeValues, type EconomicPaymentPurpose } from "./economic-payment";
import type { ArcProviderAccountIdentity } from "./provider-account";
import { readStrictOwnDataRecord } from "./strict-own-data";

export type WebhookTransportIdentity = Readonly<{
  provider: "arc_pay";
  webhookId: string;
}>;

export type WebhookProcessorCheckpoint = Readonly<{
  sequence: number;
  processorVersion: number;
  opaqueCode: string;
  committedAt: string;
}>;

export type WebhookInboxProcessingStatus = "stored" | "processing" | "completed" | "quarantined";

export const webhookProcessingErrorClassValues = [
  "transient_infrastructure",
  "canonical_provider_read_unavailable",
  "processor_contract_violation",
  "unexpected_internal_failure"
] as const;
export type WebhookProcessingErrorClass = (typeof webhookProcessingErrorClassValues)[number];

export type WebhookInboxItem = Readonly<{
  transportIdentity: WebhookTransportIdentity;
  providerEventType: string;
  rawBodyDigest: `sha256:${string}`;
  sealedPayloadRef: string;
  receivedAt: string;
  version: number;
  processingStatus: WebhookInboxProcessingStatus;
  processingAttempts: number;
  lastErrorClass: WebhookProcessingErrorClass | null;
  lastCommittedCheckpoint: WebhookProcessorCheckpoint | null;
}>;

export type WebhookTransportValidation = Readonly<{
  envelope: "bounded" | "malformed" | "oversized";
  signature: "valid" | "invalid";
  timestamp: "valid" | "invalid";
}>;

export type WebhookPreStorageRejection = Readonly<{
  kind: "reject_before_storage";
  statusCode: 400 | 401 | 413;
  reason: "invalid_signature" | "invalid_timestamp" | "malformed_envelope" | "oversized_envelope";
}>;

export type WebhookIngressDecision =
  | WebhookPreStorageRejection
  | Readonly<{
      kind: "store_before_acknowledgement";
      item: WebhookInboxItem;
    }>;

export type WebhookSemanticSource =
  | Readonly<{
      kind: "payment_transition";
      providerPaymentId: string;
      transition: string;
    }>
  | Readonly<{ kind: "refund"; providerRefundId: string }>
  | Readonly<{ kind: "chargeback"; chargebackSource: WebhookChargebackSource }>
  | Readonly<{ kind: "settlement_entry"; providerEntryId: string }>;

export type WebhookChargebackSource =
  | Readonly<{ kind: "provider_chargeback_id"; providerChargebackId: string }>
  | Readonly<{ kind: "webhook_event_id"; webhookEventId: string }>;

export type WebhookSemanticIdentity = Readonly<{
  providerAccountId: string;
  source: WebhookSemanticSource;
}>;

export type WebhookLogicalSource = Readonly<{
  kind: string;
  id: string;
}>;

type WebhookExpectedCommonFacts = Readonly<{
  providerAccount: ArcProviderAccountIdentity;
  purpose: EconomicPaymentPurpose;
  providerPaymentId: string;
  logicalSource: WebhookLogicalSource;
}>;

export type WebhookExpectedFacts =
  | Readonly<WebhookExpectedCommonFacts & { kind: "payment_transition"; amount: Money }>
  | Readonly<
      WebhookExpectedCommonFacts & {
        kind: "refund";
        providerRefundId: string;
        previousTotalRefunded: Money;
        capturedAmount: Money;
      }
    >
  | Readonly<
      WebhookExpectedCommonFacts & {
        kind: "chargeback";
        chargebackSource: WebhookChargebackSource;
        capturedAmount: Money;
      }
    >;

type WebhookObservedCommonFacts = Readonly<{
  provider: string;
  providerAccountId: string;
  merchantTenantId: string;
  providerPaymentId: string;
  logicalSource: WebhookLogicalSource;
}>;

export type WebhookObservedFacts =
  | Readonly<
      WebhookObservedCommonFacts & {
        kind: "payment_transition";
        amount: Readonly<{ amountMinor: number; currency: string }>;
      }
    >
  | Readonly<
      WebhookObservedCommonFacts & {
        kind: "refund";
        providerRefundId: string;
        refundAmountMinor: number;
        totalRefundedMinor: number;
        currency: string;
      }
    >
  | Readonly<
      WebhookObservedCommonFacts & {
        kind: "chargeback";
        chargebackSource: WebhookChargebackSource;
        disputedAmountMinor: number;
        currency: string;
      }
    >;

export type WebhookCanonicalSemanticFact =
  | Readonly<{
      kind: "payment_transition";
      purpose: EconomicPaymentPurpose;
      logicalSource: WebhookLogicalSource;
      providerPaymentId: string;
      transition: string;
      amount: Money;
    }>
  | Readonly<{
      kind: "refund";
      purpose: EconomicPaymentPurpose;
      logicalSource: WebhookLogicalSource;
      providerPaymentId: string;
      providerRefundId: string;
      refundAmount: Money;
      totalRefunded: Money;
      capturedAmount: Money;
    }>
  | Readonly<{
      kind: "chargeback";
      purpose: EconomicPaymentPurpose;
      logicalSource: WebhookLogicalSource;
      providerPaymentId: string;
      chargebackSource: WebhookChargebackSource;
      disputedAmount: Money;
      capturedAmount: Money;
    }>;

export type WebhookSemanticRecord = Readonly<{
  identity: WebhookSemanticIdentity;
  canonicalFact: WebhookCanonicalSemanticFact;
  canonicalFactDigest: FinanceAuthorizationPayloadHash;
}>;

export type WebhookRefundFactEffect = Readonly<{
  kind: "record_refund_fact";
  providerPaymentId: string;
  providerRefundId: string;
  refundAmount: Money;
  previousTotalRefunded: Money;
  totalRefunded: Money;
  capturedAmount: Money;
}>;

export type WebhookChargebackFactEffect = Readonly<{
  kind: "record_chargeback_fact";
  providerPaymentId: string;
  chargebackSource: WebhookChargebackSource;
  disputedAmount: Money;
  capturedAmount: Money;
}>;

export type WebhookBusinessEffect =
  | "post_client_sale_payable"
  | "record_platform_invoice_capture"
  | "activate_saved_card_credential"
  | "record_payment_state_only"
  | WebhookRefundFactEffect
  | WebhookChargebackFactEffect;

export type WebhookSemanticMismatch =
  | "provider"
  | "provider_account"
  | "tenant"
  | "payment"
  | "source"
  | "amount"
  | "currency";

export type WebhookProcessingDecision =
  | Readonly<{
      kind: "quarantine";
      reason: "unknown_provider_event_type";
      providerEventType: string;
      businessEffect: null;
    }>
  | Readonly<{
      kind: "quarantine";
      reason: "semantic_correlation_mismatch";
      mismatches: readonly WebhookSemanticMismatch[];
      businessEffect: null;
    }>
  | Readonly<{
      kind: "quarantine";
      reason: "event_source_mismatch";
      businessEffect: null;
    }>
  | Readonly<{
      kind: "quarantine";
      reason: "refund_economics_mismatch" | "chargeback_economics_mismatch";
      businessEffect: null;
    }>
  | Readonly<{
      kind: "quarantine";
      reason: "semantic_fact_conflict";
      semanticIdentity: WebhookSemanticIdentity;
      businessEffect: null;
    }>
  | Readonly<{
      kind: "semantic_replay";
      semanticRecord: WebhookSemanticRecord;
      businessEffect: null;
    }>
  | Readonly<{
      kind: "apply_once";
      semanticRecord: WebhookSemanticRecord;
      businessEffect: WebhookBusinessEffect;
    }>;

export type WebhookResumeDecision = Readonly<{
  kind: "begin_first_attempt" | "resume_active_attempt" | "begin_retry_attempt";
  expectedVersion: number;
  nextSequence: number;
  processingAttempts: number;
  lastErrorClass: WebhookProcessingErrorClass | null;
  lastCommittedCheckpoint: WebhookProcessorCheckpoint | null;
}>;

export class WebhookInboxIntegrityError extends Error {
  readonly code = "FINANCE_WEBHOOK_INBOX_INTEGRITY_ERROR";

  constructor() {
    super("Webhook inbox integrity check failed");
    this.name = "WebhookInboxIntegrityError";
  }
}

export class WebhookInboxVersionConflictError extends Error {
  readonly code = "FINANCE_WEBHOOK_INBOX_VERSION_CONFLICT";

  constructor() {
    super("Webhook inbox version conflicts with current state");
    this.name = "WebhookInboxVersionConflictError";
  }
}

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const currencyPattern = /^[A-Z]{3}$/;
const paymentPurposes = new Set<string>(economicPaymentPurposeValues);
const processingErrorClasses = new Set<string>(webhookProcessingErrorClassValues);

const paymentTransitionEventTypes = new Set([
  "payment.created",
  "payment.pending_3ds",
  "payment.authorized",
  "payment.captured",
  "payment.settled",
  "payment.declined",
  "payment.failed",
  "payment.timeout",
  "payment.voided",
  "payment.expired"
]);
const supportedEventTypes = new Set([
  ...paymentTransitionEventTypes,
  "payment.refunded",
  "payment.chargeback"
]);

const ingressKeys = [
  "provider",
  "webhookId",
  "providerEventType",
  "rawBodyDigest",
  "sealedPayloadRef",
  "receivedAt",
  "transportValidation"
] as const;
const transportValidationKeys = ["envelope", "signature", "timestamp"] as const;
const transportIdentityKeys = ["provider", "webhookId"] as const;
const inboxItemKeys = [
  "transportIdentity",
  "providerEventType",
  "rawBodyDigest",
  "sealedPayloadRef",
  "receivedAt",
  "version",
  "processingStatus",
  "processingAttempts",
  "lastErrorClass",
  "lastCommittedCheckpoint"
] as const;
const checkpointKeys = ["sequence", "processorVersion", "opaqueCode", "committedAt"] as const;
const acknowledgementKeys = ["ingress", "storageOutcome"] as const;
const storedIngressDecisionKeys = ["kind", "item"] as const;
const rejectedIngressDecisionKeys = ["kind", "statusCode", "reason"] as const;
const storedOutcomeKeys = ["kind", "transportDisposition"] as const;
const failedOutcomeKeys = ["kind"] as const;
const transportDedupeKeys = ["existing", "incoming"] as const;
const processingKeys = [
  "item",
  "expectedFacts",
  "observedFacts",
  "committedSemanticRecords"
] as const;
const expectedPaymentTransitionFactsKeys = [
  "kind",
  "providerAccount",
  "purpose",
  "providerPaymentId",
  "logicalSource",
  "amount"
] as const;
const expectedRefundFactsKeys = [
  "kind",
  "providerAccount",
  "purpose",
  "providerPaymentId",
  "logicalSource",
  "providerRefundId",
  "previousTotalRefunded",
  "capturedAmount"
] as const;
const expectedChargebackFactsKeys = [
  "kind",
  "providerAccount",
  "purpose",
  "providerPaymentId",
  "logicalSource",
  "chargebackSource",
  "capturedAmount"
] as const;
const observedPaymentTransitionFactsKeys = [
  "kind",
  "provider",
  "providerAccountId",
  "merchantTenantId",
  "providerPaymentId",
  "logicalSource",
  "amount"
] as const;
const observedRefundFactsKeys = [
  "kind",
  "provider",
  "providerAccountId",
  "merchantTenantId",
  "providerPaymentId",
  "logicalSource",
  "providerRefundId",
  "refundAmountMinor",
  "totalRefundedMinor",
  "currency"
] as const;
const observedChargebackFactsKeys = [
  "kind",
  "provider",
  "providerAccountId",
  "merchantTenantId",
  "providerPaymentId",
  "logicalSource",
  "chargebackSource",
  "disputedAmountMinor",
  "currency"
] as const;
const providerAccountKeys = [
  "providerAccountId",
  "identityVersion",
  "provider",
  "merchantTenantId",
  "terminalScope",
  "settlementScope"
] as const;
const logicalSourceKeys = ["kind", "id"] as const;
const moneyKeys = ["amountMinor", "currency"] as const;
const semanticIdentityKeys = ["providerAccountId", "source"] as const;
const paymentTransitionSourceKeys = ["kind", "providerPaymentId", "transition"] as const;
const refundSourceKeys = ["kind", "providerRefundId"] as const;
const chargebackSemanticSourceKeys = ["kind", "chargebackSource"] as const;
const providerChargebackIdSourceKeys = ["kind", "providerChargebackId"] as const;
const webhookEventIdSourceKeys = ["kind", "webhookEventId"] as const;
const settlementSourceKeys = ["kind", "providerEntryId"] as const;
const semanticRecordKeys = ["identity", "canonicalFact", "canonicalFactDigest"] as const;
const paymentTransitionFactKeys = [
  "kind",
  "purpose",
  "logicalSource",
  "providerPaymentId",
  "transition",
  "amount"
] as const;
const refundFactKeys = [
  "kind",
  "purpose",
  "logicalSource",
  "providerPaymentId",
  "providerRefundId",
  "refundAmount",
  "totalRefunded",
  "capturedAmount"
] as const;
const chargebackFactKeys = [
  "kind",
  "purpose",
  "logicalSource",
  "providerPaymentId",
  "chargebackSource",
  "disputedAmount",
  "capturedAmount"
] as const;
const beginAttemptKeys = ["item", "expectedVersion"] as const;
const processingFailureKeys = ["item", "expectedVersion", "errorClass"] as const;
const checkpointAdvanceKeys = ["item", "expectedVersion", "checkpoint", "nextStatus"] as const;

export function prepareWebhookIngress(input: unknown): WebhookIngressDecision {
  const fields = readExactOwnDataObject(input, ingressKeys);
  const rejection = decidePreStorageRejection(fields.transportValidation);
  if (rejection) return rejection;

  return Object.freeze({
    kind: "store_before_acknowledgement",
    item: freezeInboxItem({
      transportIdentity: normalizeTransportIdentity({
        provider: fields.provider,
        webhookId: fields.webhookId
      }),
      providerEventType: normalizeOpaqueValue(fields.providerEventType, 240),
      rawBodyDigest: normalizeDigest(fields.rawBodyDigest),
      sealedPayloadRef: normalizeOpaqueValue(fields.sealedPayloadRef, 512),
      receivedAt: parseInstant(fields.receivedAt).toString(),
      version: 0,
      processingStatus: "stored",
      processingAttempts: 0,
      lastErrorClass: null,
      lastCommittedCheckpoint: null
    })
  });
}

export function decideWebhookAcknowledgement(input: unknown):
  | WebhookPreStorageRejection
  | Readonly<{
      kind: "acknowledge";
      statusCode: 204;
      transportDisposition: "created" | "replayed";
    }>
  | Readonly<{ kind: "retryable_storage_failure"; statusCode: 503 }> {
  const fields = readExactOwnDataObject(input, acknowledgementKeys);
  const ingress = normalizeIngressDecision(fields.ingress);
  const storageOutcome = normalizeStorageOutcome(fields.storageOutcome);
  if (ingress.kind === "reject_before_storage") return ingress;
  if (storageOutcome.kind === "storage_failed") {
    return Object.freeze({ kind: "retryable_storage_failure", statusCode: 503 });
  }
  return Object.freeze({
    kind: "acknowledge",
    statusCode: 204,
    transportDisposition: storageOutcome.transportDisposition
  });
}

export function decideWebhookTransportDedupe(input: unknown):
  | Readonly<{ kind: "store_new"; item: WebhookInboxItem }>
  | Readonly<{ kind: "resume_existing"; item: WebhookInboxItem }>
  | Readonly<{
      kind: "quarantine_transport_conflict";
      reason: "transport_identity_body_mismatch";
      businessEffect: null;
    }> {
  const fields = readExactOwnDataObject(input, transportDedupeKeys);
  const incoming = normalizeInboxItem(fields.incoming);
  if (fields.existing === null) {
    return Object.freeze({ kind: "store_new", item: incoming });
  }

  const existing = normalizeInboxItem(fields.existing);
  if (!sameTransportIdentity(existing.transportIdentity, incoming.transportIdentity)) {
    throw integrityError();
  }
  if (existing.rawBodyDigest !== incoming.rawBodyDigest) {
    return Object.freeze({
      kind: "quarantine_transport_conflict",
      reason: "transport_identity_body_mismatch",
      businessEffect: null
    });
  }
  return Object.freeze({ kind: "resume_existing", item: existing });
}

export function decideWebhookProcessing(input: unknown): WebhookProcessingDecision {
  const fields = readExactOwnDataObject(input, processingKeys);
  const item = normalizeInboxItem(fields.item);
  assertActiveProcessing(item);
  const committedRecords = normalizeSemanticRecords(fields.committedSemanticRecords);

  if (!supportedEventTypes.has(item.providerEventType)) {
    if (
      fields.expectedFacts !== null ||
      fields.observedFacts !== null ||
      committedRecords.length !== 0
    ) {
      throw integrityError();
    }
    return Object.freeze({
      kind: "quarantine",
      reason: "unknown_provider_event_type",
      providerEventType: item.providerEventType,
      businessEffect: null
    });
  }

  const expected = normalizeExpectedFacts(fields.expectedFacts);
  const observed = normalizeObservedFacts(fields.observedFacts);
  if (!eventMatchesFactKinds(item.providerEventType, expected.kind, observed.kind)) {
    return Object.freeze({
      kind: "quarantine",
      reason: "event_source_mismatch",
      businessEffect: null
    });
  }
  const mismatches = correlationMismatches(item, expected, observed);
  if (mismatches.length > 0) {
    return Object.freeze({
      kind: "quarantine",
      reason: "semantic_correlation_mismatch",
      mismatches: Object.freeze(mismatches),
      businessEffect: null
    });
  }
  const semanticSource = deriveSemanticSource(item.providerEventType, observed);
  const semanticIdentity = freezeSemanticIdentity({
    providerAccountId: expected.providerAccount.providerAccountId,
    source: semanticSource
  });
  const semanticRecord = deriveSemanticRecord(
    semanticIdentity,
    item.providerEventType,
    expected,
    observed
  );
  const committedRecord = committedRecords.find((record) =>
    semanticIdentitiesEqual(record.identity, semanticIdentity)
  );
  if (committedRecord !== undefined) {
    if (!semanticRecordsEqual(committedRecord, semanticRecord)) {
      return Object.freeze({
        kind: "quarantine",
        reason: "semantic_fact_conflict",
        semanticIdentity,
        businessEffect: null
      });
    }
    return Object.freeze({
      kind: "semantic_replay",
      semanticRecord: committedRecord,
      businessEffect: null
    });
  }

  const economicsMismatch = detectEconomicsMismatch(expected, observed);
  if (economicsMismatch !== null) {
    return Object.freeze({
      kind: "quarantine",
      reason: economicsMismatch,
      businessEffect: null
    });
  }

  return Object.freeze({
    kind: "apply_once",
    semanticRecord,
    businessEffect: deriveBusinessEffect(item.providerEventType, expected, observed)
  });
}

export function beginWebhookInboxProcessingAttempt(input: unknown): WebhookInboxItem {
  const fields = readExactOwnDataObject(input, beginAttemptKeys);
  const item = normalizeInboxItem(fields.item);
  assertExpectedVersion(item.version, fields.expectedVersion);
  assertNotTerminal(item);
  if (item.processingStatus === "processing" && item.lastErrorClass === null) {
    throw new WebhookInboxVersionConflictError();
  }
  if (item.processingAttempts === Number.MAX_SAFE_INTEGER) throw integrityError();

  return freezeInboxItem({
    ...item,
    version: nextVersion(item.version),
    processingStatus: "processing",
    processingAttempts: item.processingAttempts + 1,
    lastErrorClass: null
  });
}

export function recordWebhookInboxProcessingFailure(input: unknown): WebhookInboxItem {
  const fields = readExactOwnDataObject(input, processingFailureKeys);
  const item = normalizeInboxItem(fields.item);
  assertExpectedVersion(item.version, fields.expectedVersion);
  assertNotTerminal(item);
  if (item.processingStatus !== "processing" || item.lastErrorClass !== null) {
    throw new WebhookInboxVersionConflictError();
  }

  return freezeInboxItem({
    ...item,
    version: nextVersion(item.version),
    lastErrorClass: normalizeErrorClass(fields.errorClass)
  });
}

export function advanceWebhookInboxCheckpoint(input: unknown): WebhookInboxItem {
  const fields = readExactOwnDataObject(input, checkpointAdvanceKeys);
  const item = normalizeInboxItem(fields.item);
  assertExpectedVersion(item.version, fields.expectedVersion);
  assertNotTerminal(item);
  if (item.processingStatus !== "processing" || item.lastErrorClass !== null) {
    throw new WebhookInboxVersionConflictError();
  }
  const nextStatus = normalizeProcessingStatus(fields.nextStatus);
  if (nextStatus === "stored") throw integrityError();

  const checkpoint = normalizeCheckpoint(fields.checkpoint);
  const expectedSequence = (item.lastCommittedCheckpoint?.sequence ?? 0) + 1;
  if (checkpoint.sequence !== expectedSequence) throw integrityError();
  const priorInstant = item.lastCommittedCheckpoint
    ? parseInstant(item.lastCommittedCheckpoint.committedAt)
    : parseInstant(item.receivedAt);
  if (Temporal.Instant.compare(parseInstant(checkpoint.committedAt), priorInstant) < 0) {
    throw integrityError();
  }

  return freezeInboxItem({
    ...item,
    version: nextVersion(item.version),
    processingStatus: nextStatus,
    lastErrorClass: null,
    lastCommittedCheckpoint: checkpoint
  });
}

export function resumeWebhookInboxProcessing(item: unknown): WebhookResumeDecision {
  const normalized = normalizeInboxItem(item);
  assertNotTerminal(normalized);
  const kind =
    normalized.processingStatus === "stored"
      ? "begin_first_attempt"
      : normalized.lastErrorClass === null
        ? "resume_active_attempt"
        : "begin_retry_attempt";
  return Object.freeze({
    kind,
    expectedVersion: normalized.version,
    nextSequence: (normalized.lastCommittedCheckpoint?.sequence ?? 0) + 1,
    processingAttempts: normalized.processingAttempts,
    lastErrorClass: normalized.lastErrorClass,
    lastCommittedCheckpoint: normalized.lastCommittedCheckpoint
  });
}

function decidePreStorageRejection(validation: unknown): WebhookPreStorageRejection | null {
  const fields = readExactOwnDataObject(validation, transportValidationKeys);
  if (fields.envelope === "oversized") {
    return Object.freeze({
      kind: "reject_before_storage",
      statusCode: 413,
      reason: "oversized_envelope"
    });
  }
  if (fields.envelope === "malformed") {
    return Object.freeze({
      kind: "reject_before_storage",
      statusCode: 400,
      reason: "malformed_envelope"
    });
  }
  if (fields.envelope !== "bounded") throw integrityError();
  if (fields.signature === "invalid") {
    return Object.freeze({
      kind: "reject_before_storage",
      statusCode: 401,
      reason: "invalid_signature"
    });
  }
  if (fields.signature !== "valid") throw integrityError();
  if (fields.timestamp === "invalid") {
    return Object.freeze({
      kind: "reject_before_storage",
      statusCode: 401,
      reason: "invalid_timestamp"
    });
  }
  if (fields.timestamp !== "valid") throw integrityError();
  return null;
}

function normalizeIngressDecision(value: unknown): WebhookIngressDecision {
  const kind = readOwnDataDiscriminant(value, "kind");
  if (kind === "store_before_acknowledgement") {
    const fields = readExactOwnDataObject(value, storedIngressDecisionKeys);
    return Object.freeze({
      kind,
      item: normalizeInboxItem(fields.item)
    });
  }
  if (kind !== "reject_before_storage") throw integrityError();
  const fields = readExactOwnDataObject(value, rejectedIngressDecisionKeys);
  if (
    (fields.reason === "invalid_signature" && fields.statusCode === 401) ||
    (fields.reason === "invalid_timestamp" && fields.statusCode === 401) ||
    (fields.reason === "malformed_envelope" && fields.statusCode === 400) ||
    (fields.reason === "oversized_envelope" && fields.statusCode === 413)
  ) {
    return Object.freeze({
      kind,
      statusCode: fields.statusCode,
      reason: fields.reason
    });
  }
  throw integrityError();
}

function normalizeStorageOutcome(value: unknown):
  | Readonly<{
      kind: "durably_stored";
      transportDisposition: "created" | "replayed";
    }>
  | Readonly<{ kind: "storage_failed" }> {
  const kind = readOwnDataDiscriminant(value, "kind");
  if (kind === "storage_failed") {
    readExactOwnDataObject(value, failedOutcomeKeys);
    return Object.freeze({ kind });
  }
  if (kind !== "durably_stored") throw integrityError();
  const fields = readExactOwnDataObject(value, storedOutcomeKeys);
  if (fields.transportDisposition !== "created" && fields.transportDisposition !== "replayed") {
    throw integrityError();
  }
  return Object.freeze({ kind, transportDisposition: fields.transportDisposition });
}

function normalizeInboxItem(value: unknown): WebhookInboxItem {
  const fields = readExactOwnDataObject(value, inboxItemKeys);
  const transportIdentity = normalizeTransportIdentity(fields.transportIdentity);
  const providerEventType = normalizeOpaqueValue(fields.providerEventType, 240);
  const rawBodyDigest = normalizeDigest(fields.rawBodyDigest);
  const sealedPayloadRef = normalizeOpaqueValue(fields.sealedPayloadRef, 512);
  const receivedAt = parseInstant(fields.receivedAt);
  const version = normalizeNonNegativeSafeInteger(fields.version);
  const processingStatus = normalizeProcessingStatus(fields.processingStatus);
  const processingAttempts = normalizeNonNegativeSafeInteger(fields.processingAttempts);
  const lastErrorClass =
    fields.lastErrorClass === null ? null : normalizeErrorClass(fields.lastErrorClass);
  const lastCommittedCheckpoint =
    fields.lastCommittedCheckpoint === null
      ? null
      : normalizeCheckpoint(fields.lastCommittedCheckpoint);
  const checkpointSequence = lastCommittedCheckpoint?.sequence ?? 0;

  if (
    lastCommittedCheckpoint !== null &&
    Temporal.Instant.compare(parseInstant(lastCommittedCheckpoint.committedAt), receivedAt) < 0
  ) {
    throw integrityError();
  }
  const expectedVersion =
    processingStatus === "stored"
      ? 0
      : lastErrorClass === null
        ? processingAttempts * 2 - 1 + checkpointSequence
        : processingAttempts * 2 + checkpointSequence;
  if (!Number.isSafeInteger(expectedVersion) || version !== expectedVersion) {
    throw integrityError();
  }
  if (
    (processingStatus === "stored" &&
      (version !== 0 ||
        processingAttempts !== 0 ||
        lastErrorClass !== null ||
        lastCommittedCheckpoint !== null)) ||
    (processingStatus === "processing" && processingAttempts < 1) ||
    ((processingStatus === "completed" || processingStatus === "quarantined") &&
      (processingAttempts < 1 || lastErrorClass !== null || lastCommittedCheckpoint === null))
  ) {
    throw integrityError();
  }

  return freezeInboxItem({
    transportIdentity,
    providerEventType,
    rawBodyDigest,
    sealedPayloadRef,
    receivedAt: receivedAt.toString(),
    version,
    processingStatus,
    processingAttempts,
    lastErrorClass,
    lastCommittedCheckpoint
  });
}

function normalizeTransportIdentity(value: unknown): WebhookTransportIdentity {
  const fields = readExactOwnDataObject(value, transportIdentityKeys);
  if (fields.provider !== "arc_pay") throw integrityError();
  return Object.freeze({
    provider: fields.provider,
    webhookId: normalizeOpaqueValue(fields.webhookId, 240)
  });
}

function normalizeExpectedFacts(value: unknown): WebhookExpectedFacts {
  const kind = readOwnDataDiscriminant(value, "kind");
  switch (kind) {
    case "payment_transition": {
      const fields = readExactOwnDataObject(value, expectedPaymentTransitionFactsKeys);
      const common = normalizeExpectedCommonFacts(fields);
      const amount = normalizeExpectedMoney(fields.amount);
      if (
        (common.purpose === "platform_card_setup" && amount.amountMinor !== 0) ||
        (common.purpose !== "platform_card_setup" && amount.amountMinor < 1)
      ) {
        throw integrityError();
      }
      return Object.freeze({ kind, ...common, amount });
    }
    case "refund": {
      const fields = readExactOwnDataObject(value, expectedRefundFactsKeys);
      const common = normalizeExpectedCommonFacts(fields);
      const previousTotalRefunded = normalizeExpectedMoney(fields.previousTotalRefunded);
      const capturedAmount = normalizeExpectedMoney(fields.capturedAmount);
      if (
        common.purpose === "platform_card_setup" ||
        capturedAmount.amountMinor < 1 ||
        previousTotalRefunded.amountMinor > capturedAmount.amountMinor
      ) {
        throw integrityError();
      }
      return Object.freeze({
        kind,
        ...common,
        providerRefundId: normalizeOpaqueValue(fields.providerRefundId, 240),
        previousTotalRefunded,
        capturedAmount
      });
    }
    case "chargeback": {
      const fields = readExactOwnDataObject(value, expectedChargebackFactsKeys);
      const common = normalizeExpectedCommonFacts(fields);
      const capturedAmount = normalizeExpectedMoney(fields.capturedAmount);
      if (common.purpose === "platform_card_setup" || capturedAmount.amountMinor < 1) {
        throw integrityError();
      }
      return Object.freeze({
        kind,
        ...common,
        chargebackSource: normalizeChargebackSource(fields.chargebackSource),
        capturedAmount
      });
    }
    default:
      throw integrityError();
  }
}

function normalizeObservedFacts(value: unknown): WebhookObservedFacts {
  const kind = readOwnDataDiscriminant(value, "kind");
  switch (kind) {
    case "payment_transition": {
      const fields = readExactOwnDataObject(value, observedPaymentTransitionFactsKeys);
      return Object.freeze({
        kind,
        ...normalizeObservedCommonFacts(fields),
        amount: normalizeObservedMoney(fields.amount)
      });
    }
    case "refund": {
      const fields = readExactOwnDataObject(value, observedRefundFactsKeys);
      return Object.freeze({
        kind,
        ...normalizeObservedCommonFacts(fields),
        providerRefundId: normalizeOpaqueValue(fields.providerRefundId, 240),
        refundAmountMinor: normalizeSafeInteger(fields.refundAmountMinor),
        totalRefundedMinor: normalizeSafeInteger(fields.totalRefundedMinor),
        currency: normalizeObservedCurrency(fields.currency)
      });
    }
    case "chargeback": {
      const fields = readExactOwnDataObject(value, observedChargebackFactsKeys);
      return Object.freeze({
        kind,
        ...normalizeObservedCommonFacts(fields),
        chargebackSource: normalizeChargebackSource(fields.chargebackSource),
        disputedAmountMinor: normalizeSafeInteger(fields.disputedAmountMinor),
        currency: normalizeObservedCurrency(fields.currency)
      });
    }
    default:
      throw integrityError();
  }
}

function normalizeExpectedCommonFacts(
  fields: Readonly<{
    providerAccount: unknown;
    purpose: unknown;
    providerPaymentId: unknown;
    logicalSource: unknown;
  }>
): WebhookExpectedCommonFacts {
  return Object.freeze({
    providerAccount: normalizeProviderAccount(fields.providerAccount),
    purpose: normalizePurpose(fields.purpose),
    providerPaymentId: normalizeOpaqueValue(fields.providerPaymentId, 240),
    logicalSource: normalizeLogicalSource(fields.logicalSource)
  });
}

function normalizeObservedCommonFacts(
  fields: Readonly<{
    provider: unknown;
    providerAccountId: unknown;
    merchantTenantId: unknown;
    providerPaymentId: unknown;
    logicalSource: unknown;
  }>
): WebhookObservedCommonFacts {
  return Object.freeze({
    provider: normalizeOpaqueValue(fields.provider, 80),
    providerAccountId: normalizeOpaqueValue(fields.providerAccountId, 160),
    merchantTenantId: normalizeOpaqueValue(fields.merchantTenantId, 160),
    providerPaymentId: normalizeOpaqueValue(fields.providerPaymentId, 240),
    logicalSource: normalizeLogicalSource(fields.logicalSource)
  });
}

function normalizeProviderAccount(value: unknown): ArcProviderAccountIdentity {
  const fields = readExactOwnDataObject(value, providerAccountKeys);
  if (
    fields.provider !== "arc_pay" ||
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
    terminalScope: normalizeOpaqueValue(fields.terminalScope, 160),
    settlementScope: normalizeOpaqueValue(fields.settlementScope, 160)
  });
}

function normalizeLogicalSource(value: unknown): WebhookLogicalSource {
  const fields = readExactOwnDataObject(value, logicalSourceKeys);
  return Object.freeze({
    kind: normalizeOpaqueValue(fields.kind, 80),
    id: normalizeOpaqueValue(fields.id, 160)
  });
}

function normalizeExpectedMoney(value: unknown): Money {
  const fields = readExactOwnDataObject(value, moneyKeys);
  const amountMinor = normalizeNonNegativeSafeInteger(fields.amountMinor);
  if (fields.currency !== "RUB") throw integrityError();
  return Object.freeze({ amountMinor, currency: fields.currency });
}

function normalizeObservedMoney(
  value: unknown
): Readonly<{ amountMinor: number; currency: string }> {
  const fields = readExactOwnDataObject(value, moneyKeys);
  const amountMinor = normalizeNonNegativeSafeInteger(fields.amountMinor);
  return Object.freeze({ amountMinor, currency: normalizeObservedCurrency(fields.currency) });
}

function normalizeObservedCurrency(value: unknown): string {
  if (typeof value !== "string" || !currencyPattern.test(value)) throw integrityError();
  return value;
}

function normalizeSemanticRecords(value: unknown): readonly WebhookSemanticRecord[] {
  const records = readExactOwnDataArray(value).map((record) => normalizeSemanticRecord(record));
  for (let index = 0; index < records.length; index += 1) {
    const current = records[index];
    if (
      current &&
      records
        .slice(index + 1)
        .some((candidate) => semanticIdentitiesEqual(candidate.identity, current.identity))
    ) {
      throw integrityError();
    }
  }
  return Object.freeze(records);
}

function normalizeSemanticRecord(value: unknown): WebhookSemanticRecord {
  const fields = readExactOwnDataObject(value, semanticRecordKeys);
  const identity = normalizeSemanticIdentity(fields.identity);
  const canonicalFact = normalizeCanonicalSemanticFact(fields.canonicalFact);
  assertSemanticIdentityMatchesFact(identity, canonicalFact);
  const canonicalFactDigest = normalizeDigest(fields.canonicalFactDigest);
  if (canonicalFactDigest !== deriveSemanticFactDigest(identity, canonicalFact)) {
    throw integrityError();
  }
  return freezeSemanticRecord({ identity, canonicalFact, canonicalFactDigest });
}

function normalizeSemanticIdentity(value: unknown): WebhookSemanticIdentity {
  const fields = readExactOwnDataObject(value, semanticIdentityKeys);
  return freezeSemanticIdentity({
    providerAccountId: normalizeOpaqueValue(fields.providerAccountId, 160),
    source: normalizeSemanticSource(fields.source)
  });
}

function normalizeSemanticSource(value: unknown): WebhookSemanticSource {
  const kind = readOwnDataDiscriminant(value, "kind");
  switch (kind) {
    case "payment_transition": {
      const fields = readExactOwnDataObject(value, paymentTransitionSourceKeys);
      return Object.freeze({
        kind,
        providerPaymentId: normalizeOpaqueValue(fields.providerPaymentId, 240),
        transition: normalizeOpaqueValue(fields.transition, 160)
      });
    }
    case "refund": {
      const fields = readExactOwnDataObject(value, refundSourceKeys);
      return Object.freeze({
        kind,
        providerRefundId: normalizeOpaqueValue(fields.providerRefundId, 240)
      });
    }
    case "chargeback": {
      const fields = readExactOwnDataObject(value, chargebackSemanticSourceKeys);
      return Object.freeze({
        kind,
        chargebackSource: normalizeChargebackSource(fields.chargebackSource)
      });
    }
    case "settlement_entry": {
      const fields = readExactOwnDataObject(value, settlementSourceKeys);
      return Object.freeze({
        kind,
        providerEntryId: normalizeOpaqueValue(fields.providerEntryId, 320)
      });
    }
    default:
      throw integrityError();
  }
}

function normalizeChargebackSource(value: unknown): WebhookChargebackSource {
  const kind = readOwnDataDiscriminant(value, "kind");
  if (kind === "provider_chargeback_id") {
    const fields = readExactOwnDataObject(value, providerChargebackIdSourceKeys);
    return Object.freeze({
      kind,
      providerChargebackId: normalizeOpaqueValue(fields.providerChargebackId, 240)
    });
  }
  if (kind === "webhook_event_id") {
    const fields = readExactOwnDataObject(value, webhookEventIdSourceKeys);
    return Object.freeze({
      kind,
      webhookEventId: normalizeOpaqueValue(fields.webhookEventId, 240)
    });
  }
  throw integrityError();
}

function normalizeCanonicalSemanticFact(value: unknown): WebhookCanonicalSemanticFact {
  const kind = readOwnDataDiscriminant(value, "kind");
  switch (kind) {
    case "payment_transition": {
      const fields = readExactOwnDataObject(value, paymentTransitionFactKeys);
      const purpose = normalizePurpose(fields.purpose);
      const logicalSource = normalizeLogicalSource(fields.logicalSource);
      const amount = normalizeExpectedMoney(fields.amount);
      if (
        !logicalSourceMatchesPurpose(logicalSource, purpose) ||
        (purpose === "platform_card_setup" && amount.amountMinor !== 0) ||
        (purpose !== "platform_card_setup" && amount.amountMinor < 1)
      ) {
        throw integrityError();
      }
      return Object.freeze({
        kind,
        purpose,
        logicalSource,
        providerPaymentId: normalizeOpaqueValue(fields.providerPaymentId, 240),
        transition: normalizeOpaqueValue(fields.transition, 160),
        amount
      });
    }
    case "refund": {
      const fields = readExactOwnDataObject(value, refundFactKeys);
      const purpose = normalizePurpose(fields.purpose);
      const logicalSource = normalizeLogicalSource(fields.logicalSource);
      const refundAmount = normalizeExpectedMoney(fields.refundAmount);
      const totalRefunded = normalizeExpectedMoney(fields.totalRefunded);
      const capturedAmount = normalizeExpectedMoney(fields.capturedAmount);
      if (
        purpose === "platform_card_setup" ||
        !logicalSourceMatchesPurpose(logicalSource, purpose) ||
        refundAmount.amountMinor < 1 ||
        totalRefunded.amountMinor < refundAmount.amountMinor ||
        totalRefunded.amountMinor > capturedAmount.amountMinor
      ) {
        throw integrityError();
      }
      return Object.freeze({
        kind,
        purpose,
        logicalSource,
        providerPaymentId: normalizeOpaqueValue(fields.providerPaymentId, 240),
        providerRefundId: normalizeOpaqueValue(fields.providerRefundId, 240),
        refundAmount,
        totalRefunded,
        capturedAmount
      });
    }
    case "chargeback": {
      const fields = readExactOwnDataObject(value, chargebackFactKeys);
      const purpose = normalizePurpose(fields.purpose);
      const logicalSource = normalizeLogicalSource(fields.logicalSource);
      const disputedAmount = normalizeExpectedMoney(fields.disputedAmount);
      const capturedAmount = normalizeExpectedMoney(fields.capturedAmount);
      if (
        purpose === "platform_card_setup" ||
        !logicalSourceMatchesPurpose(logicalSource, purpose) ||
        disputedAmount.amountMinor < 1 ||
        disputedAmount.amountMinor > capturedAmount.amountMinor
      ) {
        throw integrityError();
      }
      return Object.freeze({
        kind,
        purpose,
        logicalSource,
        providerPaymentId: normalizeOpaqueValue(fields.providerPaymentId, 240),
        chargebackSource: normalizeChargebackSource(fields.chargebackSource),
        disputedAmount,
        capturedAmount
      });
    }
    default:
      throw integrityError();
  }
}

function correlationMismatches(
  item: WebhookInboxItem,
  expected: WebhookExpectedFacts,
  observed: WebhookObservedFacts
): WebhookSemanticMismatch[] {
  const mismatches: WebhookSemanticMismatch[] = [];
  if (
    observed.provider !== expected.providerAccount.provider ||
    item.transportIdentity.provider !== expected.providerAccount.provider ||
    item.transportIdentity.provider !== observed.provider
  ) {
    addMismatch(mismatches, "provider");
  }
  if (observed.providerAccountId !== expected.providerAccount.providerAccountId) {
    addMismatch(mismatches, "provider_account");
  }
  if (observed.merchantTenantId !== expected.providerAccount.merchantTenantId) {
    addMismatch(mismatches, "tenant");
  }
  if (observed.providerPaymentId !== expected.providerPaymentId) {
    addMismatch(mismatches, "payment");
  }
  if (
    !logicalSourcesEqual(observed.logicalSource, expected.logicalSource) ||
    !logicalSourceMatchesPurpose(expected.logicalSource, expected.purpose)
  ) {
    addMismatch(mismatches, "source");
  }

  switch (expected.kind) {
    case "payment_transition":
      if (observed.kind !== "payment_transition") throw integrityError();
      if (observed.amount.amountMinor !== expected.amount.amountMinor) {
        addMismatch(mismatches, "amount");
      }
      if (observed.amount.currency !== expected.amount.currency) {
        addMismatch(mismatches, "currency");
      }
      break;
    case "refund":
      if (observed.kind !== "refund") throw integrityError();
      if (observed.providerRefundId !== expected.providerRefundId) {
        addMismatch(mismatches, "source");
      }
      if (
        observed.currency !== expected.capturedAmount.currency ||
        observed.currency !== expected.previousTotalRefunded.currency
      ) {
        addMismatch(mismatches, "currency");
      }
      break;
    case "chargeback":
      if (observed.kind !== "chargeback") throw integrityError();
      if (
        !chargebackSourcesEqual(observed.chargebackSource, expected.chargebackSource) ||
        (observed.chargebackSource.kind === "webhook_event_id" &&
          observed.chargebackSource.webhookEventId !== item.transportIdentity.webhookId) ||
        (expected.chargebackSource.kind === "webhook_event_id" &&
          expected.chargebackSource.webhookEventId !== item.transportIdentity.webhookId)
      ) {
        addMismatch(mismatches, "source");
      }
      if (observed.currency !== expected.capturedAmount.currency) {
        addMismatch(mismatches, "currency");
      }
      break;
  }
  return mismatches;
}

function addMismatch(
  mismatches: WebhookSemanticMismatch[],
  mismatch: WebhookSemanticMismatch
): void {
  if (!mismatches.includes(mismatch)) mismatches.push(mismatch);
}

function eventMatchesFactKinds(
  eventType: string,
  expectedKind: WebhookExpectedFacts["kind"],
  observedKind: WebhookObservedFacts["kind"]
): boolean {
  if (paymentTransitionEventTypes.has(eventType)) {
    return expectedKind === "payment_transition" && observedKind === "payment_transition";
  }
  if (eventType === "payment.refunded") {
    return expectedKind === "refund" && observedKind === "refund";
  }
  if (eventType === "payment.chargeback") {
    return expectedKind === "chargeback" && observedKind === "chargeback";
  }
  return false;
}

function detectEconomicsMismatch(
  expected: WebhookExpectedFacts,
  observed: WebhookObservedFacts
): "refund_economics_mismatch" | "chargeback_economics_mismatch" | null {
  switch (expected.kind) {
    case "payment_transition":
      if (observed.kind !== "payment_transition") throw integrityError();
      return null;
    case "refund": {
      if (observed.kind !== "refund") throw integrityError();
      const previous = BigInt(expected.previousTotalRefunded.amountMinor);
      const total = BigInt(observed.totalRefundedMinor);
      const refundDelta = BigInt(observed.refundAmountMinor);
      if (
        refundDelta <= 0n ||
        total <= previous ||
        total - previous !== refundDelta ||
        observed.totalRefundedMinor > expected.capturedAmount.amountMinor
      ) {
        return "refund_economics_mismatch";
      }
      return null;
    }
    case "chargeback":
      if (observed.kind !== "chargeback") throw integrityError();
      if (
        observed.disputedAmountMinor < 1 ||
        observed.disputedAmountMinor > expected.capturedAmount.amountMinor
      ) {
        return "chargeback_economics_mismatch";
      }
      return null;
  }
}

function deriveSemanticSource(
  eventType: string,
  observed: WebhookObservedFacts
): WebhookSemanticSource {
  switch (observed.kind) {
    case "payment_transition":
      if (!paymentTransitionEventTypes.has(eventType)) throw integrityError();
      return Object.freeze({
        kind: "payment_transition",
        providerPaymentId: observed.providerPaymentId,
        transition: eventType
      });
    case "refund":
      if (eventType !== "payment.refunded") throw integrityError();
      return Object.freeze({ kind: "refund", providerRefundId: observed.providerRefundId });
    case "chargeback":
      if (eventType !== "payment.chargeback") throw integrityError();
      return Object.freeze({
        kind: "chargeback",
        chargebackSource: observed.chargebackSource
      });
  }
}

function deriveSemanticRecord(
  identity: WebhookSemanticIdentity,
  eventType: string,
  expected: WebhookExpectedFacts,
  observed: WebhookObservedFacts
): WebhookSemanticRecord {
  let canonicalFact: WebhookCanonicalSemanticFact;
  switch (expected.kind) {
    case "payment_transition":
      if (observed.kind !== "payment_transition") throw integrityError();
      canonicalFact = Object.freeze({
        kind: "payment_transition",
        purpose: expected.purpose,
        logicalSource: expected.logicalSource,
        providerPaymentId: expected.providerPaymentId,
        transition: eventType,
        amount: expected.amount
      });
      break;
    case "refund":
      if (observed.kind !== "refund") throw integrityError();
      canonicalFact = Object.freeze({
        kind: "refund",
        purpose: expected.purpose,
        logicalSource: expected.logicalSource,
        providerPaymentId: expected.providerPaymentId,
        providerRefundId: expected.providerRefundId,
        refundAmount: freezeMoney(observed.refundAmountMinor),
        totalRefunded: freezeMoney(observed.totalRefundedMinor),
        capturedAmount: expected.capturedAmount
      });
      break;
    case "chargeback":
      if (observed.kind !== "chargeback") throw integrityError();
      canonicalFact = Object.freeze({
        kind: "chargeback",
        purpose: expected.purpose,
        logicalSource: expected.logicalSource,
        providerPaymentId: expected.providerPaymentId,
        chargebackSource: expected.chargebackSource,
        disputedAmount: freezeMoney(observed.disputedAmountMinor),
        capturedAmount: expected.capturedAmount
      });
      break;
  }
  assertSemanticIdentityMatchesFact(identity, canonicalFact);
  return freezeSemanticRecord({
    identity,
    canonicalFact,
    canonicalFactDigest: deriveSemanticFactDigest(identity, canonicalFact)
  });
}

function deriveSemanticFactDigest(
  identity: WebhookSemanticIdentity,
  canonicalFact: WebhookCanonicalSemanticFact
): FinanceAuthorizationPayloadHash {
  try {
    return hashFinanceCommandPayload({ identity, canonicalFact });
  } catch {
    throw integrityError();
  }
}

function assertSemanticIdentityMatchesFact(
  identity: WebhookSemanticIdentity,
  fact: WebhookCanonicalSemanticFact
): void {
  switch (identity.source.kind) {
    case "payment_transition":
      if (
        fact.kind !== "payment_transition" ||
        fact.providerPaymentId !== identity.source.providerPaymentId ||
        fact.transition !== identity.source.transition
      ) {
        throw integrityError();
      }
      return;
    case "refund":
      if (fact.kind !== "refund" || fact.providerRefundId !== identity.source.providerRefundId) {
        throw integrityError();
      }
      return;
    case "chargeback":
      if (
        fact.kind !== "chargeback" ||
        !chargebackSourcesEqual(fact.chargebackSource, identity.source.chargebackSource)
      ) {
        throw integrityError();
      }
      return;
    case "settlement_entry":
      throw integrityError();
  }
}

function deriveBusinessEffect(
  eventType: string,
  expected: WebhookExpectedFacts,
  observed: WebhookObservedFacts
): WebhookBusinessEffect {
  if (expected.kind === "refund") {
    if (eventType !== "payment.refunded" || observed.kind !== "refund") throw integrityError();
    return Object.freeze({
      kind: "record_refund_fact",
      providerPaymentId: expected.providerPaymentId,
      providerRefundId: expected.providerRefundId,
      refundAmount: freezeMoney(observed.refundAmountMinor),
      previousTotalRefunded: expected.previousTotalRefunded,
      totalRefunded: freezeMoney(observed.totalRefundedMinor),
      capturedAmount: expected.capturedAmount
    });
  }
  if (expected.kind === "chargeback") {
    if (eventType !== "payment.chargeback" || observed.kind !== "chargeback") {
      throw integrityError();
    }
    return Object.freeze({
      kind: "record_chargeback_fact",
      providerPaymentId: expected.providerPaymentId,
      chargebackSource: expected.chargebackSource,
      disputedAmount: freezeMoney(observed.disputedAmountMinor),
      capturedAmount: expected.capturedAmount
    });
  }
  if (observed.kind !== "payment_transition") throw integrityError();
  if (eventType !== "payment.captured") return "record_payment_state_only";
  switch (expected.purpose) {
    case "client_order":
      return "post_client_sale_payable";
    case "platform_invoice":
      return "record_platform_invoice_capture";
    case "platform_card_setup":
      return "activate_saved_card_credential";
  }
}

function freezeMoney(amountMinor: number): Money {
  return Object.freeze({ amountMinor, currency: "RUB" });
}

function normalizeCheckpoint(value: unknown): WebhookProcessorCheckpoint {
  const fields = readExactOwnDataObject(value, checkpointKeys);
  if (!Number.isSafeInteger(fields.sequence) || Number(fields.sequence) < 1) {
    throw integrityError();
  }
  if (!Number.isSafeInteger(fields.processorVersion) || Number(fields.processorVersion) < 1) {
    throw integrityError();
  }
  return Object.freeze({
    sequence: Number(fields.sequence),
    processorVersion: Number(fields.processorVersion),
    opaqueCode: normalizeOpaqueValue(fields.opaqueCode, 160),
    committedAt: parseInstant(fields.committedAt).toString()
  });
}

function normalizePurpose(value: unknown): EconomicPaymentPurpose {
  if (typeof value !== "string" || !paymentPurposes.has(value)) throw integrityError();
  return value as EconomicPaymentPurpose;
}

function normalizeProcessingStatus(value: unknown): WebhookInboxProcessingStatus {
  if (
    value !== "stored" &&
    value !== "processing" &&
    value !== "completed" &&
    value !== "quarantined"
  ) {
    throw integrityError();
  }
  return value;
}

function normalizeErrorClass(value: unknown): WebhookProcessingErrorClass {
  if (typeof value !== "string" || !processingErrorClasses.has(value)) {
    throw integrityError();
  }
  return value as WebhookProcessingErrorClass;
}

function normalizeNonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw integrityError();
  return Number(value);
}

function normalizeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) throw integrityError();
  return Number(value);
}

function normalizeDigest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !digestPattern.test(value)) throw integrityError();
  return value as `sha256:${string}`;
}

function normalizeOpaqueValue(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") throw integrityError();
  const normalized = value.trim();
  if (
    normalized !== value ||
    normalized.length < 1 ||
    normalized.length > maximumLength ||
    containsControlCharacter(normalized)
  ) {
    throw integrityError();
  }
  return normalized;
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function parseInstant(value: unknown): Temporal.Instant {
  if (typeof value !== "string") throw integrityError();
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw integrityError();
  }
}

function assertExpectedVersion(actual: number, expected: unknown): void {
  if (!Number.isSafeInteger(expected) || Number(expected) < 0) throw integrityError();
  if (expected !== actual) throw new WebhookInboxVersionConflictError();
}

function assertNotTerminal(item: WebhookInboxItem): void {
  if (item.processingStatus === "completed" || item.processingStatus === "quarantined") {
    throw new WebhookInboxVersionConflictError();
  }
}

function assertActiveProcessing(item: WebhookInboxItem): void {
  assertNotTerminal(item);
  if (
    item.processingStatus !== "processing" ||
    item.processingAttempts < 1 ||
    item.lastErrorClass !== null
  ) {
    throw new WebhookInboxVersionConflictError();
  }
}

function nextVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 0 || version === Number.MAX_SAFE_INTEGER) {
    throw integrityError();
  }
  return version + 1;
}

function sameTransportIdentity(
  left: WebhookTransportIdentity,
  right: WebhookTransportIdentity
): boolean {
  return (
    left.provider === right.provider &&
    left.webhookId === right.webhookId
  );
}

function logicalSourcesEqual(left: WebhookLogicalSource, right: WebhookLogicalSource): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function logicalSourceMatchesPurpose(
  source: WebhookLogicalSource,
  purpose: EconomicPaymentPurpose
): boolean {
  switch (purpose) {
    case "client_order":
      return source.kind === "order";
    case "platform_invoice":
      return source.kind === "platform_invoice";
    case "platform_card_setup":
      return source.kind === "platform_card_setup";
  }
}

function semanticIdentitiesEqual(
  left: WebhookSemanticIdentity,
  right: WebhookSemanticIdentity
): boolean {
  return (
    left.providerAccountId === right.providerAccountId &&
    semanticSourcesEqual(left.source, right.source)
  );
}

function semanticSourcesEqual(left: WebhookSemanticSource, right: WebhookSemanticSource): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "payment_transition":
      return (
        right.kind === "payment_transition" &&
        left.providerPaymentId === right.providerPaymentId &&
        left.transition === right.transition
      );
    case "refund":
      return right.kind === "refund" && left.providerRefundId === right.providerRefundId;
    case "chargeback":
      return (
        right.kind === "chargeback" &&
        chargebackSourcesEqual(left.chargebackSource, right.chargebackSource)
      );
    case "settlement_entry":
      return right.kind === "settlement_entry" && left.providerEntryId === right.providerEntryId;
  }
}

function chargebackSourcesEqual(
  left: WebhookChargebackSource,
  right: WebhookChargebackSource
): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === "provider_chargeback_id"
    ? right.kind === "provider_chargeback_id" &&
        left.providerChargebackId === right.providerChargebackId
    : right.kind === "webhook_event_id" && left.webhookEventId === right.webhookEventId;
}

function semanticRecordsEqual(left: WebhookSemanticRecord, right: WebhookSemanticRecord): boolean {
  return (
    semanticIdentitiesEqual(left.identity, right.identity) &&
    left.canonicalFactDigest === right.canonicalFactDigest
  );
}

function freezeSemanticIdentity(identity: WebhookSemanticIdentity): WebhookSemanticIdentity {
  return Object.freeze(identity);
}

function freezeSemanticRecord(record: WebhookSemanticRecord): WebhookSemanticRecord {
  return Object.freeze(record);
}

function freezeInboxItem(item: WebhookInboxItem): WebhookInboxItem {
  return Object.freeze(item);
}

function readOwnDataDiscriminant(value: unknown, key: string): unknown {
  assertPlainObject(value);
  const descriptor = safeGetOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    throw integrityError();
  }
  return descriptor.value;
}

function readExactOwnDataObject<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  return readStrictOwnDataRecord(value, expectedKeys, () => {
    throw integrityError();
  });
}

function readExactOwnDataArray(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null) throw integrityError();
  assertNotProxy(value);
  if (!safeArrayIsArray(value) || safeGetPrototypeOf(value) !== Array.prototype) {
    throw integrityError();
  }
  const lengthDescriptor = safeGetOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor)) throw integrityError();
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0) throw integrityError();
  const keys = safeOwnKeys(value);
  if (keys.length !== length + 1) throw integrityError();

  const entries: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = safeGetOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw integrityError();
    }
    entries.push(descriptor.value);
  }
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) {
      throw integrityError();
    }
  }
  return entries;
}

function assertPlainObject(value: unknown): asserts value is object {
  if (typeof value !== "object" || value === null) throw integrityError();
  assertNotProxy(value);
  if (safeArrayIsArray(value)) throw integrityError();
  const prototype = safeGetPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw integrityError();
}

function assertNotProxy(value: object): void {
  try {
    if (nodeUtilTypes.isProxy(value)) throw integrityError();
  } catch {
    throw integrityError();
  }
}

function safeArrayIsArray(value: unknown): boolean {
  try {
    return Array.isArray(value);
  } catch {
    throw integrityError();
  }
}

function safeGetPrototypeOf(value: object): object | null {
  try {
    return Object.getPrototypeOf(value);
  } catch {
    throw integrityError();
  }
}

function safeOwnKeys(value: object): readonly PropertyKey[] {
  try {
    return Reflect.ownKeys(value);
  } catch {
    throw integrityError();
  }
}

function safeGetOwnPropertyDescriptor(
  value: object,
  key: PropertyKey
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw integrityError();
  }
}

function integrityError(): WebhookInboxIntegrityError {
  return new WebhookInboxIntegrityError();
}
