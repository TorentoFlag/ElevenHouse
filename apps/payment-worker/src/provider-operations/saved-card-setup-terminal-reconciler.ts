import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type {
  FinancePrivateObjectStoragePort,
  FinanceRestrictedProviderCredentialVaultPort,
  PlatformTariffCredentialActivationUnitOfWork,
  ProviderOperationResultApplicationUnitOfWork,
  RawProviderArtifactRef,
  SavedCardCredentialActivationUnitOfWork,
  SavedCardSetupTerminalReconciliationCandidate
} from "@elevenhouse/domain/finance-core";

import {
  ArcPayCanonicalPaymentReaderError,
  type ArcPayCanonicalPaymentReader
} from "../arc-pay/arc-pay-canonical-payment-reader";
import type { ProviderResponseArtifactRetention } from "./hosted-checkout-session-dispatcher";

export type SavedCardSetupTerminalReconciliationResult =
  | Readonly<{ kind: "not_terminal"; setupSessionId: string }>
  | Readonly<{ kind: "activated_and_invoice_opened"; setupSessionId: string; invoiceId: string }>
  | Readonly<{ kind: "invoice_opened_after_replay"; setupSessionId: string; invoiceId: string }>;

export type SavedCardSetupTerminalReconciler = Readonly<{
  reconcile(
    candidate: SavedCardSetupTerminalReconciliationCandidate
  ): Promise<SavedCardSetupTerminalReconciliationResult>;
}>;

/**
 * Completes the setup only from ArcPay's canonical resources. The payment/card raw JSON may
 * contain a reusable token, so it is never registered as an artifact: we retain a deterministic
 * token-free observation plus the raw-response digest, while the token itself is sealed only in
 * the restricted credential vault.
 */
