import { describe, expect, it } from "vitest";
import {
  ProviderDispatchEnvelopeIntegrityError,
  createProviderDispatchEnvelope
} from "./provider-dispatch-envelope";
import { createFiscalChargeSnapshot, createFiscalProfile } from "./fiscal-profile";

describe("provider dispatch envelope", () => {
  it("creates an immutable exact hosted-checkout command for one-stage launch payments", () => {
    const envelope = createProviderDispatchEnvelope(checkoutEnvelope());

    expect(envelope).toEqual(checkoutEnvelope());
    expect(Object.isFrozen(envelope)).toBe(true);
    if (envelope.kind !== "checkout_session_create") throw new Error("checkout envelope expected");
    expect(Object.isFrozen(envelope.amount)).toBe(true);
    expect(Object.isFrozen(envelope.paymentMethods)).toBe(true);
    expect(Object.isFrozen(envelope.paymentMethods[0])).toBe(true);
  });

  it("accepts the closed launch mutation commands and no capture or split command", () => {
    for (const envelope of [
      cardSetupCreateEnvelope(),
      cardSetupExecuteEnvelope(),
      cardSetupThreeDsMethodEnvelope(),
      savedCardChargeEnvelope(),
      savedCardChargeThreeDsMethodEnvelope(),
      refundEnvelope(),
      voidEnvelope()
    ]) {
      expect(createProviderDispatchEnvelope(envelope)).toEqual(envelope);
    }

    for (const forbidden of [
      { ...checkoutEnvelope(), kind: "capture" },
      { ...checkoutEnvelope(), split: [{ merchantId: "astrologer-1", amountMinor: 9_000 }] },
      { ...savedCardChargeEnvelope(), subMerchantId: "astrologer-1" }
    ]) {
      expect(() => createProviderDispatchEnvelope(forbidden)).toThrow(
        ProviderDispatchEnvelopeIntegrityError
      );
    }
  });

  it("persists only one immutable restricted saved-card credential reference", () => {
    const envelope = createProviderDispatchEnvelope(savedCardChargeEnvelope());
    expect(envelope).toEqual(savedCardChargeEnvelope());
    if (envelope.kind !== "saved_card_charge") {
      throw new Error("saved-card charge envelope expected");
    }
    expect(envelope.savedCardCredential).toEqual({
      kind: "restricted_saved_card_credential_ref",
      schemaVersion: 1,
      credentialId: "saved-card-credential-1",
      credentialVersion: 3
    });
    expect(envelope).toMatchObject({
      storedCredentialReason: "recurring",
      recurringFrequencyDays: 31
    });
    expect(Object.isFrozen(envelope.savedCardCredential)).toBe(true);
    expect(envelope).not.toHaveProperty("customerId");
    expect(envelope).not.toHaveProperty("cardTokenId");

    for (const secretPatch of [
      { customerId: "arc-customer-1" },
      { cardTokenId: "arc-card-token-1" },
      { tokenValue: "arc-card-token-1" },
      { restrictedTokenHandleRef: "vault://arc/saved-cards/1" },
      { pan: "4111111111111111" },
      { cardNumber: "4111111111111111" },
      { cvv: "123" },
      { cvc: "123" },
      { encryptedCard: "invented-encrypted-card-payload" },
      { rawCardData: "raw-card-payload" },
      { rawTokenizationArtifact: "one-time-provider-secret" },
      { split: [{ merchantId: "astrologer-1" }] },
      { subMerchantId: "astrologer-1" }
    ]) {
      expect(() =>
        createProviderDispatchEnvelope({ ...savedCardChargeEnvelope(), ...secretPatch })
      ).toThrow(ProviderDispatchEnvelopeIntegrityError);
    }

    for (const credentialPatch of [
      { credentialVersion: 0 },
      { tokenValue: "arc-card-token-1" },
      { restrictedTokenHandleRef: "vault://arc/saved-cards/1" },
      { pan: "4111111111111111" },
      { cvv: "123" },
      { encryptedCard: "invented-encrypted-card-payload" }
    ]) {
      expect(() =>
        createProviderDispatchEnvelope({
          ...savedCardChargeEnvelope(),
          savedCardCredential: {
            ...savedCardChargeEnvelope().savedCardCredential,
            ...credentialPatch
          }
        })
      ).toThrow(ProviderDispatchEnvelopeIntegrityError);
    }
  });

  it("models execute tokenization only as a sealed short-lived provider one-time secret reference", () => {
    const execute = createProviderDispatchEnvelope(cardSetupExecuteEnvelope());
    if (execute.kind !== "card_setup" || execute.step !== "execute") {
      throw new Error("card setup execute envelope expected");
    }
    expect(execute.tokenizationSecret).toEqual({
      kind: "sealed_one_time_provider_secret_ref",
      secretRef: "vault://arc/tokenization/setup-1",
      providerExpiresAt: "2026-08-03T09:10:00Z",
      providerConsumption: "one_time"
    });
    expect(Object.isFrozen(execute.tokenizationSecret)).toBe(true);

    expect(() =>
      createProviderDispatchEnvelope({
        ...cardSetupExecuteEnvelope(),
        tokenizationSecret: {
          kind: "plaintext_tokenization_artifact",
          secretRef: "raw-secret",
          providerExpiresAt: "2026-08-03T09:10:00Z",
          providerConsumption: "one_time"
        }
      })
    ).toThrow(ProviderDispatchEnvelopeIntegrityError);
  });

  it("carries only the browser Method outcome into its next provider operation", () => {
    const envelope = createProviderDispatchEnvelope(cardSetupThreeDsMethodEnvelope());
    expect(envelope).toEqual(cardSetupThreeDsMethodEnvelope());
    expect(JSON.stringify(envelope)).not.toContain("three_ds_server_trans_id");
    expect(() => createProviderDispatchEnvelope({
      ...cardSetupThreeDsMethodEnvelope(),
      threeDsServerTransactionId: "browser-forged"
    })).toThrow(ProviderDispatchEnvelopeIntegrityError);
  });

  it("requires canonical HTTPS callbacks, RUB safe-integer money and unique documented methods", () => {
    for (const patch of [
      { successUrl: "http://client.elevenhouse.test/payments/success" },
      { successUrl: "https://client.elevenhouse.test/payments/../success" },
      { amount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RUB" } },
      { amount: { amountMinor: 10_000, currency: "USD" } },
      {
        paymentMethods: [
          { method: "bank_card", paymentMode: "redirect" },
          { method: "bank_card", paymentMode: "redirect" }
        ]
      }
    ]) {
      expect(() => createProviderDispatchEnvelope({ ...checkoutEnvelope(), ...patch })).toThrow(
        ProviderDispatchEnvelopeIntegrityError
      );
    }
  });

  it("binds fiscal profile category and exact fiscal total to the provider mutation", () => {
    for (const envelope of [
      {
        ...checkoutEnvelope(),
        fiscalSnapshot: fiscalSnapshot("platform_subscription", 10_000)
      },
      {
        ...checkoutEnvelope(),
        fiscalSnapshot: fiscalSnapshot("client_purchase", 9_999)
      },
      {
        ...savedCardChargeEnvelope(),
        fiscalSnapshot: fiscalSnapshot("client_purchase", 199_000)
      },
      {
        ...savedCardChargeEnvelope(),
        fiscalSnapshot: fiscalSnapshot("platform_subscription", 199_001)
      }
    ]) {
      expect(() => createProviderDispatchEnvelope(envelope)).toThrow(
        ProviderDispatchEnvelopeIntegrityError
      );
    }
  });

  it("requires the documented browser return URLs before creating a zero-amount card setup", () => {
    for (const patch of [
      { successUrl: "http://astrologer.elevenhouse.test/billing/card-setup/success" },
      { failureUrl: "https://astrologer.elevenhouse.test/billing/card-setup/../failure" }
    ]) {
      expect(() =>
        createProviderDispatchEnvelope({ ...cardSetupCreateEnvelope(), ...patch })
      ).toThrow(ProviderDispatchEnvelopeIntegrityError);
    }
  });

  it("rejects accessors, proxies and revoked proxies without invoking traps", () => {
    let getterCalls = 0;
    const accessor = { ...checkoutEnvelope() };
    Object.defineProperty(accessor, "externalId", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "payment-attempt-1";
      }
    });
    expect(() => createProviderDispatchEnvelope(accessor)).toThrow(
      ProviderDispatchEnvelopeIntegrityError
    );
    expect(getterCalls).toBe(0);

    let trapCalls = 0;
    const proxy = new Proxy(checkoutEnvelope(), {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Object.prototype;
      }
    });
    expect(() => createProviderDispatchEnvelope(proxy)).toThrow(
      ProviderDispatchEnvelopeIntegrityError
    );
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable(checkoutEnvelope(), {});
    revoked.revoke();
    expect(() => createProviderDispatchEnvelope(revoked.proxy)).toThrow(
      ProviderDispatchEnvelopeIntegrityError
    );
  });
});

