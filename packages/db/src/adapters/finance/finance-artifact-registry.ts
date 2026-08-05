import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import { and, eq, sql } from "drizzle-orm";
import type {
  FinanceDigest,
  FinanceProviderAccountIdentity,
  RawBankArtifactRef,
  RawProviderArtifactRef
} from "@elevenhouse/domain/finance-core";
import { createProviderAccountIdentityBinding } from "@elevenhouse/domain/finance-core";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeArtifactAccessEvents,
  financeArtifactLegalHolds,
  financeArtifactPurgeAttempts,
  financeArtifactPurgeRequests,
  financeArtifactRetentionPolicies,
  financeArtifactSecurityIncidents,
  financeArtifactTombstones,
  financeArtifacts
} from "../../schema/finance/finance-artifacts.schema";
import {
  financeArtifactAccessPurposeValues,
  financeArtifactClassValues,
  financeArtifactServiceIdentityValues
} from "../../schema/finance/finance-values";
import { decodeFinancePositiveRevision } from "./finance-row-codecs";

type FinanceTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ArtifactRow = typeof financeArtifacts.$inferSelect;

export type FinanceArtifactClass = (typeof financeArtifactClassValues)[number];
export type FinanceArtifactServiceIdentity = (typeof financeArtifactServiceIdentityValues)[number];
export type FinanceArtifactAccessPurpose = (typeof financeArtifactAccessPurposeValues)[number];

export type FinanceArtifactPayloadRejectionRule =
  | "forbidden_card_field"
  | "forbidden_pan_value"
  | "forbidden_marketplace_field"
  | "payload_limit_exceeded"
  | "invalid_payload_shape";

export type FinanceArtifactRegistryReason =
  | FinanceArtifactPayloadRejectionRule
  | "invalid_input"
  | "retention_policy_not_found"
  | "retention_policy_not_effective"
  | "artifact_identity_conflict"
  | "artifact_not_found"
  | "artifact_tombstoned"
  | "artifact_access_denied"
  | "artifact_purge_pending"
  | "artifact_retention_not_expired"
  | "artifact_legal_hold_active"
  | "artifact_integrity_violation";

export class FinanceArtifactRegistryError extends Error {
  readonly code = "finance_artifact_registry_error";

  constructor(readonly reason: FinanceArtifactRegistryReason) {
    super("Finance artifact operation violates the private evidence contract");
    this.name = "FinanceArtifactRegistryError";
  }
}

export type SealedPrivateObjectLocator = Readonly<{
  privateObjectKey: string;
  privateObjectVersion: string;
  envelopeKeyVersion: string;
}>;

export type SealedPrivateObjectReceipt = Readonly<
  SealedPrivateObjectLocator & {
    sha256Digest: FinanceDigest;
    byteLength: number;
    contentType: string;
  }
>;

type ArtifactRegistrationBase = Readonly<{
  artifactClass: FinanceArtifactClass;
  contentType: string;
  privateObject: SealedPrivateObjectReceipt;
  retentionPolicyId: string;
  retentionPolicyVersion: string;
}>;

export type ProviderArtifactRegistration = ArtifactRegistrationBase &
  Readonly<{
    artifact: RawProviderArtifactRef;
    binding: Readonly<{
      kind: "provider";
      providerAccount: FinanceProviderAccountIdentity;
    }>;
  }>;

export type BankArtifactRegistration = ArtifactRegistrationBase &
  Readonly<{
    artifact: RawBankArtifactRef;
    binding: Readonly<{
      kind: "bank_cash_pool";
      bankCashPoolId: string;
      currency: "RUB";
    }>;
  }>;

export type FinanceArtifactRegistration = ProviderArtifactRegistration | BankArtifactRegistration;

export type FinanceArtifactReadRequest = Readonly<{
  artifactId: string;
  serviceIdentity: FinanceArtifactServiceIdentity;
  purpose: FinanceArtifactAccessPurpose;
  requestId: string;
}>;

export type ResolvedPrivateFinanceArtifact = Readonly<{
  artifact: RawProviderArtifactRef | RawBankArtifactRef;
  artifactClass: FinanceArtifactClass;
  contentType: string;
  privateObject: SealedPrivateObjectLocator;
  retainedUntil: string;
  accessAuditEventId: string;
}>;

export type FinanceArtifactBinding =
  | Readonly<{ kind: "provider"; providerAccount: FinanceProviderAccountIdentity }>
  | Readonly<{
      kind: "bank_cash_pool";
      bankCashPoolId: string;
      currency: "RUB";
      statementSourceFingerprint: FinanceDigest;
    }>;

export type RetiredPrivateFinanceArtifact = Readonly<{
  artifactId: string;
  purgeRequestId: string;
  verifiedPurgeAttemptId: string;
  deletionAuditEventId: string;
  tombstonedAt: string;
}>;

export type PreparedPrivateFinanceArtifactPurge = Readonly<{
  artifactId: string;
  purgeRequestId: string;
  privateObject: SealedPrivateObjectLocator;
  deletionAuditEventId: string;
  requestedAt: string;
}>;

export type FinanceArtifactRegistry = Readonly<{
  registerSealedArtifact(
    input: FinanceArtifactRegistration
  ): Promise<RawProviderArtifactRef | RawBankArtifactRef>;
  resolvePrivateArtifact(
    input: FinanceArtifactReadRequest
  ): Promise<ResolvedPrivateFinanceArtifact>;
  recordRejectedPayloadIncident(input: {
    readonly incidentRef: string;
    readonly ruleCode: FinanceArtifactPayloadRejectionRule;
    readonly binding: FinanceArtifactBinding;
  }): Promise<void>;
  applyLegalHold(input: {
    readonly artifactId: string;
    readonly holdId: string;
    readonly authorityRef: string;
    readonly reasonCode: string;
  }): Promise<void>;
  releaseLegalHold(input: {
    readonly artifactId: string;
    readonly holdId: string;
    readonly authorityRef: string;
    readonly reasonCode: string;
  }): Promise<void>;
  prepareArtifactPurge(input: {
    readonly artifactId: string;
    readonly requestId: string;
    readonly reasonCode: string;
  }): Promise<PreparedPrivateFinanceArtifactPurge>;
  recordArtifactPurgeFailure(input: {
    readonly purgeRequestId: string;
    readonly attemptId: string;
    readonly reasonCode: string;
  }): Promise<void>;
  completeArtifactPurge(input: {
    readonly artifactId: string;
    readonly purgeRequestId: string;
    readonly attemptId: string;
    readonly deletionVerificationDigest: FinanceDigest;
    readonly deletedPrivateObjectVersion: string;
  }): Promise<RetiredPrivateFinanceArtifact>;
}>;