export function createSavedCardSetupTerminalReconciler(input: Readonly<{
  canonicalReader: Pick<ArcPayCanonicalPaymentReader, "readActivatedSavedCardSetup">;
  privateObjectStorage: FinancePrivateObjectStoragePort;
  artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  providerResult: ProviderOperationResultApplicationUnitOfWork;
  credentialVault: FinanceRestrictedProviderCredentialVaultPort;
  credentialActivation: SavedCardCredentialActivationUnitOfWork;
  tariffActivation: PlatformTariffCredentialActivationUnitOfWork;
  responseArtifactRetention: ProviderResponseArtifactRetention;
  now?: () => Date;
}>): SavedCardSetupTerminalReconciler {
  const retention = normalizeRetention(input.responseArtifactRetention);
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    async reconcile(candidate) {
      if (candidate.state === "credential_active") {
        const invoice = await input.tariffActivation.createInitialInvoiceAfterVerifiedCredentialActivation({
          subscriptionId: candidate.subscriptionId,
          expectedSubscriptionVersion: candidate.expectedSubscriptionVersion,
          savedCardCredentialId: candidate.savedCardCredentialId,
          savedCardCredentialVersion: candidate.savedCardCredentialVersion,
          now: instant(now())
        });
        return Object.freeze({
          kind: "invoice_opened_after_replay" as const,
          setupSessionId: candidate.setupSessionId,
          invoiceId: invoice.invoiceId
        });
      }

      let observation;
      try {
        observation = await input.canonicalReader.readActivatedSavedCardSetup({
          providerSetupId: candidate.providerSetupId,
          expectedExternalId: candidate.setupSessionId,
          providerCustomerId: candidate.providerCustomerId
        });
      } catch (error) {
        if (
          error instanceof ArcPayCanonicalPaymentReaderError &&
          error.reason === "not_setup_terminal"
        ) {
          return Object.freeze({ kind: "not_terminal" as const, setupSessionId: candidate.setupSessionId });
        }
        throw error;
      }

      const credentialId = `saved-card-credential:${candidate.setupSessionId}`;
      const sealedCredential = await input.credentialVault.sealArcPaySavedCardCredential({
        credentialId,
        providerCustomerId: candidate.providerCustomerId,
        cardTokenId: observation.setup.cardTokenId
      });
      const paymentArtifact = await sealTokenFreeCanonicalObservation({
        privateObjectStorage: input.privateObjectStorage,
        artifactRegistry: input.artifactRegistry,
        providerAccount:
          candidate.state === "awaiting_provider_terminal"
            ? candidate.providerOperation.providerAccount
            : candidate.providerResult.providerAccount,
        retention,
        label: "payment",
        setupSessionId: candidate.setupSessionId,
        rawResponseBytes: observation.rawPaymentResponseBytes,
        payload: {
          kind: "arc_pay_saved_card_setup_payment_canonical_observation_v1",
          providerSetupId: observation.setup.providerSetupId,
          externalId: observation.setup.externalId,
          observedAt: observation.setup.observedAt
        }
      });
      const directoryArtifact = await sealTokenFreeCanonicalObservation({
        privateObjectStorage: input.privateObjectStorage,
        artifactRegistry: input.artifactRegistry,
        providerAccount:
          candidate.state === "awaiting_provider_terminal"
            ? candidate.providerOperation.providerAccount
            : candidate.providerResult.providerAccount,
        retention,
        label: "card-directory",
        setupSessionId: candidate.setupSessionId,
        rawResponseBytes: observation.rawSavedCardsResponseBytes,
        payload: {
          kind: "arc_pay_saved_card_directory_canonical_observation_v1",
          providerSetupId: observation.setup.providerSetupId,
          providerCustomerId: candidate.providerCustomerId,
          providerCredentialFingerprint: sealedCredential.providerCredentialFingerprint,
          displayBrand: observation.setup.displayBrand,
          displayLast4: observation.setup.displayLast4,
          displayMask: observation.setup.displayMask,
          expiryMonth: observation.setup.expiryMonth,
          expiryYear: observation.setup.expiryYear,
          observedAt: observation.setup.observedAt
        }
      });
      const providerResult = candidate.state === "awaiting_provider_terminal"
        ? await input.providerResult.applyVerifiedProviderResult({
            economicPaymentIntentId: candidate.providerOperation.economicPaymentIntentId,
            expectedEconomicPaymentVersion: candidate.providerOperation.expectedEconomicPaymentVersion,
            providerOperationIntentId: candidate.providerOperation.providerOperationIntentId,
            expectedProviderOperationIntentVersion:
              candidate.providerOperation.expectedProviderOperationIntentVersion,
            evidence: verifiedTerminalSetupEvidence(candidate, paymentArtifact, observation.setup.observedAt),
            operationEnvelope: candidate.providerOperation.operationEnvelope
          })
        : candidate.providerResult;
      const activated = await input.credentialActivation.activateSavedCardCredential({
        setupSessionId: candidate.setupSessionId,
        expectedSetupSessionVersion: candidate.setupSessionVersion,
        providerResult,
        credential: {
          credentialId,
          restrictedTokenHandleRef: sealedCredential.restrictedTokenHandleRef,
          providerCredentialFingerprint: sealedCredential.providerCredentialFingerprint,
          displayBrand: observation.setup.displayBrand,
          displayLast4: observation.setup.displayLast4,
          displayMask: observation.setup.displayMask,
          expiryMonth: observation.setup.expiryMonth,
          expiryYear: observation.setup.expiryYear
        },
        canonicalSavedCardDirectoryArtifact: directoryArtifact,
        observedAt: observation.setup.observedAt
      });
      const invoice = await input.tariffActivation.createInitialInvoiceAfterVerifiedCredentialActivation({
        subscriptionId: candidate.subscriptionId,
        expectedSubscriptionVersion: candidate.expectedSubscriptionVersion,
        savedCardCredentialId: activated.savedCardCredentialId,
        savedCardCredentialVersion: activated.savedCardCredentialVersion,
        now: instant(now())
      });
      return Object.freeze({
        kind: "activated_and_invoice_opened" as const,
        setupSessionId: candidate.setupSessionId,
        invoiceId: invoice.invoiceId
      });
    }
  });
}