function checkoutEnvelope() {
  return {
    kind: "checkout_session_create" as const,
    amount: { amountMinor: 10_000, currency: "RUB" as const },
    captureMode: "one_stage" as const,
    paymentMethods: [{ method: "bank_card" as const, paymentMode: "redirect" as const }],
    successUrl: "https://client.elevenhouse.test/payments/success",
    failureUrl: "https://client.elevenhouse.test/payments/failure",
    cancelUrl: "https://client.elevenhouse.test/payments/cancel",
    externalId: "payment-attempt-1",
    orderId: "order-1",
    fiscalSnapshot: fiscalSnapshot("client_purchase", 10_000)
  };
}

function cardSetupCreateEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "create" as const,
    customerId: "customer-1",
    setupExternalId: "card-setup-1",
    successUrl: "https://astrologer.elevenhouse.test/billing/card-setup/success",
    failureUrl: "https://astrologer.elevenhouse.test/billing/card-setup/failure"
  };
}

function cardSetupExecuteEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "execute" as const,
    customerId: "customer-1",
    providerSetupId: "arc-card-setup-1",
    setupExternalId: "card-setup-1",
    tokenizationSecret: {
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: "vault://arc/tokenization/setup-1",
      providerExpiresAt: "2026-08-03T09:10:00Z",
      providerConsumption: "one_time" as const
    }
  };
}

function cardSetupThreeDsMethodEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "complete_3ds_method" as const,
    providerSetupId: "arc-card-setup-1",
    setupExternalId: "card-setup-1",
    customerActionId: "action-1",
    completionIndicator: "Y" as const,
    threeDsMethodContextSecret: {
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: "vault://arc/three-ds-method/card-setup-1",
      providerExpiresAt: "2026-08-04T12:04:00Z",
      providerConsumption: "one_time" as const
    }
  };
}

function savedCardChargeEnvelope() {
  return {
    kind: "saved_card_charge" as const,
    amount: { amountMinor: 1_990_00, currency: "RUB" as const },
    savedCardCredential: {
      kind: "restricted_saved_card_credential_ref" as const,
      schemaVersion: 1 as const,
      credentialId: "saved-card-credential-1",
      credentialVersion: 3
    },
    externalId: "invoice-attempt-1",
    storedCredentialReason: "recurring" as const,
    recurringFrequencyDays: 31,
    fiscalSnapshot: fiscalSnapshot("platform_subscription", 199_000)
  };
}

function savedCardChargeThreeDsMethodEnvelope() {
  return {
    kind: "saved_card_charge_3ds_method" as const,
    providerPaymentId: "11111111-1111-4111-8111-111111111111",
    invoiceId: "invoice-1",
    customerActionId: "22222222-2222-4222-8222-222222222222",
    completionIndicator: "Y" as const,
    threeDsMethodContextSecret: {
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: "vault://arc/three-ds-method/invoice-1",
      providerExpiresAt: "2026-08-04T12:04:00Z",
      providerConsumption: "one_time" as const
    }
  };
}

function fiscalSnapshot(
  transactionCategory: "client_purchase" | "platform_subscription",
  amountMinor: number
) {
  return createFiscalChargeSnapshot({
    profile: createFiscalProfile({
      profileSeriesId: `${transactionCategory}-fiscal`,
      version: 1,
      transactionCategory,
      currency: "RUB",
      fiscalizationProvider: "arc_pay_embedded",
      merchantTaxId: "7701234567",
      buyerContactRequirement: "email_or_phone",
      lineTemplate: {
        vatRate: "no_vat",
        paymentObject: "service",
        paymentMethod: "full_payment",
        measure: "piece",
        itemCode: transactionCategory === "client_purchase" ? "astrology-service" : "platform-plan"
      }
    }),
    buyerContact: { kind: "email", value: "client@example.com" },
    lines: [{ sourceLineId: "order-1", name: "Astrology service", amountMinor }]
  });
}

function refundEnvelope() {
  return {
    kind: "refund" as const,
    providerPaymentId: "arc-payment-1",
    amount: { amountMinor: 5_000, currency: "RUB" as const },
    externalId: "refund-1"
  };
}

function voidEnvelope() {
  return {
    kind: "void" as const,
    providerPaymentId: "arc-payment-1",
    externalId: "void-1"
  };
}