const providerArtifactClasses = new Set<FinanceArtifactClass>([
  "provider_request",
  "provider_response",
  "provider_webhook",
  "provider_canonical_read",
  "provider_settlement_page",
  "provider_payout_statement"
]);
const bankArtifactClasses = new Set<FinanceArtifactClass>([
  "bank_statement",
  "bank_transfer_evidence"
]);
const artifactClassSet = new Set<string>(financeArtifactClassValues);
const serviceIdentitySet = new Set<string>(financeArtifactServiceIdentityValues);
const accessPurposeSet = new Set<string>(financeArtifactAccessPurposeValues);
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const contentTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const forbiddenCardKeys = new Set([
  "pan",
  "cardnumber",
  "primaryaccountnumber",
  "cvv",
  "cvc",
  "cvv2",
  "cvc2",
  "cardsecuritycode",
  "rawcard",
  "cardraw",
  "encryptedcard",
  "cardencrypted",
  "cardciphertext",
  "cardtoken",
  "cardtokenid",
  "savedcardtoken",
  "savedcardtokenid",
  "credentialtokenhandle",
  "restrictedtokenhandle",
  "tokenhandle",
  "reusabletoken",
  "tokenvalue"
]);
const forbiddenMarketplaceKeys = new Set([
  "submerchant",
  "submerchants",
  "split",
  "splits",
  "splitpayment",
  "splitpayments",
  "marketplacemerchant",
  "merchantbeneficiary"
]);
const maxPayloadDepth = 32;
const maxPayloadNodes = 20_000;
const maxPayloadStringLength = 2_000_000;
const maxPayloadKeyLength = 256;
const maxAggregatePayloadBytes = 16 * 1024 * 1024;
const artifactRegistrationKeys = [
  "artifact",
  "artifactClass",
  "binding",
  "contentType",
  "privateObject",
  "retentionPolicyId",
  "retentionPolicyVersion"
] as const;
const providerArtifactRefKeys = ["artifactId", "sha256Digest", "byteLength"] as const;
const bankArtifactRefKeys = [
  ...providerArtifactRefKeys,
  "bankCashPoolId",
  "statementSourceFingerprint"
] as const;
const sealedPrivateObjectReceiptKeys = [
  "privateObjectKey",
  "privateObjectVersion",
  "envelopeKeyVersion",
  "sha256Digest",
  "byteLength",
  "contentType"
] as const;
const providerBindingKeys = ["kind", "providerAccount"] as const;
const bankBindingKeys = ["kind", "bankCashPoolId", "currency"] as const;
const allowedArtifactClassesByServicePurpose: Readonly<
  Record<string, ReadonlySet<FinanceArtifactClass>>
> = {
  "provider_ingress:provider_webhook_verification": new Set(["provider_webhook"]),
  "payment_processing:provider_operation_dispatch": new Set(["provider_request"]),
  "payment_processing:provider_operation_result_verification": new Set([
    "provider_response",
    "provider_canonical_read",
    "provider_webhook"
  ]),
  "astrologer_billing:platform_tariff_invoice_customer_action_delivery": new Set([
    "provider_canonical_read"
  ]),
  "client_checkout_delivery:client_checkout_action_delivery": new Set(["provider_response"]),
  "refund_processing:provider_operation_dispatch": new Set(["provider_request"]),
  "refund_processing:refund_result_verification": new Set([
    "provider_response",
    "provider_canonical_read",
    "provider_webhook"
  ]),
  "chargeback_processing:chargeback_fact_verification": new Set([
    "provider_response",
    "provider_canonical_read",
    "provider_webhook"
  ]),
  "settlement_reconciliation:settlement_ingestion": new Set([
    "provider_settlement_page",
    "provider_canonical_read"
  ]),
  "settlement_reconciliation:payout_statement_ingestion": new Set(["provider_payout_statement"]),
  "bank_reconciliation:bank_statement_ingestion": new Set(["bank_statement"]),
  "bank_reconciliation:bank_evidence_verification": new Set([
    "bank_statement",
    "bank_transfer_evidence"
  ]),
  "payout_operations:payout_execution_evidence_verification": new Set([
    "bank_statement",
    "bank_transfer_evidence"
  ])
};