async function sealTokenFreeCanonicalObservation(input: Readonly<{
  privateObjectStorage: FinancePrivateObjectStoragePort;
  artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  providerAccount: import("@elevenhouse/domain/finance-core").FinanceProviderAccountIdentity;
  retention: ProviderResponseArtifactRetention;
  label: "payment" | "card-directory";
  setupSessionId: string;
  rawResponseBytes: Uint8Array;
  payload: Record<string, unknown>;
}>): Promise<RawProviderArtifactRef> {
  const rawResponseDigest = digest(input.rawResponseBytes);
  const bytes = new TextEncoder().encode(JSON.stringify({
    ...input.payload,
    rawResponseDigest
  }));
  const sha256Digest = digest(bytes);
  const artifactId = `arc-card-setup-canonical-${input.label}:${input.setupSessionId}:${sha256Digest.slice(7)}`;
  const privateObject = await input.privateObjectStorage.writeImmutable({
    artifactId,
    contentType: "application/json",
    bytes,
    expectedSha256Digest: sha256Digest
  });
  if (
    privateObject.contentType !== "application/json" ||
    privateObject.sha256Digest !== sha256Digest ||
    privateObject.byteLength !== bytes.byteLength
  ) {
    throw new SavedCardSetupTerminalReconcilerError("canonical_artifact_integrity");
  }
  const artifact = await input.artifactRegistry.registerSealedArtifact({
    artifact: { artifactId, sha256Digest, byteLength: bytes.byteLength },
    artifactClass: "provider_canonical_read",
    binding: { kind: "provider", providerAccount: input.providerAccount },
    contentType: "application/json",
    privateObject,
    retentionPolicyId: input.retention.policyId,
    retentionPolicyVersion: input.retention.policyVersion
  });
  if (
    !("artifactId" in artifact) ||
    artifact.artifactId !== artifactId ||
    artifact.sha256Digest !== sha256Digest ||
    artifact.byteLength !== bytes.byteLength
  ) {
    throw new SavedCardSetupTerminalReconcilerError("canonical_artifact_integrity");
  }
  return artifact;
}

function verifiedTerminalSetupEvidence(
  candidate: Extract<SavedCardSetupTerminalReconciliationCandidate, { state: "awaiting_provider_terminal" }>,
  artifact: RawProviderArtifactRef,
  observedAt: string
) {
  return {
    kind: "verified_provider_operation_evidence" as const,
    providerAccount: candidate.providerOperation.providerAccount,
    economicPaymentIntentId: candidate.providerOperation.economicPaymentIntentId,
    economicPaymentSessionId: candidate.providerOperation.economicPaymentSessionId,
    sourceId: candidate.providerOperation.sourceId,
    purpose: candidate.providerOperation.purpose,
    providerOperationIntentId: candidate.providerOperation.providerOperationIntentId,
    operationKind: candidate.providerOperation.operationKind,
    providerOperationId: candidate.providerSetupId,
    canonicalRequestDigest: candidate.providerOperation.canonicalRequestDigest,
    idempotencyKey: candidate.providerOperation.idempotencyKey,
    outcome: "succeeded" as const,
    providerPaymentId: candidate.providerSetupId,
    amountMinor: "0",
    currency: "RUB" as const,
    artifact,
    observedAt
  } as import("@elevenhouse/domain/finance-core").VerifiedProviderOperationEvidence;
}

export class SavedCardSetupTerminalReconcilerError extends Error {
  readonly code = "SAVED_CARD_SETUP_TERMINAL_RECONCILER_ERROR" as const;
  constructor(readonly reason: "canonical_artifact_integrity" | "invalid_retention") {
    super("Saved-card terminal reconciliation could not retain canonical evidence safely");
  }
}

function normalizeRetention(value: ProviderResponseArtifactRetention): ProviderResponseArtifactRetention {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value.policyId) || !/^[1-9][0-9]*$/.test(value.policyVersion)) {
    throw new SavedCardSetupTerminalReconcilerError("invalid_retention");
  }
  return value;
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function instant(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new SavedCardSetupTerminalReconcilerError("invalid_retention");
  return value.toISOString();
}
