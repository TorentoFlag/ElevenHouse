import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import type {
  ClientOrderCheckoutCommandFactory,
  ClientOrderCheckoutPreparationUnitOfWork,
  FinancePrivateObjectStoragePort
} from "@elevenhouse/domain/finance-core";
import type { FinanceOrder } from "@elevenhouse/domain";

import { ClientCheckoutPreparationService } from "./client-checkout-preparation.service";

const order = {
  id: "11111111-1111-4111-8111-111111111111", clientUserId: "22222222-2222-4222-8222-222222222222",
  astrologerUserId: "33333333-3333-4333-8333-333333333333", productId: "44444444-4444-4444-8444-444444444444",
  productTitleSnapshot: "Natal reading", directLinkIntentId: null, bookingId: null, status: "pending_payment",
  grossAmount: { amountMinor: 50_000, currency: "RUB" }, platformFee: { amountMinor: 5_000, currency: "RUB" }, astrologerNetAmount: { amountMinor: 45_000, currency: "RUB" },
  financePolicySnapshotId: "55555555-5555-4555-8555-555555555555", financePolicyRiskTier: "standard", financePolicyHoldDurationHours: 48,
  financePolicyReserveBps: 0, financePolicyReserveReleaseDelayDays: 0, tariffSeriesId: "pro", tariffVersion: 1,
  tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", tariffCommissionBps: 1000,
  financePolicyProviderSettlementRequired: true, createdAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:00.000Z"
} satisfies FinanceOrder;

describe("ClientCheckoutPreparationService", () => {
  it("seals and registers the exact canonical request before committing one idempotent checkout preparation", async () => {
    const calls: { command?: unknown } = {};
    const factory = {
      prepare: vi.fn(async () => ({
        providerAccount: { seriesId: "arcpay-sandbox", providerAccountId: "merchant", identityVersion: 1 },
        operationEnvelope: { kind: "resolved_finance_operation_envelope", policyId: "limits", policyVersion: 1, policyDigest: digest("limits"), maximumRows: 100, maximumDecimalDigits: 38, maximumArtifactBytes: 2_097_152 },
        dispatchEnvelope: { kind: "checkout_session_create", amount: order.grossAmount, captureMode: "one_stage", paymentMethods: [{ method: "bank_card", paymentMode: "redirect" }], successUrl: "https://client.elevenhouse.test/success", failureUrl: "https://client.elevenhouse.test/failure", cancelUrl: "https://client.elevenhouse.test/cancel", externalId: "eh-checkout-1", orderId: order.id, fiscalSnapshot: {} }
      }))
    } as unknown as ClientOrderCheckoutCommandFactory;
    const storage = {
      writeImmutable: vi.fn(async (input) => ({ privateObjectKey: `finance/${input.artifactId}`, privateObjectVersion: "v1", envelopeKeyVersion: "kms-v1", sha256Digest: input.expectedSha256Digest, byteLength: input.bytes.byteLength, contentType: input.contentType }))
    } satisfies Pick<FinancePrivateObjectStoragePort, "writeImmutable">;
    const registry = {
      registerSealedArtifact: vi.fn(async (input) => input.artifact)
    } satisfies Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
    const uow = {
      prepareClientOrderCheckout: vi.fn(async (command) => {
        calls.command = command;
        return { kind: "client_order_checkout_preparation_receipt" as const, checkoutPreparation: { checkoutPreparationId: command.checkoutPreparationId, state: "checkout_requested" }, providerDispatch: {} };
      })
    } as unknown as ClientOrderCheckoutPreparationUnitOfWork;
    const service = new ClientCheckoutPreparationService(factory, storage, registry, uow, {
      paymentMethods: [{ method: "bank_card", paymentMode: "redirect" }],
      requestArtifactRetention: { policyId: "provider-request", policyVersion: "1" }, clock: { now: () => new Date("2026-08-04T10:00:00.000Z") }
    });

    const input = { order, clientUserId: order.clientUserId, idempotencyKey: "checkout-key-0001", request: { orderId: order.id, buyerContact: { kind: "email" as const, value: "client@example.test" }, successUrl: "https://client.elevenhouse.test/success", failureUrl: "https://client.elevenhouse.test/failure", cancelUrl: "https://client.elevenhouse.test/cancel" } };
    const first = await service.accept(input);
    const second = await service.accept(input);

    expect(first).toEqual(second);
    expect(storage.writeImmutable).toHaveBeenCalledBefore(registry.registerSealedArtifact as never);
    expect(registry.registerSealedArtifact).toHaveBeenCalledBefore(uow.prepareClientOrderCheckout as never);
    expect(calls.command).toMatchObject({
      checkoutPreparationId: first.checkoutPreparationId,
      idempotencyRetentionDeadline: "2026-08-07T10:00:00.000Z"
    });
    expect((calls.command as { idempotencyKey: string }).idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect((calls.command as { idempotencyKey: string }).idempotencyKey).not.toBe(
      input.idempotencyKey
    );
  });
});

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