export function assertFinanceArtifactPayloadAllowed(payload: unknown): void {
  const visited = new WeakSet<object>();
  let nodes = 0;
  let aggregateBytes = 0;

  const addBytes = (value: string): void => {
    aggregateBytes += Buffer.byteLength(value, "utf8");
    if (aggregateBytes > maxAggregatePayloadBytes) {
      throw registryError("payload_limit_exceeded");
    }
  };

  const inspect = (value: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > maxPayloadNodes || depth > maxPayloadDepth) {
      throw registryError("payload_limit_exceeded");
    }
    if (value === null || typeof value === "boolean") {
      aggregateBytes += 5;
      return;
    }
    if (typeof value === "string") {
      if (value.length > maxPayloadStringLength) throw registryError("payload_limit_exceeded");
      addBytes(value);
      if (containsLuhnPan(value)) throw registryError("forbidden_pan_value");
      return;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) throw registryError("invalid_payload_shape");
      aggregateBytes += 24;
      return;
    }
    if (typeof value !== "object") throw registryError("invalid_payload_shape");
    if (nodeUtilTypes.isProxy(value) || visited.has(value)) {
      throw registryError("invalid_payload_shape");
    }
    visited.add(value);

    if (Array.isArray(value)) {
      if (value.length > maxPayloadNodes) throw registryError("payload_limit_exceeded");
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1 || !ownKeys.includes("length")) {
        throw registryError("invalid_payload_shape");
      }
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        if (!ownKeys.includes(key)) throw registryError("invalid_payload_shape");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw registryError("invalid_payload_shape");
        }
        inspect(descriptor.value, depth + 1);
      }
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      if (!lengthDescriptor || !("value" in lengthDescriptor)) {
        throw registryError("invalid_payload_shape");
      }
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw registryError("invalid_payload_shape");
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw registryError("invalid_payload_shape");
      if (key.length < 1 || key.length > maxPayloadKeyLength) {
        throw registryError("payload_limit_exceeded");
      }
      addBytes(key);
      const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
      if (forbiddenCardKeys.has(normalizedKey)) throw registryError("forbidden_card_field");
      if (forbiddenMarketplaceKeys.has(normalizedKey)) {
        throw registryError("forbidden_marketplace_field");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw registryError("invalid_payload_shape");
      }
      inspect(descriptor.value, depth + 1);
    }
  };

  inspect(payload, 0);
}

export function assertSealedPrivateObjectReceiptAgreement(input: {
  readonly artifact: RawProviderArtifactRef | RawBankArtifactRef;
  readonly contentType: string;
  readonly privateObject: SealedPrivateObjectReceipt;
}): void {
  assertExactOwnDataRecord(input, [["artifact", "contentType", "privateObject"]]);
  assertArtifactRefShape(input.artifact);
  assertExactOwnDataRecord(input.privateObject, [sealedPrivateObjectReceiptKeys]);
  const artifactDigest = digest(input.artifact.sha256Digest);
  const artifactByteLength = registrationByteLength(input.artifact.byteLength);
  sealedPrivateObjectLocator(
    input.privateObject,
    artifactDigest,
    artifactByteLength,
    contentType(input.contentType)
  );
}

export function createFinanceArtifactRegistry(
  database: ElevenHouseDatabase
): FinanceArtifactRegistry {
  return {
    registerSealedArtifact: (input) => registerSealedArtifact(database, input),
    resolvePrivateArtifact: (input) => resolvePrivateArtifact(database, input),
    recordRejectedPayloadIncident: (input) => recordRejectedPayloadIncident(database, input),
    applyLegalHold: (input) => applyLegalHold(database, input),
    releaseLegalHold: (input) => releaseLegalHold(database, input),
    prepareArtifactPurge: (input) => prepareArtifactPurge(database, input),
    recordArtifactPurgeFailure: (input) => recordArtifactPurgeFailure(database, input),
    completeArtifactPurge: (input) => completeArtifactPurge(database, input)
  };
}

async function registerSealedArtifact(
  database: ElevenHouseDatabase,
  input: FinanceArtifactRegistration
): Promise<RawProviderArtifactRef | RawBankArtifactRef> {
  return database.transaction((transaction) => registerSealedArtifactInTransaction(transaction, input));
}

/**
 * Composition hook for a finance command that must commit request evidence together with the
 * provider-operation intent. Private-object upload happens before this call; its database
 * registration and all payment state still commit or roll back as one unit.
 */
export async function registerSealedArtifactInTransaction(
  transaction: FinanceTransaction,
  input: FinanceArtifactRegistration
): Promise<RawProviderArtifactRef | RawBankArtifactRef> {
  const normalized = normalizeRegistration(input);
  const [policy] = await transaction
      .select()
      .from(financeArtifactRetentionPolicies)
      .where(
        and(
          eq(financeArtifactRetentionPolicies.policyId, normalized.retentionPolicyId),
          eq(financeArtifactRetentionPolicies.policyVersion, normalized.retentionPolicyVersion)
        )
      )
      .limit(1);
    if (!policy) throw registryError("retention_policy_not_found");
    const registeredAt = await databaseClock(transaction);
    if (
      policy.artifactClass !== normalized.artifactClass ||
      policy.effectiveAt.getTime() > registeredAt.getTime()
    ) {
      throw registryError("retention_policy_not_effective");
    }

    await transaction
      .insert(financeArtifacts)
      .values({
        id: normalized.artifactId,
        artifactClass: normalized.artifactClass,
        sha256Digest: normalized.sha256Digest,
        byteLength: normalized.byteLength,
        contentType: normalized.contentType,
        bindingKind: normalized.bindingKind,
        seriesId: normalized.seriesId,
        providerAccountId: normalized.providerAccountId,
        providerIdentityVersion: normalized.providerIdentityVersion,
        bankCashPoolId: normalized.bankCashPoolId,
        currency: normalized.currency,
        statementSourceFingerprint: normalized.statementSourceFingerprint,
        privateObjectKey: normalized.privateObject.privateObjectKey,
        privateObjectVersion: normalized.privateObject.privateObjectVersion,
        envelopeKeyVersion: normalized.privateObject.envelopeKeyVersion,
        retentionPolicyId: normalized.retentionPolicyId,
        retentionPolicyVersion: normalized.retentionPolicyVersion
      })
      .onConflictDoNothing();

    const [persisted] = await transaction
      .select()
      .from(financeArtifacts)
      .where(eq(financeArtifacts.id, normalized.artifactId))
      .limit(1);
    if (!persisted || !sameRegistration(persisted, normalized)) {
      throw registryError("artifact_identity_conflict");
    }
  return rawArtifactRef(persisted);
}

