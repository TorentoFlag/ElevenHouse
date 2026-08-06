import { createHash } from "node:crypto";

import type { CheckoutPreparationResponse, CreateCheckoutRequest } from "@elevenhouse/contracts";
import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  type ClientOrderCheckoutCommandFactory,
  type ClientOrderCheckoutPreparationUnitOfWork,
  type FinancePrivateObjectStoragePort
} from "@elevenhouse/domain/finance-core";
import { canonicalizeFinanceCommandPayload, type FinanceOrder } from "@elevenhouse/domain";

const idempotencyRetentionHours = 72;

export class ClientCheckoutPreparationServiceError extends Error {
  readonly code = "client_checkout_preparation_error" as const;

  constructor(readonly reason: "artifact_write_integrity" | "artifact_registration_integrity") {
    super("Client checkout preparation could not seal its provider dispatch payload");
  }
}

type Clock = Readonly<{ now(): Date }>;

/**
 * Server-side boundary for browser checkout acceptance. It creates no ArcPay session: it seals a
 * canonical provider request, registers its retention-bound evidence, then commits the complete
 * economic intent/authorization/outbox transaction. Deterministic IDs make a retried HTTP
 * idempotency key replay the same durable preparation.
 */
export class ClientCheckoutPreparationService {
  constructor(
    private readonly factory: ClientOrderCheckoutCommandFactory,
    private readonly privateObjectStorage: Pick<FinancePrivateObjectStoragePort, "writeImmutable">,
    private readonly artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">,
    private readonly preparation: ClientOrderCheckoutPreparationUnitOfWork,
    private readonly options: Readonly<{
      paymentMethods: readonly Readonly<{
        method:
          | "bank_card"
          | "sbp"
          | "sberpay"
          | "tpay"
          | "alfapay"
          | "dolyami"
          | "mirpay"
          | "applepay"
          | "googlepay";
        paymentMode: "h2h" | "redirect";
      }>[];
      requestArtifactRetention: Readonly<{ policyId: string; policyVersion: string }>;
      clock: Clock;
    }>
  ) {}

  async accept(
    input: Readonly<{
      order: FinanceOrder;
      clientUserId: string;
      request: CreateCheckoutRequest;
      idempotencyKey: string;
    }>
  ): Promise<CheckoutPreparationResponse> {
    const ids = checkoutIds(input.clientUserId, input.order.id, input.idempotencyKey);
    const prepared = await this.factory.prepare({
      order: input.order,
      clientUserId: input.clientUserId,
      buyerContact: input.request.buyerContact,
      paymentMethods: this.options.paymentMethods,
      successUrl: input.request.successUrl,
      failureUrl: input.request.failureUrl,
      cancelUrl: input.request.cancelUrl
    });
    const bytes = canonicalizeFinanceCommandPayload(prepared.dispatchEnvelope);
    const digest = sha256(bytes);
    const requestArtifactId = providerRequestArtifactId(prepared.providerAccount, digest);
    const written = await this.privateObjectStorage.writeImmutable({
      artifactId: requestArtifactId,
      contentType: "application/json",
      bytes,
      expectedSha256Digest: digest
    });
    if (
      written.sha256Digest !== digest ||
      written.byteLength !== bytes.byteLength ||
      written.contentType !== "application/json"
    ) {
      throw new ClientCheckoutPreparationServiceError("artifact_write_integrity");
    }
    const artifact = await this.artifactRegistry.registerSealedArtifact({
      artifact: {
        artifactId: requestArtifactId,
        sha256Digest: digest,
        byteLength: bytes.byteLength
      },
      artifactClass: "provider_request",
      contentType: "application/json",
      privateObject: written,
      retentionPolicyId: this.options.requestArtifactRetention.policyId,
      retentionPolicyVersion: this.options.requestArtifactRetention.policyVersion,
      binding: { kind: "provider", providerAccount: prepared.providerAccount }
    });
    if (
      artifact.artifactId !== requestArtifactId ||
      artifact.sha256Digest !== digest ||
      artifact.byteLength !== bytes.byteLength
    ) {
      throw new ClientCheckoutPreparationServiceError("artifact_registration_integrity");
    }
    const committed = await this.preparation.prepareClientOrderCheckout({
      checkoutPreparationId: ids.checkoutPreparationId,
      checkoutAuthorizationId: ids.checkoutAuthorizationId,
      paymentCommandId: ids.paymentCommandId,
      orderId: input.order.id,
      clientUserId: input.clientUserId,
      economicPaymentIntentId: ids.economicPaymentIntentId,
      economicPaymentSessionId: ids.economicPaymentSessionId,
      providerOperationIntentId: ids.providerOperationIntentId,
      providerAccount: prepared.providerAccount,
      dispatchEnvelope: prepared.dispatchEnvelope,
      dispatchArtifact: artifact,
      // ArcPay accepts only a UUID Idempotency-Key. `paymentCommandId` is a stable UUID derived
      // from the authenticated HTTP idempotency key, so browser retries preserve both semantics
      // without leaking an arbitrary client header to the provider boundary.
      idempotencyKey: ids.paymentCommandId,
      idempotencyRetentionDeadline: new Date(
        this.options.clock.now().getTime() + idempotencyRetentionHours * 60 * 60 * 1000
      ).toISOString(),
      captureAuthority: prepared.captureAuthority,
      operationEnvelope: prepared.operationEnvelope
    });
    if (
      committed.checkoutPreparation.checkoutPreparationId !== ids.checkoutPreparationId ||
      committed.checkoutPreparation.state !== "checkout_requested"
    ) {
      throw new ClientCheckoutPreparationServiceError("artifact_registration_integrity");
    }
    return Object.freeze({
      checkoutPreparationId: ids.checkoutPreparationId,
      state: "checkout_requested"
    });
  }
}

function checkoutIds(clientUserId: string, orderId: string, idempotencyKey: string) {
  const seed = `${clientUserId}\u0000${orderId}\u0000${idempotencyKey}`;
  const uuid = (namespace: string) => deterministicUuid(`${namespace}\u0000${seed}`);
  const operation = uuid("provider-operation");
  return Object.freeze({
    checkoutPreparationId: uuid("checkout-preparation"),
    checkoutAuthorizationId: `client-checkout-authorization:${uuid("checkout-authorization")}`,
    paymentCommandId: uuid("payment-command"),
    economicPaymentIntentId: `client-order-intent:${uuid("economic-intent")}`,
    economicPaymentSessionId: `client-order-session:${uuid("economic-session")}`,
    providerOperationIntentId: operation,
  });
}

function providerRequestArtifactId(
  providerAccount: Readonly<{
    seriesId: string;
    providerAccountId: string;
    identityVersion: number;
  }>,
  digest: `sha256:${string}`
): string {
  const identity = `${providerAccount.seriesId}\u0000${providerAccount.providerAccountId}\u0000${providerAccount.identityVersion}\u0000${digest}`;
  return `provider-request:${createHash("sha256").update(identity, "utf8").digest("hex")}`;
}

function deterministicUuid(value: string): string {
  const bytes = Buffer.from(createHash("sha256").update(value, "utf8").digest().subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
