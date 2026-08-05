/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  financeRestrictedProviderCredentialHeads,
  financeRestrictedProviderCredentials,
  financeTransientSecretRefs,
} from "../../schema/finance/provider-credentials.schema";
import {
  createProviderAccountIdentityBinding,
  type FinanceDigest,
  type PersistedProviderDispatchReceipt,
  type ProviderOperationDispatchReaderPort,
  type ProviderOperationDispatchWorkItem,
  type ResolvedFinanceOperationEnvelope
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeEconomicPaymentIntents } from "../../schema/finance/economic-payments.schema";
import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import {
  financeProviderDispatchArtifacts,
  financeProviderOperationIntentCreationReceipts,
  financeProviderOperationIntents
} from "../../schema/finance/provider-operations.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";
import { financeSavedCardSetupCustomerActions } from "../../schema/finance/saved-card-setup-actions.schema";
import { financeSavedCardConsentHeads } from "../../schema/finance/saved-card-consents.schema";
import { financePlatformTariffInvoiceCustomerActions } from "../../schema/finance/platform-tariff-invoice-customer-actions.schema";
import { platformTariffInvoices } from "../../schema/platform-billing/tariff-authority.schema";
import { createFinanceArtifactRegistry } from "./finance-artifact-registry";

export type ProviderOperationDispatchReaderErrorReason =
  | "invalid_input"
  | "dispatch_not_found"
  | "dispatch_not_executable"
  | "dispatch_integrity_conflict";

export class ProviderOperationDispatchReaderError extends Error {
  readonly code = "PROVIDER_OPERATION_DISPATCH_READER_ERROR" as const;

  constructor(readonly reason: ProviderOperationDispatchReaderErrorReason) {
    super("Provider operation dispatch could not be reloaded safely");
    this.name = "ProviderOperationDispatchReaderError";
  }
}

type DispatchRow = Readonly<{
  operation: typeof financeProviderOperationIntents.$inferSelect;
  receipt: typeof financeProviderOperationIntentCreationReceipts.$inferSelect;
  economic: typeof financeEconomicPaymentIntents.$inferSelect;
  artifact: typeof financeProviderDispatchArtifacts.$inferSelect;
  privateArtifact: typeof financeArtifacts.$inferSelect;
  transientSecret: typeof financeTransientSecretRefs.$inferSelect | null;
}>;

export type SavedCardCredentialDispatchRow = Readonly<{
  credentialId: string;
  credentialVersion: string;
  providerCustomerId: string;
  restrictedTokenHandleRef: string;
  seriesId: string;
  providerAccountId: string;
  providerIdentityVersion: number;
  headCredentialId: string;
  headCredentialVersion: string;
  headLifecycle: string;
  consentLifecycle: string;
}>;

/**
 * Reads the immutable request identity back from PostgreSQL, then goes through the artifact
 * registry so every private object read receives an access-audit record before S3/KMS access.
 */