async function resolvePrivateArtifact(
  database: ElevenHouseDatabase,
  input: FinanceArtifactReadRequest
): Promise<ResolvedPrivateFinanceArtifact> {
  const artifactId = identifier(input.artifactId);
  const requestId = identifier(input.requestId);
  if (!serviceIdentitySet.has(input.serviceIdentity) || !accessPurposeSet.has(input.purpose)) {
    throw registryError("invalid_input");
  }

  const outcome = await database.transaction(async (transaction) => {
    const [artifact] = await transaction
      .select()
      .from(financeArtifacts)
      .where(eq(financeArtifacts.id, artifactId))
      .limit(1)
      .for("share");
    if (!artifact) {
      await appendAccessAudit(transaction, {
        artifactId: null,
        requestedArtifactId: artifactId,
        serviceIdentity: input.serviceIdentity,
        purpose: input.purpose,
        action: "read",
        outcome: "denied",
        reasonCode: "artifact_not_found",
        requestId
      });
      return { kind: "denied" as const, reason: "artifact_not_found" as const };
    }
    const [tombstone] = await transaction
      .select({ artifactId: financeArtifactTombstones.artifactId })
      .from(financeArtifactTombstones)
      .where(eq(financeArtifactTombstones.artifactId, artifactId))
      .limit(1);
    const [purgeRequest] = await transaction
      .select({ artifactId: financeArtifactPurgeRequests.artifactId })
      .from(financeArtifactPurgeRequests)
      .where(eq(financeArtifactPurgeRequests.artifactId, artifactId))
      .limit(1);
    const denialReason = tombstone
      ? ("artifact_tombstoned" as const)
      : purgeRequest
        ? ("artifact_purge_pending" as const)
        : accessAllowed(artifact, input.serviceIdentity, input.purpose)
          ? null
          : ("artifact_access_denied" as const);
    if (denialReason) {
      await appendAccessAudit(transaction, {
        artifactId,
        requestedArtifactId: artifactId,
        serviceIdentity: input.serviceIdentity,
        purpose: input.purpose,
        action: "read",
        outcome: "denied",
        reasonCode: denialReason,
        requestId
      });
      return { kind: "denied" as const, reason: denialReason };
    }
    const auditEventId = await appendAccessAudit(transaction, {
      artifactId,
      requestedArtifactId: artifactId,
      serviceIdentity: input.serviceIdentity,
      purpose: input.purpose,
      action: "read",
      outcome: "allowed",
      reasonCode: "approved_service_purpose",
      requestId
    });
    return {
      kind: "allowed" as const,
      value: resolvedPrivateArtifact(artifact, auditEventId)
    };
  });
  if (outcome.kind === "denied") throw registryError(outcome.reason);
  return outcome.value;
}

async function recordRejectedPayloadIncident(
  database: ElevenHouseDatabase,
  input: {
    readonly incidentRef: string;
    readonly ruleCode: FinanceArtifactPayloadRejectionRule;
    readonly binding: FinanceArtifactBinding;
  }
): Promise<void> {
  const binding = normalizeBinding(input.binding);
  const incidentRef = identifier(input.incidentRef);
  if (!isPayloadRejectionRule(input.ruleCode)) throw registryError("invalid_input");
  await database.insert(financeArtifactSecurityIncidents).values({
    incidentRef,
    ruleCode: input.ruleCode,
    ...binding
  });
}

async function applyLegalHold(
  database: ElevenHouseDatabase,
  input: {
    readonly artifactId: string;
    readonly holdId: string;
    readonly authorityRef: string;
    readonly reasonCode: string;
  }
): Promise<void> {
  const values = normalizeLegalHoldInput(input);
  await database.transaction(async (transaction) => {
    await lockArtifact(transaction, values.artifactId);
    await assertArtifactAvailableForHold(transaction, values.artifactId);
    await transaction.insert(financeArtifactLegalHolds).values({
      artifactId: values.artifactId,
      holdId: values.holdId,
      action: "applied",
      appliedEventId: null,
      appliedEventAction: null,
      authorityRef: values.authorityRef,
      reasonCode: values.reasonCode
    });
  });
}

async function releaseLegalHold(
  database: ElevenHouseDatabase,
  input: {
    readonly artifactId: string;
    readonly holdId: string;
    readonly authorityRef: string;
    readonly reasonCode: string;
  }
): Promise<void> {
  const values = normalizeLegalHoldInput(input);
  await database.transaction(async (transaction) => {
    await lockArtifact(transaction, values.artifactId);
    const [applied] = await transaction
      .select()
      .from(financeArtifactLegalHolds)
      .where(
        and(
          eq(financeArtifactLegalHolds.artifactId, values.artifactId),
          eq(financeArtifactLegalHolds.holdId, values.holdId),
          eq(financeArtifactLegalHolds.action, "applied")
        )
      )
      .limit(1);
    if (!applied) throw registryError("artifact_integrity_violation");
    await transaction.insert(financeArtifactLegalHolds).values({
      artifactId: values.artifactId,
      holdId: values.holdId,
      action: "released",
      appliedEventId: applied.id,
      appliedEventAction: "applied",
      authorityRef: values.authorityRef,
      reasonCode: values.reasonCode
    });
  });
}

