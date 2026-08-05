import { createHash } from "node:crypto";

import type { PlatformTariffAuthorityStore } from "@elevenhouse/domain";
import type {
  FinancePrivateObjectStoragePort,
  PlatformTariffInvoiceChargeCommandFactory,
  PlatformTariffInvoiceChargePreparationReaderPort,
  PlatformTariffInvoiceChargePreparationUnitOfWork
} from "@elevenhouse/domain/finance-core";

import type { PlatformTariffInvoiceChargePreparer } from "./platform-tariff-invoice-charge-preparation-relay";

export class PlatformTariffInvoiceChargePreparerError extends Error {
  readonly code = "PLATFORM_TARIFF_INVOICE_CHARGE_PREPARER_ERROR" as const;

  constructor(readonly reason: "preparation_request_unavailable" | "tariff_snapshot_unavailable" | "artifact_integrity_conflict" | "invalid_idempotency_policy") {
    super("Platform tariff invoice charge preparation is unavailable");
  }
}

/**
 * Seals a token-free provider request before the atomic DB unit of work owns its operation.
 * All UUIDs are derived from the preparation aggregate, so an outbox retry is identity-stable.
 */
export function createPlatformTariffInvoiceChargePreparer(input: Readonly<{
  preparations: PlatformTariffInvoiceChargePreparationReaderPort;
  tariffs: Pick<PlatformTariffAuthorityStore, "findTariffVersion">;
  commandFactory: PlatformTariffInvoiceChargeCommandFactory;
  preparation: PlatformTariffInvoiceChargePreparationUnitOfWork;
  privateObjectStorage: FinancePrivateObjectStoragePort;
  requestArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
  idempotencyRetentionMs: number;
  now: () => Date;
}>): PlatformTariffInvoiceChargePreparer {
  assertRetention(input.idempotencyRetentionMs);
  return Object.freeze({
    async prepare({ preparationRequestId }) {
      const candidate = await input.preparations.findForPreparation({ preparationRequestId });
      if (!candidate) fail("preparation_request_unavailable");
      const tariff = await input.tariffs.findTariffVersion({
        tariffSeriesId: candidate.invoice.tariffSeriesId,
        version: candidate.invoice.tariffVersion,
        canonicalDigest: candidate.invoice.tariffVersionDigest
      });
      if (!tariff) fail("tariff_snapshot_unavailable");
      const command = await input.commandFactory.prepare({
        invoice: candidate.invoice,
        subscription: candidate.subscription,
        tariff,
        savedCardCredential: candidate.savedCardCredential,
        buyerContact: candidate.buyerContact,
        environment: candidate.environment
      });
      const bytes = new TextEncoder().encode(JSON.stringify(command.dispatchEnvelope));
      if (bytes.byteLength > command.operationEnvelope.maximumArtifactBytes) {
        fail("artifact_integrity_conflict");
      }
      const digest = sha256(bytes);
      const artifactId = `arc-platform-tariff-invoice-charge-request:${candidate.preparationRequestId}`;
      const privateObject = await input.privateObjectStorage.writeImmutable({
        artifactId,
        contentType: "application/json",
        bytes,
        expectedSha256Digest: digest
      });
      if (
        privateObject.sha256Digest !== digest ||
        privateObject.byteLength !== bytes.byteLength ||
        privateObject.contentType !== "application/json"
      ) {
        fail("artifact_integrity_conflict");
      }
      const now = input.now();
      if (Number.isNaN(now.getTime())) fail("invalid_idempotency_policy");
      await input.preparation.preparePlatformTariffInvoiceCharge({
        preparationRequestId: candidate.preparationRequestId,
        expectedPreparationRequestVersion: candidate.preparationRequestVersion,
        economicPaymentIntentId: deterministicPlatformTariffInvoiceChargeId(candidate.preparationRequestId, "economic-payment-intent"),
        economicPaymentSessionId: deterministicPlatformTariffInvoiceChargeId(candidate.preparationRequestId, "economic-payment-session"),
        providerOperationIntentId: deterministicPlatformTariffInvoiceChargeId(candidate.preparationRequestId, "provider-operation-intent"),
        providerAccount: command.providerAccount,
        savedCardCredential: candidate.savedCardCredential,
        recurringConsentId: candidate.recurringConsentId,
        recurringConsentVersion: candidate.recurringConsentVersion,
        dispatchArtifact: { artifactId, sha256Digest: digest, byteLength: bytes.byteLength },
        dispatchPrivateObject: privateObject,
        retentionPolicyId: input.requestArtifactRetention.policyId,
        retentionPolicyVersion: input.requestArtifactRetention.policyVersion,
        dispatchEnvelope: command.dispatchEnvelope,
        operationEnvelope: command.operationEnvelope,
        // ArcPay's public financial-mutation contract requires a UUID key. This deterministic
        // operation ID is unique per prepared invoice and stays unchanged across redeliveries.
        idempotencyKey: deterministicPlatformTariffInvoiceChargeId(candidate.preparationRequestId, "provider-operation-intent"),
        idempotencyRetentionDeadline: new Date(now.getTime() + input.idempotencyRetentionMs).toISOString()
      });
    }
  } satisfies PlatformTariffInvoiceChargePreparer);
}

export function deterministicPlatformTariffInvoiceChargeId(
  preparationRequestId: string,
  purpose: "economic-payment-intent" | "economic-payment-session" | "provider-operation-intent"
): string {
  if (!uuid(preparationRequestId)) fail("preparation_request_unavailable");
  const bytes = createHash("sha256")
    .update(`elevenhouse:platform-tariff-invoice-charge:${purpose}:${preparationRequestId}`)
    .digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return `${bytes.subarray(0, 4).toString("hex")}-${bytes.subarray(4, 6).toString("hex")}-${bytes.subarray(6, 8).toString("hex")}-${bytes.subarray(8, 10).toString("hex")}-${bytes.subarray(10, 16).toString("hex")}`;
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertRetention(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) fail("invalid_idempotency_policy");
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function fail(reason: PlatformTariffInvoiceChargePreparerError["reason"]): never {
  throw new PlatformTariffInvoiceChargePreparerError(reason);
}
