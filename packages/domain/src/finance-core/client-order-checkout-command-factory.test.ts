import { describe, expect, it, vi } from "vitest";

import {
  ClientOrderCheckoutCommandFactoryError,
  createClientOrderCheckoutCommandFactory,
  createFiscalProfile,
  createFinanceOperationResourcePolicyDraft,
  publishFinanceOperationResourcePolicyDraft
} from "./index";
import type { FinanceOrder } from "../orders";

const order: FinanceOrder = {
  id: "order-1",
  clientUserId: "client-1",
  astrologerUserId: "astrologer-1",
  productId: "product-1",
  productTitleSnapshot: "Natal reading",
  directLinkIntentId: null,
  bookingId: null,
  status: "pending_payment",
  grossAmount: { amountMinor: 50_000, currency: "RUB" },
  platformFee: { amountMinor: 5_000, currency: "RUB" },
  astrologerNetAmount: { amountMinor: 45_000, currency: "RUB" },
  financePolicySnapshotId: "policy-1",
  financePolicyRiskTier: "standard",
  financePolicyHoldDurationHours: 48,
  financePolicyReserveBps: 0,
  financePolicyReserveReleaseDelayDays: 0,
  tariffSeriesId: "pro",
  tariffVersion: 1,
  tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  tariffCommissionBps: 1000,
  financePolicyProviderSettlementRequired: true,
  createdAt: "2026-08-04T10:00:00.000Z",
  updatedAt: "2026-08-04T10:00:00.000Z"
};

describe("client order checkout command factory", () => {
  it("binds fiscal, provider identity and safety envelope before a checkout can be persisted", async () => {
    const dependencies = dependenciesFor();
    const factory = createClientOrderCheckoutCommandFactory(dependencies);

    const result = await factory.prepare({
      order,
      clientUserId: "client-1",
      buyerContact: { kind: "email", value: "client@example.test" },
      paymentMethods: [{ method: "bank_card", paymentMode: "redirect" }],
      successUrl: "https://client.elevenhouse.test/payments/success",
      failureUrl: "https://client.elevenhouse.test/payments/failure",
      cancelUrl: "https://client.elevenhouse.test/payments/cancel"
    });

    expect(result.providerAccount).toEqual({
      seriesId: "arcpay-sandbox",
      providerAccountId: "merchant-sandbox",
      identityVersion: 1
    });
    expect(result.operationEnvelope).toMatchObject({ policyId: "checkout-limits" });
    expect(result.captureAuthority).toMatchObject({
      riskPolicy: { policyId: "policy-1", policyVersion: 1 },
      fulfillmentDecision: { registryKey: "single.once.live.solo", registryRevision: 1 }
    });
    expect(result.dispatchEnvelope).toMatchObject({
      kind: "checkout_session_create",
      captureMode: "one_stage",
      orderId: "order-1",
      externalId: "order-1",
      amount: { amountMinor: 50_000, currency: "RUB" },
      fiscalSnapshot: { lines: [{ name: "Natal reading", amountMinor: 50_000 }] }
    });
  });

  it("keeps a booking-bound client order on the existing hosted-checkout authority", async () => {
    const bookingOrder: FinanceOrder = { ...order, bookingId: "booking-1" };
    const result = await createClientOrderCheckoutCommandFactory(dependenciesFor()).prepare({
      order: bookingOrder,
      clientUserId: "client-1",
      buyerContact: { kind: "email", value: "client@example.test" },
      paymentMethods: [{ method: "bank_card", paymentMode: "redirect" }],
      successUrl: "https://client.elevenhouse.test/payments/success",
      failureUrl: "https://client.elevenhouse.test/payments/failure",
      cancelUrl: "https://client.elevenhouse.test/payments/cancel"
    });

    expect(result.dispatchEnvelope).toMatchObject({
      kind: "checkout_session_create",
      captureMode: "one_stage",
      orderId: bookingOrder.id,
      externalId: bookingOrder.id
    });
    expect(result.captureAuthority.fulfillmentDecision).toMatchObject({
      registryKey: "single.once.live.solo",
      registryRevision: 1
    });
  });

  it("fails before provider persistence if verified contact or published resource policy is unavailable", async () => {
    const dependencies = dependenciesFor({ contact: null });
    const factory = createClientOrderCheckoutCommandFactory(dependencies);
    await expect(factory.prepare(input())).rejects.toMatchObject({
      reason: "buyer_contact_unverified"
    });

    const noPolicy = createClientOrderCheckoutCommandFactory(dependenciesFor({ policy: null }));
    await expect(noPolicy.prepare(input())).rejects.toMatchObject({
      reason: "operation_policy_missing"
    });

    const noCaptureAuthority = createClientOrderCheckoutCommandFactory(
      dependenciesFor({ captureAuthority: null })
    );
    await expect(noCaptureAuthority.prepare(input())).rejects.toMatchObject({
      reason: "capture_authority_missing"
    });
    expect(() => {
      throw new ClientOrderCheckoutCommandFactoryError("order_not_payable");
    }).toThrow(ClientOrderCheckoutCommandFactoryError);
  });

  it("does not relabel an authoritative reader failure as a missing fiscal profile", async () => {
    const dependencies = dependenciesFor();
    const databaseFailure = new Error("database unavailable");
    dependencies.fiscalProfiles.findPublishedProfile.mockRejectedValue(databaseFailure);

    await expect(
      createClientOrderCheckoutCommandFactory(dependencies).prepare(input())
    ).rejects.toBe(databaseFailure);
  });

  it("prepares an ordinary checkout without a fiscal profile", async () => {
    const dependencies = dependenciesFor({ contact: null });
    dependencies.fiscalProfiles.findPublishedProfile.mockResolvedValueOnce(null);

    const result = await createClientOrderCheckoutCommandFactory(dependencies).prepare(input());

    expect(result.dispatchEnvelope).toMatchObject({
      kind: "checkout_session_create",
      orderId: order.id,
      fiscalSnapshot: null
    });
    expect(dependencies.buyerContacts.findVerifiedFiscalBuyerContact).not.toHaveBeenCalled();
  });
});