async function prepareArtifactPurge(
  database: ElevenHouseDatabase,
  input: { readonly artifactId: string; readonly requestId: string; readonly reasonCode: string }
): Promise<PreparedPrivateFinanceArtifactPurge> {
  const artifactId = identifier(input.artifactId);
  const requestId = identifier(input.requestId);
  const reasonCode = identifier(input.reasonCode);
  const outcome = await database.transaction(async (transaction) => {
    await lockArtifact(transaction, artifactId);
    const [artifact] = await transaction
      .select()
      .from(financeArtifacts)
      .where(eq(financeArtifacts.id, artifactId))
      .limit(1)
      .for("update");
    const now = await databaseClock(transaction);
    if (!artifact) {
      await appendRetentionAudit(transaction, {
        artifactId: null,
        requestedArtifactId: artifactId,
        outcome: "denied",
        reasonCode: "artifact_not_found",
        requestId
      });
      return { kind: "denied" as const, reason: "artifact_not_found" as const };
    }
    const [existingTombstone] = await transaction
      .select()
      .from(financeArtifactTombstones)
      .where(eq(financeArtifactTombstones.artifactId, artifactId))
      .limit(1);
    if (existingTombstone) {
      await appendRetentionAudit(transaction, {
        artifactId,
        requestedArtifactId: artifactId,
        outcome: "denied",
        reasonCode: "artifact_tombstoned",
        requestId
      });
      return { kind: "denied" as const, reason: "artifact_tombstoned" as const };
    }
    const [existingRequest] = await transaction
      .select()
      .from(financeArtifactPurgeRequests)
      .where(eq(financeArtifactPurgeRequests.artifactId, artifactId))
      .limit(1);
    if (existingRequest) {
      return {
        kind: "prepared" as const,
        value: preparedPurge(artifact, existingRequest)
      };
    }
    const activeHold = await hasActiveLegalHold(transaction, artifactId);
    const denialReason =
      now.getTime() < artifact.retainedUntil.getTime()
        ? ("artifact_retention_not_expired" as const)
        : activeHold
          ? ("artifact_legal_hold_active" as const)
          : null;
    if (denialReason) {
      await appendRetentionAudit(transaction, {
        artifactId,
        requestedArtifactId: artifactId,
        outcome: "denied",
        reasonCode: denialReason,
        requestId
      });
      return { kind: "denied" as const, reason: denialReason };
    }
    const deletionAuditEventId = await appendRetentionAudit(transaction, {
      artifactId,
      requestedArtifactId: artifactId,
      outcome: "allowed",
      reasonCode,
      requestId
    });
    const [purgeRequest] = await transaction
      .insert(financeArtifactPurgeRequests)
      .values({
        artifactId,
        deletionAuditEventId,
        deletionAuditServiceIdentity: "finance_retention",
        deletionAuditPurpose: "retention_deletion",
        deletionAuditAction: "retention_delete",
        deletionAuditOutcome: "allowed"
      })
      .returning();
    if (!purgeRequest) throw registryError("artifact_integrity_violation");
    return { kind: "prepared" as const, value: preparedPurge(artifact, purgeRequest) };
  });
  if (outcome.kind === "denied") throw registryError(outcome.reason);
  return outcome.value;
}

async function recordArtifactPurgeFailure(
  database: ElevenHouseDatabase,
  input: {
    readonly purgeRequestId: string;
    readonly attemptId: string;
    readonly reasonCode: string;
  }
): Promise<void> {
  const purgeRequestId = identifier(input.purgeRequestId);
  const attemptId = identifier(input.attemptId);
  const reasonCode = identifier(input.reasonCode);
  await database.transaction(async (transaction) => {
    const [request] = await transaction
      .select({ id: financeArtifactPurgeRequests.id })
      .from(financeArtifactPurgeRequests)
      .where(eq(financeArtifactPurgeRequests.id, purgeRequestId))
      .limit(1);
    if (!request) throw registryError("artifact_not_found");
    await transaction
      .insert(financeArtifactPurgeAttempts)
      .values({ attemptId, purgeRequestId, outcome: "failed", reasonCode })
      .onConflictDoNothing();
    const [persisted] = await transaction
      .select()
      .from(financeArtifactPurgeAttempts)
      .where(eq(financeArtifactPurgeAttempts.attemptId, attemptId))
      .limit(1);
    if (
      !persisted ||
      persisted.purgeRequestId !== purgeRequestId ||
      persisted.outcome !== "failed" ||
      persisted.reasonCode !== reasonCode
    ) {
      throw registryError("artifact_identity_conflict");
    }
  });
}

async function completeArtifactPurge(
  database: ElevenHouseDatabase,
  input: {
    readonly artifactId: string;
    readonly purgeRequestId: string;
    readonly attemptId: string;
    readonly deletionVerificationDigest: FinanceDigest;
    readonly deletedPrivateObjectVersion: string;
  }
): Promise<RetiredPrivateFinanceArtifact> {
  const artifactId = identifier(input.artifactId);
  const purgeRequestId = identifier(input.purgeRequestId);
  const attemptId = identifier(input.attemptId);
  const deletionVerificationDigest = digest(input.deletionVerificationDigest);
  const deletedPrivateObjectVersion = privateLocatorValue(input.deletedPrivateObjectVersion, 320);
  return database.transaction(async (transaction) => {
    await lockArtifact(transaction, artifactId);
    const [artifact] = await transaction
      .select()
      .from(financeArtifacts)
      .where(eq(financeArtifacts.id, artifactId))
      .limit(1)
      .for("update");
    if (!artifact) throw registryError("artifact_not_found");
    const [existingTombstone] = await transaction
      .select()
      .from(financeArtifactTombstones)
      .where(eq(financeArtifactTombstones.artifactId, artifactId))
      .limit(1);
    if (existingTombstone) {
      if (
        existingTombstone.purgeRequestId !== purgeRequestId ||
        existingTombstone.verifiedPurgeAttemptId !== attemptId ||
        existingTombstone.deletionVerificationDigest !== deletionVerificationDigest ||
        existingTombstone.deletedPrivateObjectVersion !== deletedPrivateObjectVersion
      ) {
        throw registryError("artifact_identity_conflict");
      }
      return retiredArtifact(existingTombstone);
    }
    const [purgeRequest] = await transaction
      .select()
      .from(financeArtifactPurgeRequests)
      .where(
        and(
          eq(financeArtifactPurgeRequests.id, purgeRequestId),
          eq(financeArtifactPurgeRequests.artifactId, artifactId)
        )
      )
      .limit(1);
    if (!purgeRequest) throw registryError("artifact_integrity_violation");
    if (artifact.privateObjectVersion !== deletedPrivateObjectVersion) {
      throw registryError("artifact_integrity_violation");
    }
    await transaction
      .insert(financeArtifactPurgeAttempts)
      .values({
        attemptId,
        purgeRequestId,
        outcome: "deletion_verified",
        reasonCode: null,
        deletionVerificationDigest,
        deletedPrivateObjectVersion
      })
      .onConflictDoNothing();
    const [verifiedAttempt] = await transaction
      .select()
      .from(financeArtifactPurgeAttempts)
      .where(eq(financeArtifactPurgeAttempts.attemptId, attemptId))
      .limit(1);
    if (
      !verifiedAttempt ||
      verifiedAttempt.purgeRequestId !== purgeRequestId ||
      verifiedAttempt.outcome !== "deletion_verified" ||
      verifiedAttempt.deletionVerificationDigest !== deletionVerificationDigest ||
      verifiedAttempt.deletedPrivateObjectVersion !== deletedPrivateObjectVersion
    ) {
      throw registryError("artifact_identity_conflict");
    }
    const [tombstone] = await transaction
      .insert(financeArtifactTombstones)
      .values({
        artifactId,
        sha256Digest: artifact.sha256Digest,
        byteLength: artifact.byteLength,
        bindingKind: artifact.bindingKind,
        seriesId: artifact.seriesId,
        providerAccountId: artifact.providerAccountId,
        providerIdentityVersion: artifact.providerIdentityVersion,
        bankCashPoolId: artifact.bankCashPoolId,
        currency: artifact.currency,
        statementSourceFingerprint: artifact.statementSourceFingerprint,
        retentionPolicyId: artifact.retentionPolicyId,
        retentionPolicyVersion: artifact.retentionPolicyVersion,
        purgeRequestId,
        verifiedPurgeAttemptId: attemptId,
        verifiedPurgeOutcome: "deletion_verified",
        deletionVerificationDigest,
        deletedPrivateObjectVersion,
        deletionAuditEventId: purgeRequest.deletionAuditEventId,
        deletionAuditServiceIdentity: "finance_retention",
        deletionAuditPurpose: "retention_deletion",
        deletionAuditAction: "retention_delete",
        deletionAuditOutcome: "allowed",
        reasonCode: "object_deletion_verified"
      })
      .returning();
    if (!tombstone) throw registryError("artifact_integrity_violation");
    return retiredArtifact(tombstone);
  });
}