export function createDrizzleProviderOperationDispatchReader(
  database: ElevenHouseDatabase
): ProviderOperationDispatchReaderPort {
  const artifactRegistry = createFinanceArtifactRegistry(database);
  return Object.freeze({
    readDispatchWorkItem: async (input) => {
      const providerOperationIntentId = identifier(input.providerOperationIntentId);
      const requestId = identifier(input.requestId);
      const [row] = await database
        .select({
          operation: financeProviderOperationIntents,
          receipt: financeProviderOperationIntentCreationReceipts,
          economic: financeEconomicPaymentIntents,
          artifact: financeProviderDispatchArtifacts,
          privateArtifact: financeArtifacts,
          transientSecret: financeTransientSecretRefs
        })
        .from(financeProviderOperationIntents)
        .innerJoin(
          financeProviderOperationIntentCreationReceipts,
          eq(
            financeProviderOperationIntentCreationReceipts.providerOperationIntentId,
            financeProviderOperationIntents.id
          )
        )
        .leftJoin(
          financeTransientSecretRefs,
          eq(financeTransientSecretRefs.secretRefId, financeProviderOperationIntents.transientSecretRefId)
        )
        .innerJoin(
          financeEconomicPaymentIntents,
          eq(
            financeEconomicPaymentIntents.id,
            financeProviderOperationIntents.economicPaymentIntentId
          )
        )
        .innerJoin(
          financeProviderDispatchArtifacts,
          eq(
            financeProviderDispatchArtifacts.providerOperationIntentId,
            financeProviderOperationIntents.id
          )
        )
        .innerJoin(
          financeArtifacts,
          eq(financeArtifacts.id, financeProviderDispatchArtifacts.artifactId)
        )
        .where(eq(financeProviderOperationIntents.id, providerOperationIntentId))
        .limit(1);
      if (!row) fail("dispatch_not_found");

      const mapped = mapProviderOperationDispatchWorkItem(row);
      const resolvedArtifact = await artifactRegistry.resolvePrivateArtifact({
        artifactId: mapped.dispatchArtifact.artifactId,
        serviceIdentity:
          mapped.operationKind === "refund" ? "refund_processing" : "payment_processing",
        purpose: "provider_operation_dispatch",
        requestId
      });
      if (
        resolvedArtifact.artifactClass !== "provider_request" ||
        resolvedArtifact.artifact.artifactId !== mapped.dispatchArtifact.artifactId ||
        resolvedArtifact.artifact.sha256Digest !== mapped.dispatchArtifact.sha256Digest ||
        resolvedArtifact.artifact.byteLength !== mapped.dispatchArtifact.byteLength
      ) {
        fail("dispatch_integrity_conflict");
      }
      const savedCardSetup = await readSavedCardSetupForDispatch(database, mapped);
      const savedCardCredential = await readSavedCardCredentialForDispatch(
        database,
        mapped,
        row.operation
      );
      const threeDsMethodAction = await readThreeDsMethodActionForDispatch(
        database, artifactRegistry, mapped, requestId
      );
      return Object.freeze({
        ...mapped,
        savedCardCredential,
        savedCardSetup,
        ...(threeDsMethodAction === null ? {} : { threeDsMethodAction }),
        privateObject: resolvedArtifact.privateObject,
        artifactAccessAuditEventId: resolvedArtifact.accessAuditEventId
      });
    }
  });
}

async function readThreeDsMethodActionForDispatch(
  database: ElevenHouseDatabase,
  artifactRegistry: ReturnType<typeof createFinanceArtifactRegistry>,
  workItem: Omit<ProviderOperationDispatchWorkItem, "privateObject" | "artifactAccessAuditEventId" | "savedCardSetup" | "savedCardCredential">,
  requestId: string
) {
  if (workItem.operationKind === "saved_card_charge_3ds_method_complete") {
    return readTariffInvoiceThreeDsMethodActionForDispatch(database, artifactRegistry, workItem, requestId);
  }
  if (workItem.operationKind !== "card_setup_3ds_method_complete") return null;
  const actionId = methodActionId(workItem.dispatch.dispatchAuthorizationId, workItem.dispatch.sourceId);
  const [row] = await database.select({
    action: financeSavedCardSetupCustomerActions,
    session: financeSavedCardSetupSessions,
    artifact: financeArtifacts
  }).from(financeSavedCardSetupCustomerActions)
    .innerJoin(financeSavedCardSetupSessions, eq(financeSavedCardSetupSessions.id, financeSavedCardSetupCustomerActions.setupSessionId))
    .innerJoin(financeArtifacts, eq(financeArtifacts.id, financeSavedCardSetupCustomerActions.providerResponseArtifactId))
    .where(and(eq(financeSavedCardSetupCustomerActions.id, actionId), eq(financeSavedCardSetupCustomerActions.setupSessionId, workItem.dispatch.sourceId)))
    .limit(1);
  if (!row || row.action.status !== "completed" || row.action.actionType !== "three_ds_method" || row.action.phase !== "method" ||
    row.session.providerSetupId === null || row.session.economicPaymentIntentId !== workItem.dispatch.economicPaymentIntentId ||
    row.session.seriesId !== workItem.dispatch.providerAccount.seriesId || row.session.providerAccountId !== workItem.dispatch.providerAccount.providerAccountId || row.session.providerIdentityVersion !== workItem.dispatch.providerAccount.identityVersion ||
    row.artifact.artifactClass !== "provider_response" || row.artifact.bindingKind !== "provider" || row.artifact.sha256Digest !== row.action.providerResponseArtifactDigest ||
    row.artifact.seriesId !== row.session.seriesId || row.artifact.providerAccountId !== row.session.providerAccountId || row.artifact.providerIdentityVersion !== row.session.providerIdentityVersion) fail("dispatch_integrity_conflict");
  const bytes = nonnegativeSafeIntegerFromDecimal(row.artifact.byteLength);
  if (bytes < 1 || !isDigest(row.artifact.sha256Digest)) fail("dispatch_integrity_conflict");
  const resolved = await artifactRegistry.resolvePrivateArtifact({ artifactId: row.artifact.id, serviceIdentity: "payment_processing", purpose: "provider_operation_result_verification", requestId: `${requestId}:three-ds-method` });
  if (resolved.artifactClass !== "provider_response" || resolved.artifact.artifactId !== row.artifact.id || resolved.artifact.sha256Digest !== row.artifact.sha256Digest || resolved.artifact.byteLength !== bytes) fail("dispatch_integrity_conflict");
  return Object.freeze({ customerActionId: row.action.id, providerSetupId: row.session.providerSetupId, responseArtifact: { artifactId: row.artifact.id, sha256Digest: row.artifact.sha256Digest as FinanceDigest, byteLength: bytes }, privateObject: resolved.privateObject, artifactAccessAuditEventId: resolved.accessAuditEventId });
}