function input() {
  return {
    order,
    clientUserId: "client-1",
    buyerContact: { kind: "email" as const, value: "client@example.test" },
    paymentMethods: [{ method: "bank_card" as const, paymentMode: "redirect" as const }],
    successUrl: "https://client.elevenhouse.test/payments/success",
    failureUrl: "https://client.elevenhouse.test/payments/failure",
    cancelUrl: "https://client.elevenhouse.test/payments/cancel"
  };
}

function dependenciesFor(
  options: {
    contact?: { kind: "email"; value: string } | null;
    policy?: unknown;
    captureAuthority?: unknown;
  } = {}
) {
  const profile = createFiscalProfile({
    profileSeriesId: "client-sale-fiscal",
    version: 1,
    transactionCategory: "client_purchase",
    currency: "RUB",
    fiscalizationProvider: "arc_pay_embedded",
    merchantTaxId: "7701234567",
    buyerContactRequirement: "email_or_phone",
    lineTemplate: {
      vatRate: "no_vat",
      paymentObject: "service",
      paymentMethod: "full_payment",
      measure: "piece",
      itemCode: "astrology-service"
    }
  });
  const policy = publishFinanceOperationResourcePolicyDraft(
    createFinanceOperationResourcePolicyDraft({
      policyId: "checkout-limits",
      version: 1,
      operationKind: "client_checkout_prepare",
      maximumRows: 100,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2_097_152
    })
  );
  return {
    providerAccounts: {
      findActiveProviderAccount: vi.fn(async () => ({
        seriesId: "arcpay-sandbox",
        providerAccountId: "merchant-sandbox",
        identityVersion: 1
      }))
    },
    fiscalProfiles: {
      findPublishedProfile: vi.fn(async (): Promise<typeof profile | null> => profile)
    },
    buyerContacts: {
      findVerifiedFiscalBuyerContact: vi.fn(async () =>
        options.contact === undefined
          ? { kind: "email" as const, value: "client@example.test" }
          : options.contact
      )
    },
    operationPolicies: {
      findPublishedForOperation: vi.fn(async () => (options.policy === null ? null : policy))
    },
    captureAuthorities: {
      findForCheckout: vi.fn(async () =>
        options.captureAuthority === null
          ? null
          : ({
              riskPolicy: {
                policyId: "policy-1",
                policyVersion: 1,
                canonicalDigest:
                  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
              },
              fulfillmentDecision: {
                registryKey: "single.once.live.solo",
                registryRevision: 1,
                canonicalDigest:
                  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
              }
            } as const)
      )
    }
  };
}