function preparedPurge(
  artifact: ArtifactRow,
  purgeRequest: typeof financeArtifactPurgeRequests.$inferSelect
): PreparedPrivateFinanceArtifactPurge {
  return {
    artifactId: artifact.id,
    purgeRequestId: purgeRequest.id,
    privateObject: privateObjectLocator(artifact),
    deletionAuditEventId: purgeRequest.deletionAuditEventId,
    requestedAt: purgeRequest.requestedAt.toISOString()
  };
}

function retiredArtifact(
  tombstone: typeof financeArtifactTombstones.$inferSelect
): RetiredPrivateFinanceArtifact {
  return {
    artifactId: tombstone.artifactId,
    purgeRequestId: tombstone.purgeRequestId,
    verifiedPurgeAttemptId: tombstone.verifiedPurgeAttemptId,
    deletionAuditEventId: tombstone.deletionAuditEventId,
    tombstonedAt: tombstone.tombstonedAt.toISOString()
  };
}

type NormalizedRegistration = Readonly<{
  artifactId: string;
  artifactClass: FinanceArtifactClass;
  sha256Digest: FinanceDigest;
  byteLength: string;
  contentType: string;
  bindingKind: "provider" | "bank_cash_pool";
  seriesId: string | null;
  providerAccountId: string | null;
  providerIdentityVersion: number | null;
  bankCashPoolId: string | null;
  currency: "RUB" | null;
  statementSourceFingerprint: FinanceDigest | null;
  privateObject: SealedPrivateObjectLocator;
  retentionPolicyId: string;
  retentionPolicyVersion: string;
}>;

function normalizeRegistration(input: FinanceArtifactRegistration): NormalizedRegistration {
  assertRegistrationShape(input);
  const artifactClass = artifactClassValue(input.artifactClass);
  const artifactId = identifier(input.artifact.artifactId);
  const sha256Digest = digest(input.artifact.sha256Digest);
  const byteLength = registrationByteLength(input.artifact.byteLength);
  const normalizedContentType = contentType(input.contentType);
  const base = {
    artifactId,
    artifactClass,
    sha256Digest,
    byteLength: String(byteLength),
    contentType: normalizedContentType,
    privateObject: sealedPrivateObjectLocator(
      input.privateObject,
      sha256Digest,
      byteLength,
      normalizedContentType
    ),
    retentionPolicyId: identifier(input.retentionPolicyId),
    retentionPolicyVersion: decodeFinancePositiveRevision(input.retentionPolicyVersion)
  } as const;
  if (input.binding.kind === "provider") {
    if (!providerArtifactClasses.has(artifactClass)) throw registryError("invalid_input");
    if ("bankCashPoolId" in input.artifact) throw registryError("invalid_input");
    const providerAccount = createProviderAccountIdentityBinding(input.binding.providerAccount);
    return {
      ...base,
      bindingKind: "provider",
      seriesId: providerAccount.seriesId,
      providerAccountId: providerAccount.providerAccountId,
      providerIdentityVersion: providerAccount.identityVersion,
      bankCashPoolId: null,
      currency: null,
      statementSourceFingerprint: null
    };
  }
  if (!bankArtifactClasses.has(artifactClass)) throw registryError("invalid_input");
  if (!("bankCashPoolId" in input.artifact)) throw registryError("invalid_input");
  const bankCashPoolId = identifier(input.binding.bankCashPoolId);
  if (input.binding.currency !== "RUB" || input.artifact.bankCashPoolId !== bankCashPoolId) {
    throw registryError("invalid_input");
  }
  return {
    ...base,
    bindingKind: "bank_cash_pool",
    seriesId: null,
    providerAccountId: null,
    providerIdentityVersion: null,
    bankCashPoolId,
    currency: "RUB",
    statementSourceFingerprint: digest(input.artifact.statementSourceFingerprint)
  };
}

function assertRegistrationShape(input: unknown): asserts input is FinanceArtifactRegistration {
  assertExactOwnDataRecord(input, [artifactRegistrationKeys]);
  const registration = input as unknown as Readonly<Record<string, unknown>>;
  assertArtifactRefShape(registration.artifact);
  assertExactOwnDataRecord(registration.privateObject, [sealedPrivateObjectReceiptKeys]);
  assertExactOwnDataRecord(registration.binding, [providerBindingKeys, bankBindingKeys]);
  const binding = registration.binding as Readonly<Record<string, unknown>>;
  if (binding.kind === "provider") {
    assertExactOwnDataRecord(binding, [providerBindingKeys]);
  } else if (binding.kind === "bank_cash_pool") {
    assertExactOwnDataRecord(binding, [bankBindingKeys]);
  } else {
    throw registryError("invalid_input");
  }
}