async function readTariffInvoiceThreeDsMethodActionForDispatch(
  database: ElevenHouseDatabase,
  artifactRegistry: ReturnType<typeof createFinanceArtifactRegistry>,
  workItem: Omit<ProviderOperationDispatchWorkItem, "privateObject" | "artifactAccessAuditEventId" | "savedCardSetup" | "savedCardCredential">,
  requestId: string
) {
  if (workItem.transientSecret === null) fail("dispatch_integrity_conflict");
  const actionId = tariffInvoiceMethodActionId(workItem.dispatch.dispatchAuthorizationId, workItem.dispatch.sourceId);
  const [row] = await database.select({
    action: financePlatformTariffInvoiceCustomerActions,
    invoice: platformTariffInvoices,
    operation: financeProviderOperationIntents,
    artifact: financeArtifacts
  }).from(financePlatformTariffInvoiceCustomerActions)
    .innerJoin(platformTariffInvoices, eq(platformTariffInvoices.id, financePlatformTariffInvoiceCustomerActions.invoiceId))
    .innerJoin(financeProviderOperationIntents, eq(financeProviderOperationIntents.id, financePlatformTariffInvoiceCustomerActions.providerOperationIntentId))
    .innerJoin(financeArtifacts, eq(financeArtifacts.id, financePlatformTariffInvoiceCustomerActions.providerResponseArtifactId))
    .where(and(
      eq(financePlatformTariffInvoiceCustomerActions.id, actionId),
      eq(financePlatformTariffInvoiceCustomerActions.invoiceId, workItem.dispatch.sourceId)
    )).limit(1);
  if (
    !row || row.action.status !== "completed" || row.action.actionType !== "three_ds_method" ||
    row.action.phase !== "method" || row.action.threeDsMethodContextSecretRefId === null ||
    row.action.threeDsMethodContextSecretRefId !== workItem.transientSecret.secretRefId ||
    row.invoice.state !== "payment_pending" || row.invoice.version !== Number(row.action.invoiceVersion) + 1 ||
    row.operation.status !== "requires_customer_action" || row.operation.operationKind !== "saved_card_charge" ||
    row.operation.version !== row.action.providerOperationIntentVersion ||
    row.operation.purpose !== "platform_invoice" || row.operation.sourceId !== row.invoice.id ||
    row.operation.economicPaymentIntentId !== workItem.dispatch.economicPaymentIntentId ||
    row.operation.economicPaymentSessionId !== workItem.dispatch.economicPaymentSessionId ||
    row.operation.seriesId !== workItem.dispatch.providerAccount.seriesId ||
    row.operation.providerAccountId !== workItem.dispatch.providerAccount.providerAccountId ||
    row.operation.providerIdentityVersion !== workItem.dispatch.providerAccount.identityVersion ||
    row.action.providerPaymentId !== workItem.transientSecret.providerSetupId ||
    row.artifact.artifactClass !== "provider_canonical_read" || row.artifact.bindingKind !== "provider" ||
    row.artifact.sha256Digest !== row.action.providerResponseArtifactDigest ||
    row.artifact.seriesId !== row.operation.seriesId || row.artifact.providerAccountId !== row.operation.providerAccountId ||
    row.artifact.providerIdentityVersion !== row.operation.providerIdentityVersion
  ) fail("dispatch_integrity_conflict");
  const bytes = nonnegativeSafeIntegerFromDecimal(row.artifact.byteLength);
  if (bytes < 1 || !isDigest(row.artifact.sha256Digest)) fail("dispatch_integrity_conflict");
  const resolved = await artifactRegistry.resolvePrivateArtifact({
    artifactId: row.artifact.id,
    serviceIdentity: "payment_processing",
    purpose: "provider_operation_result_verification",
    requestId: `${requestId}:tariff-invoice-three-ds-method`
  });
  if (
    resolved.artifactClass !== "provider_canonical_read" || resolved.artifact.artifactId !== row.artifact.id ||
    resolved.artifact.sha256Digest !== row.artifact.sha256Digest || resolved.artifact.byteLength !== bytes
  ) fail("dispatch_integrity_conflict");
  return Object.freeze({
    customerActionId: row.action.id,
    providerSetupId: row.action.providerPaymentId,
    invoiceVersion: row.invoice.version,
    responseArtifact: { artifactId: row.artifact.id, sha256Digest: row.artifact.sha256Digest as FinanceDigest, byteLength: bytes },
    privateObject: resolved.privateObject,
    artifactAccessAuditEventId: resolved.accessAuditEventId
  });
}

