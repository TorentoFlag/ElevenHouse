import { createHash } from "node:crypto";
import {
  resolveFinanceOperationEnvelope,
  type FinanceOperationResourcePolicyReader,
  type FinancePrivateObjectStoragePort,
  type SavedCardSetupPreparationUnitOfWork
} from "@elevenhouse/domain/finance-core";
import type { SavedCardSetupSessionReader } from "@elevenhouse/db/finance";
import type { SavedCardSetupPreparer } from "./saved-card-setup-preparation-relay";

export function createSavedCardSetupPreparer(input: Readonly<{ sessions: SavedCardSetupSessionReader; policyReader: FinanceOperationResourcePolicyReader; preparation: SavedCardSetupPreparationUnitOfWork; privateObjectStorage: FinancePrivateObjectStoragePort; requestArtifactRetention: { policyId: string; policyVersion: string }; returnOrigin: string }>): SavedCardSetupPreparer {
  const origin = new URL(input.returnOrigin).origin;
  return Object.freeze({ async prepare({ setupSessionId }) {
    const session = await input.sessions.findForPreparation({ setupSessionId });
    if (!session) throw new Error("Saved-card setup session is unavailable for preparation");
    if (session.state === "preparation_pending") return;
    const policy = await input.policyReader.findPublishedForOperation({ operationKind: "platform_card_setup_prepare" });
    if (!policy) throw new Error("Published platform_card_setup_prepare policy is required");
    const operationEnvelope = resolveFinanceOperationEnvelope({ policy, operationKind: "platform_card_setup_prepare" });
    const dispatchEnvelope = Object.freeze({ kind: "card_setup" as const, step: "create" as const, customerId: session.providerCustomerId, setupExternalId: session.setupSessionId, successUrl: `${origin}/settings/billing/card-setup/success`, failureUrl: `${origin}/settings/billing/card-setup/failure` });
    const bytes = new TextEncoder().encode(JSON.stringify(dispatchEnvelope));
    if (bytes.byteLength > operationEnvelope.maximumArtifactBytes) throw new Error("Card setup request exceeds published operation policy");
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const artifactId = `arc-card-setup-request:${session.setupSessionId}`;
    const privateObject = await input.privateObjectStorage.writeImmutable({ artifactId, contentType: "application/json", bytes, expectedSha256Digest: digest });
    const economicPaymentIntentId = deterministicSavedCardSetupId(session.setupSessionId, "economic-payment-intent");
    const economicPaymentSessionId = deterministicSavedCardSetupId(session.setupSessionId, "economic-payment-session");
    const providerOperationIntentId = deterministicSavedCardSetupId(session.setupSessionId, "provider-operation-intent");
    await input.preparation.prepareSavedCardSetup({ setupSessionId: session.setupSessionId, economicPaymentIntentId, economicPaymentSessionId, providerOperationIntentId, providerAccount: session.providerAccount, dispatchArtifact: { artifactId, sha256Digest: digest, byteLength: bytes.byteLength }, dispatchPrivateObject: privateObject, retentionPolicyId: input.requestArtifactRetention.policyId, retentionPolicyVersion: input.requestArtifactRetention.policyVersion, dispatchEnvelope, operationEnvelope, idempotencyKey: providerOperationIntentId, idempotencyRetentionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() });
  } });
}

export function deterministicSavedCardSetupId(
  setupSessionId: string,
  purpose: "economic-payment-intent" | "economic-payment-session" | "provider-operation-intent"
): string {
  if (!uuid(setupSessionId)) throw new Error("Saved-card setup session id must be a UUID");
  const bytes = createHash("sha256")
    .update(`elevenhouse:saved-card-setup:${purpose}:${setupSessionId}`)
    .digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return `${bytes.subarray(0, 4).toString("hex")}-${bytes.subarray(4, 6).toString("hex")}-${bytes.subarray(6, 8).toString("hex")}-${bytes.subarray(8, 10).toString("hex")}-${bytes.subarray(10, 16).toString("hex")}`;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