function assertArtifactRefShape(
  input: unknown
): asserts input is RawProviderArtifactRef | RawBankArtifactRef {
  assertExactOwnDataRecord(input, [providerArtifactRefKeys, bankArtifactRefKeys]);
}

function normalizeBinding(binding: FinanceArtifactBinding) {
  if (binding.kind === "provider") {
    const providerAccount = createProviderAccountIdentityBinding(binding.providerAccount);
    return {
      bindingKind: "provider" as const,
      seriesId: providerAccount.seriesId,
      providerAccountId: providerAccount.providerAccountId,
      providerIdentityVersion: providerAccount.identityVersion,
      bankCashPoolId: null,
      currency: null,
      statementSourceFingerprint: null
    };
  }
  if (binding.currency !== "RUB") throw registryError("invalid_input");
  return {
    bindingKind: "bank_cash_pool" as const,
    seriesId: null,
    providerAccountId: null,
    providerIdentityVersion: null,
    bankCashPoolId: identifier(binding.bankCashPoolId),
    currency: "RUB" as const,
    statementSourceFingerprint: digest(binding.statementSourceFingerprint)
  };
}

function sameRegistration(row: ArtifactRow, expected: NormalizedRegistration): boolean {
  return (
    row.artifactClass === expected.artifactClass &&
    row.sha256Digest === expected.sha256Digest &&
    row.byteLength === expected.byteLength &&
    row.contentType === expected.contentType &&
    row.bindingKind === expected.bindingKind &&
    row.seriesId === expected.seriesId &&
    row.providerAccountId === expected.providerAccountId &&
    row.providerIdentityVersion === expected.providerIdentityVersion &&
    row.bankCashPoolId === expected.bankCashPoolId &&
    row.currency === expected.currency &&
    row.statementSourceFingerprint === expected.statementSourceFingerprint &&
    row.privateObjectKey === expected.privateObject.privateObjectKey &&
    row.privateObjectVersion === expected.privateObject.privateObjectVersion &&
    row.envelopeKeyVersion === expected.privateObject.envelopeKeyVersion &&
    row.retentionPolicyId === expected.retentionPolicyId &&
    row.retentionPolicyVersion === expected.retentionPolicyVersion
  );
}

function accessAllowed(
  artifact: ArtifactRow,
  serviceIdentity: FinanceArtifactServiceIdentity,
  purpose: FinanceArtifactAccessPurpose
): boolean {
  const key = `${serviceIdentity}:${purpose}`;
  return (
    allowedArtifactClassesByServicePurpose[key]?.has(
      artifact.artifactClass as FinanceArtifactClass
    ) === true
  );
}

async function appendAccessAudit(
  transaction: FinanceTransaction,
  input: {
    readonly artifactId: string | null;
    readonly requestedArtifactId: string;
    readonly serviceIdentity: FinanceArtifactServiceIdentity;
    readonly purpose: FinanceArtifactAccessPurpose;
    readonly action: "read" | "retention_delete";
    readonly outcome: "allowed" | "denied";
    readonly reasonCode: string;
    readonly requestId: string;
  }
): Promise<string> {
  const [row] = await transaction
    .insert(financeArtifactAccessEvents)
    .values({
      artifactId: input.artifactId,
      requestedArtifactIdHash: requestedArtifactIdHash(input.requestedArtifactId),
      serviceIdentity: input.serviceIdentity,
      purpose: input.purpose,
      action: input.action,
      outcome: input.outcome,
      reasonCode: identifier(input.reasonCode),
      requestId: input.requestId
    })
    .returning({ id: financeArtifactAccessEvents.id });
  if (!row) throw registryError("artifact_integrity_violation");
  return row.id;
}

function appendRetentionAudit(
  transaction: FinanceTransaction,
  input: {
    readonly artifactId: string | null;
    readonly requestedArtifactId: string;
    readonly outcome: "allowed" | "denied";
    readonly reasonCode: string;
    readonly requestId: string;
  }
): Promise<string> {
  return appendAccessAudit(transaction, {
    ...input,
    serviceIdentity: "finance_retention",
    purpose: "retention_deletion",
    action: "retention_delete"
  });
}

async function lockArtifact(transaction: FinanceTransaction, artifactId: string): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`finance-artifact:${artifactId}`}, 0))`
  );
}

async function databaseClock(transaction: FinanceTransaction): Promise<Date> {
  const result = await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`);
  const value = result.rows[0]?.now;
  if (!(value instanceof Date) && typeof value !== "string") {
    throw registryError("artifact_integrity_violation");
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw registryError("artifact_integrity_violation");
  return parsed;
}

async function hasActiveLegalHold(
  transaction: FinanceTransaction,
  artifactId: string
): Promise<boolean> {
  const result = await transaction.execute<{ active: boolean }>(sql`
    select exists (
      select 1
        from ${financeArtifactLegalHolds} applied
        where applied.artifact_id = ${artifactId}
          and applied.action = 'applied'
          and not exists (
            select 1
              from ${financeArtifactLegalHolds} released
              where released.applied_event_id = applied.id
                and released.artifact_id = applied.artifact_id
                and released.action = 'released'
          )
    ) as active
  `);
  return result.rows[0]?.active === true;
}