function methodActionId(authorizationId: string, sourceId: string): string {
  if (!uuid(sourceId)) fail("dispatch_integrity_conflict");
  const match = new RegExp(`^saved-card-setup-method:${sourceId}:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`, "i").exec(authorizationId);
  if (!match?.[1]) fail("dispatch_integrity_conflict");
  return match[1];
}

function tariffInvoiceMethodActionId(authorizationId: string, sourceId: string): string {
  if (!uuid(sourceId)) fail("dispatch_integrity_conflict");
  const match = new RegExp(`^platform-invoice-method:${sourceId}:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`, "i").exec(authorizationId);
  if (!match?.[1]) fail("dispatch_integrity_conflict");
  return match[1];
}

export function mapProviderOperationDispatchWorkItem(
  row: DispatchRow
): Omit<ProviderOperationDispatchWorkItem, "privateObject" | "artifactAccessAuditEventId" | "savedCardSetup" | "savedCardCredential"> {
  const status = dispatchStatus(row.operation.status);
  const receipt = row.receipt;
  const operation = row.operation;
  const economic = row.economic;
  const artifact = row.artifact;
  const providerOperationIntentVersion = revision(receipt.providerOperationIntentVersion, true);
  const economicPaymentVersion = revision(receipt.correlatedEconomicPaymentVersion, false);
  const artifactByteLength = nonnegativeSafeIntegerFromDecimal(row.privateArtifact.byteLength);
  if (
    providerOperationIntentVersion !== 0 ||
    economicPaymentVersion < 1 ||
    receipt.providerOperationIntentId !== operation.id ||
    receipt.providerOperationIntentId !== artifact.providerOperationIntentId ||
    receipt.economicPaymentIntentId !== economic.id ||
    receipt.economicPaymentIntentId !== operation.economicPaymentIntentId ||
    receipt.correlatedEconomicPaymentVersion !== operation.correlatedEconomicPaymentVersion ||
    receipt.correlatedEconomicPaymentVersion !== economic.version ||
    receipt.seriesId !== operation.seriesId ||
    receipt.providerAccountId !== operation.providerAccountId ||
    receipt.providerIdentityVersion !== operation.providerIdentityVersion ||
    receipt.purpose !== operation.purpose ||
    receipt.sourceId !== operation.sourceId ||
    receipt.operationKind !== operation.operationKind ||
    receipt.canonicalRequestDigest !== operation.canonicalRequestDigest ||
    receipt.canonicalRequestDigest !== artifact.canonicalRequestDigest ||
    receipt.dispatchArtifactId !== artifact.artifactId ||
    receipt.dispatchArtifactDigest !== artifact.artifactDigest ||
    row.privateArtifact.id !== artifact.artifactId ||
    row.privateArtifact.artifactClass !== "provider_request" ||
    row.privateArtifact.sha256Digest !== artifact.artifactDigest ||
    !isDigest(receipt.canonicalRequestDigest) ||
    !isDigest(receipt.dispatchAuthorizationDigest) ||
    receipt.idempotencyKey !== operation.idempotencyKey ||
    economic.currency !== "RUB" ||
    !(receipt.committedAt instanceof Date) ||
    Number.isNaN(receipt.committedAt.getTime()) ||
    !/^postgres-xid:[0-9]+$/.test(receipt.persistenceTransactionBoundaryRef)
  ) {
    fail("dispatch_integrity_conflict");
  }
  const purpose = purposeValue(receipt.purpose);
  const operationKind = operationKindValue(receipt.operationKind);
  const dispatch = Object.freeze({
    kind: "persisted_provider_dispatch_receipt" as const,
    providerOperationIntentId: receipt.providerOperationIntentId,
    providerOperationIntentVersion,
    economicPaymentIntentId: receipt.economicPaymentIntentId,
    economicPaymentVersion,
    economicPaymentSessionId: receipt.economicPaymentSessionId,
    sourceId: receipt.sourceId,
    purpose,
    amountMinor: decimalAmount(economic.amountMinor, purpose === "platform_card_setup"),
    currency: "RUB" as const,
    providerAccount: createProviderAccountIdentityBinding({
      seriesId: receipt.seriesId,
      providerAccountId: receipt.providerAccountId,
      identityVersion: receipt.providerIdentityVersion
    }),
    canonicalRequestDigest: receipt.canonicalRequestDigest as FinanceDigest,
    dispatchAuthorizationId: receipt.dispatchAuthorizationId,
    dispatchAuthorizationDigest: receipt.dispatchAuthorizationDigest as FinanceDigest,
    idempotencyKey: receipt.idempotencyKey,
    sealedDispatchPayloadRef: receipt.dispatchArtifactId,
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef,
    committedAt: receipt.committedAt.toISOString()
  }) as PersistedProviderDispatchReceipt;
  const operationEnvelope = Object.freeze({
    kind: "resolved_finance_operation_envelope" as const,
    policyId: operation.operationPolicyId,
    policyVersion: operation.operationPolicyVersion,
    policyDigest: operation.operationPolicyDigest as FinanceDigest,
    maximumRows: operation.operationMaximumRows,
    maximumDecimalDigits: operation.operationMaximumDecimalDigits,
    maximumArtifactBytes: operation.operationMaximumArtifactBytes
  }) as ResolvedFinanceOperationEnvelope;
  if (
    !/^[1-9][0-9]*$/.test(String(operationEnvelope.policyVersion)) ||
    !isDigest(operationEnvelope.policyDigest) ||
    operationEnvelope.maximumRows < 1 ||
    operationEnvelope.maximumDecimalDigits < 1 ||
    operationEnvelope.maximumArtifactBytes < 1
  ) {
    fail("dispatch_integrity_conflict");
  }
  return Object.freeze({
    status,
    operationKind,
    dispatch,
    operationEnvelope,
    dispatchArtifact: Object.freeze({
      artifactId: artifact.artifactId,
      sha256Digest: artifact.artifactDigest as FinanceDigest,
      byteLength: artifactByteLength
    }),
    transientSecret: transientSecret(operation, row.transientSecret)
  });
}