async function assertArtifactAvailableForHold(
  transaction: FinanceTransaction,
  artifactId: string
): Promise<void> {
  const [artifact] = await transaction
    .select({ id: financeArtifacts.id })
    .from(financeArtifacts)
    .where(eq(financeArtifacts.id, artifactId))
    .limit(1);
  if (!artifact) throw registryError("artifact_not_found");
  const [tombstone] = await transaction
    .select({ id: financeArtifactTombstones.artifactId })
    .from(financeArtifactTombstones)
    .where(eq(financeArtifactTombstones.artifactId, artifactId))
    .limit(1);
  if (tombstone) throw registryError("artifact_tombstoned");
  const [purgeRequest] = await transaction
    .select({ id: financeArtifactPurgeRequests.id })
    .from(financeArtifactPurgeRequests)
    .where(eq(financeArtifactPurgeRequests.artifactId, artifactId))
    .limit(1);
  if (purgeRequest) throw registryError("artifact_purge_pending");
}

function rawArtifactRef(row: ArtifactRow): RawProviderArtifactRef | RawBankArtifactRef {
  const byteLength = safeArtifactByteLength(row.byteLength);
  if (row.bindingKind === "provider") {
    return {
      artifactId: row.id,
      sha256Digest: digest(row.sha256Digest),
      byteLength
    };
  }
  if (!row.bankCashPoolId || !row.statementSourceFingerprint) {
    throw registryError("artifact_integrity_violation");
  }
  return {
    artifactId: row.id,
    sha256Digest: digest(row.sha256Digest),
    byteLength,
    bankCashPoolId: row.bankCashPoolId,
    statementSourceFingerprint: digest(row.statementSourceFingerprint)
  };
}

function resolvedPrivateArtifact(
  row: ArtifactRow,
  accessAuditEventId: string
): ResolvedPrivateFinanceArtifact {
  return {
    artifact: rawArtifactRef(row),
    artifactClass: artifactClassValue(row.artifactClass),
    contentType: contentType(row.contentType),
    privateObject: privateObjectLocator(row),
    retainedUntil: row.retainedUntil.toISOString(),
    accessAuditEventId
  };
}

function privateObjectLocator(row: ArtifactRow): SealedPrivateObjectLocator {
  return {
    privateObjectKey: row.privateObjectKey,
    privateObjectVersion: row.privateObjectVersion,
    envelopeKeyVersion: row.envelopeKeyVersion
  };
}

function normalizeLegalHoldInput(input: {
  readonly artifactId: string;
  readonly holdId: string;
  readonly authorityRef: string;
  readonly reasonCode: string;
}) {
  return {
    artifactId: identifier(input.artifactId),
    holdId: identifier(input.holdId),
    authorityRef: boundedString(input.authorityRef, 320),
    reasonCode: identifier(input.reasonCode)
  };
}

function safeArtifactByteLength(value: string): number {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw registryError("artifact_integrity_violation");
  }
  return Number(parsed);
}

function artifactClassValue(value: string): FinanceArtifactClass {
  if (!artifactClassSet.has(value)) throw registryError("invalid_input");
  return value as FinanceArtifactClass;
}

function contentType(value: string): string {
  if (value.length > 160 || !contentTypePattern.test(value)) throw registryError("invalid_input");
  return value;
}

function digest(value: string): FinanceDigest {
  if (!digestPattern.test(value)) throw registryError("invalid_input");
  return value as FinanceDigest;
}

function identifier(value: string): string {
  return boundedString(value, 160);
}

function privateLocatorValue(value: string, maximumLength: number): string {
  return boundedString(value, maximumLength);
}

function sealedPrivateObjectLocator(
  receipt: SealedPrivateObjectReceipt,
  artifactDigest: FinanceDigest,
  artifactByteLength: number,
  artifactContentType: string
): SealedPrivateObjectLocator {
  const receiptDigest = digest(receipt.sha256Digest);
  const receiptByteLength = registrationByteLength(receipt.byteLength);
  const receiptContentType = contentType(receipt.contentType);
  if (
    receiptDigest !== artifactDigest ||
    receiptByteLength !== artifactByteLength ||
    receiptContentType !== artifactContentType
  ) {
    throw registryError("artifact_integrity_violation");
  }
  return {
    privateObjectKey: privateLocatorValue(receipt.privateObjectKey, 640),
    privateObjectVersion: privateLocatorValue(receipt.privateObjectVersion, 320),
    envelopeKeyVersion: privateLocatorValue(receipt.envelopeKeyVersion, 320)
  };
}

function registrationByteLength(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw registryError("invalid_input");
  }
  return value;
}

function assertExactOwnDataRecord(
  value: unknown,
  acceptedKeySets: readonly (readonly string[])[]
): asserts value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw registryError("invalid_input");
  }
  try {
    if (nodeUtilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      throw registryError("invalid_input");
    }
  } catch {
    throw registryError("invalid_input");
  }
  const keys = Reflect.ownKeys(value);
  if (
    !acceptedKeySets.some(
      (acceptedKeys) =>
        acceptedKeys.length === keys.length &&
        acceptedKeys.every((acceptedKey) => keys.includes(acceptedKey))
    )
  ) {
    throw registryError("invalid_input");
  }
  for (const key of keys) {
    if (typeof key !== "string") throw registryError("invalid_input");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw registryError("invalid_input");
    }
  }
}

function boundedString(value: string, maximumLength: number): string {
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
    throw registryError("invalid_input");
  }
  return value;
}

function requestedArtifactIdHash(artifactId: string): FinanceDigest {
  return `sha256:${createHash("sha256").update(artifactId, "utf8").digest("hex")}`;
}

function containsLuhnPan(value: string): boolean {
  for (const candidate of value.matchAll(/(?:^|\D)((?:\d[ -]?){12,18}\d)(?=\D|$)/g)) {
    const digits = candidate[1]?.replaceAll(/[ -]/g, "") ?? "";
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isPayloadRejectionRule(value: string): value is FinanceArtifactPayloadRejectionRule {
  return (
    value === "forbidden_card_field" ||
    value === "forbidden_pan_value" ||
    value === "forbidden_marketplace_field" ||
    value === "payload_limit_exceeded" ||
    value === "invalid_payload_shape"
  );
}

function registryError(reason: FinanceArtifactRegistryReason): FinanceArtifactRegistryError {
  return new FinanceArtifactRegistryError(reason);
}