/**
 * Rechecks the mutable credential and consent heads immediately before worker I/O.  The
 * provider token remains behind the returned opaque vault locator.
 */
export function mapSavedCardCredentialForDispatch(
  operation: typeof financeProviderOperationIntents.$inferSelect,
  credential: SavedCardCredentialDispatchRow
) {
  if (operation.operationKind !== "saved_card_charge") fail("dispatch_integrity_conflict");
  const credentialId = identifier(operation.restrictedCredentialId);
  const credentialVersion = revision(operation.restrictedCredentialVersion ?? "", false);
  if (
    credential.credentialId !== credentialId ||
    credential.credentialVersion !== String(credentialVersion) ||
    credential.seriesId !== operation.seriesId ||
    credential.providerAccountId !== operation.providerAccountId ||
    credential.providerIdentityVersion !== operation.providerIdentityVersion ||
    credential.headCredentialId !== credentialId ||
    credential.headCredentialVersion !== String(credentialVersion) ||
    credential.headLifecycle !== "active" ||
    credential.consentLifecycle !== "granted" ||
    !validProviderCustomerId(credential.providerCustomerId) ||
    !/^(vault|kms):\/\/[^\s?#]+$/.test(credential.restrictedTokenHandleRef)
  ) {
    fail("dispatch_integrity_conflict");
  }
  return Object.freeze({
    credentialId,
    credentialVersion,
    providerCustomerId: credential.providerCustomerId,
    restrictedTokenHandleRef: credential.restrictedTokenHandleRef
  });
}

async function readSavedCardCredentialForDispatch(
  database: ElevenHouseDatabase,
  workItem: Omit<ProviderOperationDispatchWorkItem, "privateObject" | "artifactAccessAuditEventId" | "savedCardSetup" | "savedCardCredential">,
  operation: typeof financeProviderOperationIntents.$inferSelect
) {
  if (workItem.operationKind !== "saved_card_charge") {
    if (operation.restrictedCredentialId !== null || operation.restrictedCredentialVersion !== null) {
      fail("dispatch_integrity_conflict");
    }
    return null;
  }
  const credentialId = identifier(operation.restrictedCredentialId);
  const credentialVersion = revision(operation.restrictedCredentialVersion ?? "", false);
  const [credential] = await database
    .select({
      credentialId: financeRestrictedProviderCredentials.credentialId,
      credentialVersion: financeRestrictedProviderCredentials.credentialVersion,
      providerCustomerId: financeRestrictedProviderCredentials.providerCustomerId,
      restrictedTokenHandleRef: financeRestrictedProviderCredentials.restrictedTokenHandleRef,
      seriesId: financeRestrictedProviderCredentials.seriesId,
      providerAccountId: financeRestrictedProviderCredentials.providerAccountId,
      providerIdentityVersion: financeRestrictedProviderCredentials.providerIdentityVersion,
      headCredentialId: financeRestrictedProviderCredentialHeads.currentCredentialId,
      headCredentialVersion: financeRestrictedProviderCredentialHeads.currentCredentialVersion,
      headLifecycle: financeRestrictedProviderCredentialHeads.currentLifecycle,
      consentLifecycle: financeSavedCardConsentHeads.currentLifecycle
    })
    .from(financeRestrictedProviderCredentials)
    .innerJoin(
      financeRestrictedProviderCredentialHeads,
      and(
        eq(financeRestrictedProviderCredentialHeads.seriesId, financeRestrictedProviderCredentials.seriesId),
        eq(financeRestrictedProviderCredentialHeads.providerAccountId, financeRestrictedProviderCredentials.providerAccountId),
        eq(financeRestrictedProviderCredentialHeads.providerIdentityVersion, financeRestrictedProviderCredentials.providerIdentityVersion),
        eq(financeRestrictedProviderCredentialHeads.providerCustomerId, financeRestrictedProviderCredentials.providerCustomerId)
      )
    )
    .innerJoin(
      financeSavedCardConsentHeads,
      and(
        eq(financeSavedCardConsentHeads.consentId, financeRestrictedProviderCredentials.consentId),
        eq(financeSavedCardConsentHeads.consentVersion, financeRestrictedProviderCredentials.consentVersion)
      )
    )
    .where(
      and(
        eq(financeRestrictedProviderCredentials.credentialId, credentialId),
        eq(financeRestrictedProviderCredentials.credentialVersion, String(credentialVersion)),
        eq(financeRestrictedProviderCredentials.seriesId, workItem.dispatch.providerAccount.seriesId),
        eq(financeRestrictedProviderCredentials.providerAccountId, workItem.dispatch.providerAccount.providerAccountId),
        eq(financeRestrictedProviderCredentials.providerIdentityVersion, workItem.dispatch.providerAccount.identityVersion)
      )
    )
    .limit(1);
  if (!credential) fail("dispatch_integrity_conflict");
  return mapSavedCardCredentialForDispatch(operation, credential);
}

async function readSavedCardSetupForDispatch(
  database: ElevenHouseDatabase,
  workItem: Omit<ProviderOperationDispatchWorkItem, "privateObject" | "artifactAccessAuditEventId" | "savedCardSetup" | "savedCardCredential">
) {
  if (workItem.operationKind !== "card_setup_execute" && workItem.operationKind !== "card_setup_3ds_method_complete") return null;
  const [session] = await database
    .select({
      id: financeSavedCardSetupSessions.id,
      version: financeSavedCardSetupSessions.version,
      state: financeSavedCardSetupSessions.state,
      providerSetupId: financeSavedCardSetupSessions.providerSetupId,
      economicPaymentIntentId: financeSavedCardSetupSessions.economicPaymentIntentId,
      seriesId: financeSavedCardSetupSessions.seriesId,
      providerAccountId: financeSavedCardSetupSessions.providerAccountId,
      providerIdentityVersion: financeSavedCardSetupSessions.providerIdentityVersion
    })
    .from(financeSavedCardSetupSessions)
    .where(eq(financeSavedCardSetupSessions.id, workItem.dispatch.sourceId))
    .limit(1);
  if (
    !session ||
    session.state !== "execution_pending" ||
    session.providerSetupId === null ||
    session.economicPaymentIntentId !== workItem.dispatch.economicPaymentIntentId ||
    session.seriesId !== workItem.dispatch.providerAccount.seriesId ||
    session.providerAccountId !== workItem.dispatch.providerAccount.providerAccountId ||
    session.providerIdentityVersion !== workItem.dispatch.providerAccount.identityVersion
  ) {
    fail("dispatch_integrity_conflict");
  }
  return Object.freeze({
    setupSessionVersion: positiveSafeInteger(session.version),
    state: "execution_pending" as const,
    providerSetupId: session.providerSetupId
  });
}

function transientSecret(
  operation: typeof financeProviderOperationIntents.$inferSelect,
  secret: typeof financeTransientSecretRefs.$inferSelect | null
): Readonly<{ secretRefId: string; sealedSecretRef: string; providerSetupId: string }> | null {
  const needsSecret =
    (operation.operationKind === "card_setup_execute" && operation.dispatchStep === "execute") ||
    (operation.operationKind === "card_setup_3ds_method_complete" && operation.dispatchStep === "complete_3ds_method") ||
    (operation.operationKind === "saved_card_charge_3ds_method_complete" && operation.dispatchStep === "complete_3ds_method");
  if (!needsSecret) {
    if (operation.transientSecretRefId !== null || secret !== null) fail("dispatch_integrity_conflict");
    return null;
  }
  if (
    operation.transientSecretRefId === null ||
    secret === null ||
    secret.secretRefId !== operation.transientSecretRefId ||
    secret.seriesId !== operation.seriesId ||
    secret.providerAccountId !== operation.providerAccountId ||
    secret.providerIdentityVersion !== operation.providerIdentityVersion ||
    !/^kms:\/\/s3\/[A-Za-z0-9_-]+$/.test(secret.sealedSecretRef)
  ) {
    fail("dispatch_integrity_conflict");
  }
  return Object.freeze({
    secretRefId: secret.secretRefId,
    sealedSecretRef: secret.sealedSecretRef,
    providerSetupId: secret.providerSetupId
  });
}

function dispatchStatus(value: string): "pending_dispatch" | "provider_unknown" {
  if (value === "pending_dispatch" || value === "provider_unknown") return value;
  fail("dispatch_not_executable");
}

function purposeValue(value: string): "client_order" | "platform_invoice" | "platform_card_setup" {
  if (value === "client_order" || value === "platform_invoice" || value === "platform_card_setup") {
    return value;
  }
  fail("dispatch_integrity_conflict");
}

function operationKindValue(
  value: string
): "checkout_session_create" | "card_setup" | "card_setup_execute" | "card_setup_3ds_method_complete" | "saved_card_charge" | "saved_card_charge_3ds_method_complete" | "refund" | "void" {
  if (
    value === "checkout_session_create" ||
    value === "card_setup" ||
    value === "card_setup_execute" ||
    value === "card_setup_3ds_method_complete" ||
    value === "saved_card_charge" ||
    value === "saved_card_charge_3ds_method_complete" ||
    value === "refund" ||
    value === "void"
  ) {
    return value;
  }
  fail("dispatch_integrity_conflict");
}

function revision(value: string, zeroAllowed: boolean): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) fail("dispatch_integrity_conflict");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (!zeroAllowed && parsed < 1)) {
    fail("dispatch_integrity_conflict");
  }
  return parsed;
}

function decimalAmount(value: string, zeroAllowed: boolean): string {
  if (!(zeroAllowed ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/).test(value)) {
    fail("dispatch_integrity_conflict");
  }
  return value;
}

function nonnegativeSafeIntegerFromDecimal(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) fail("dispatch_integrity_conflict");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail("dispatch_integrity_conflict");
  return parsed;
}

function positiveSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) fail("dispatch_integrity_conflict");
  return value;
}

function isDigest(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 160 ||
    /[\u0000-\u001F]/.test(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function validProviderCustomerId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001F\u007F]/.test(value);
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function fail(reason: ProviderOperationDispatchReaderErrorReason): never {
  throw new ProviderOperationDispatchReaderError(reason);
}
