import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../finance-authorization/canonical-command-payload";
import { createProviderDispatchEnvelope } from "./provider-dispatch-envelope";
import { createFiscalChargeSnapshot, createFiscalProfile } from "./fiscal-profile";
import * as providerOperationRuntime from "./provider-operation-intent";
import {
  ProviderOperationIntentConflictError,
  ProviderOperationIntentIntegrityError,
  createProviderOperationIntent,
  createProviderOperationReplacementAuthority,
  decideProviderOperationRetry,
  planUnverifiedProviderOperationResult,
  type ProviderOperationIntent
} from "./provider-operation-intent";

const createdAt = "2026-08-03T09:00:00Z";
const retentionDeadline = "2026-08-06T09:00:00Z";
const evidenceDigest =
  "sha256:4a25f085f6ebdf6fa759f0eac85027d58a73004b7f3437e3386ca78d36a90264" as const;

describe("provider operation intent", () => {
  it("persists one immutable digest-bound dispatch envelope before provider I/O", () => {
    const result = createIntentResult();
    const intent = result.intent;
    const normalizedEnvelope = createProviderDispatchEnvelope(checkoutEnvelope());

    expect(intent).toEqual({
      intentId: "provider-operation-1",
      version: 0,
      providerAccount,
      providerAccountBinding,
      purpose: "client_order",
      operationKind: "checkout_session_create",
      source: clientOrderSource(),
      dispatchEnvelope: normalizedEnvelope,
      canonicalRequestDigest: hashFinanceCommandPayload(normalizedEnvelope),
      idempotencyKey: "finance:checkout:order-1",
      createdAt,
      idempotencyRetentionDeadline: retentionDeadline,
      status: "pending_dispatch",
      providerUnknownObservedAt: null,
      canonicalResult: null,
      predecessorIntentId: null,
      replacementAuthority: null
    });
    expect(result.nextSourceChainVersion).toBe(1);
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.providerAccount)).toBe(true);
    expect(Object.isFrozen(intent.providerAccountBinding)).toBe(true);
    expect(Object.isFrozen(intent.source)).toBe(true);
    expect(Object.isFrozen(intent.dispatchEnvelope)).toBe(true);
  });

  it("requires an explicit exact CAS source chain", () => {
    expect(() => createProviderOperationIntent(createIntentInput())).toThrow(
      ProviderOperationIntentIntegrityError
    );
    expect(() =>
      createProviderOperationIntent({
        ...createIntentCommand(),
        sourceChain: { source: clientOrderSource(), version: 1, intents: [] },
        expectedSourceChainVersion: 1
      })
    ).toThrow(ProviderOperationIntentIntegrityError);
    expect(() =>
      createProviderOperationIntent({
        ...createIntentCommand(),
        expectedSourceChainVersion: 1
      })
    ).toThrow(ProviderOperationIntentConflictError);
  });

  it.each([
    ["checkout_session_create", "client_order", checkoutEnvelope(), "session-1"],
    ["card_setup", "platform_card_setup", cardSetupEnvelope(), "session-setup-1"],
    [
      "card_setup_execute",
      "platform_card_setup",
      cardSetupExecuteEnvelope("2026-08-03T09:10:00Z"),
      "session-setup-1"
    ],
    [
      "card_setup_3ds_method_complete",
      "platform_card_setup",
      cardSetupThreeDsMethodEnvelope(),
      "session-setup-1"
    ],
    ["saved_card_charge", "platform_invoice", savedCardEnvelope(), "session-invoice-1"],
    [
      "saved_card_charge_3ds_method_complete",
      "platform_invoice",
      savedCardThreeDsMethodEnvelope(),
      "session-invoice-1"
    ],
    ["refund", "client_order", refundEnvelope(), null],
    ["void", "client_order", voidEnvelope(), null],
    ["void", "platform_invoice", voidEnvelope(), null]
  ] as const)(
    "accepts the exact %s/%s economic correlation",
    (operationKind, purpose, dispatchEnvelope, economicSessionId) => {
      const source = {
        kind: purpose,
        id: `${purpose}-source-1`,
        economicIntentId: `${purpose}-intent-1`,
        economicSessionId,
        providerAccount: providerAccountBinding
      };
      expect(createIntent({ operationKind, purpose, source, dispatchEnvelope })).toMatchObject({
        operationKind,
        purpose,
        source,
        dispatchEnvelope
      });
    }
  );

  it("requires a session for pay-in/setup dispatch and exact null for refund/void", () => {
    for (const operationKind of [
      "checkout_session_create",
      "card_setup",
      "card_setup_execute",
      "card_setup_3ds_method_complete",
      "saved_card_charge",
      "saved_card_charge_3ds_method_complete"
    ] as const) {
      const purpose =
        operationKind === "checkout_session_create"
          ? "client_order"
          : operationKind === "card_setup" || operationKind === "card_setup_execute" || operationKind === "card_setup_3ds_method_complete"
            ? "platform_card_setup"
            : "platform_invoice";
      const dispatchEnvelope =
        operationKind === "checkout_session_create"
          ? checkoutEnvelope()
          : operationKind === "card_setup"
            ? cardSetupEnvelope()
            : operationKind === "card_setup_execute"
              ? cardSetupExecuteEnvelope("2026-08-03T09:10:00Z")
              : operationKind === "card_setup_3ds_method_complete"
                ? cardSetupThreeDsMethodEnvelope()
              : operationKind === "saved_card_charge"
                ? savedCardEnvelope()
                : savedCardThreeDsMethodEnvelope();
      expect(() =>
        createIntent({
          operationKind,
          purpose,
          dispatchEnvelope,
          source: {
            kind: purpose,
            id: `${purpose}-source-1`,
            economicIntentId: `${purpose}-intent-1`,
            economicSessionId: null,
            providerAccount: providerAccountBinding
          }
        })
      ).toThrow(ProviderOperationIntentIntegrityError);
    }

    for (const [operationKind, purpose, dispatchEnvelope] of [
      ["refund", "client_order", refundEnvelope()],
      ["void", "client_order", voidEnvelope()],
      ["void", "platform_invoice", voidEnvelope()]
    ] as const) {
      expect(() =>
        createIntent({
          operationKind,
          purpose,
          dispatchEnvelope,
          source: {
            ...(purpose === "client_order" ? clientOrderSource() : platformInvoiceSource()),
            economicSessionId: "session-1"
          }
        })
      ).toThrow(ProviderOperationIntentIntegrityError);
    }
  });

  it("binds the exact restricted saved-card credential reference into the request digest", () => {
    const intent = createIntent({
      purpose: "platform_invoice",
      operationKind: "saved_card_charge",
      source: platformInvoiceSource(),
      dispatchEnvelope: savedCardEnvelope()
    });

    expect(intent.dispatchEnvelope).toEqual(savedCardEnvelope());
    expect(intent.canonicalRequestDigest).toBe(
      "sha256:7373ffe2703ccdf99ce6ee6c33b9faa38fe5dbfe63e2cbb842fd316db90c5a9e"
    );
    expect(() =>
      planUnverifiedProviderOperationResult({
        intent: { ...intent, dispatchEnvelope: savedCardEnvelope(4) },
        expectedVersion: 0,
        result: { kind: "provider_unknown", observedAt: "2026-08-03T09:01:00Z" }
      })
    ).toThrow(ProviderOperationIntentIntegrityError);
  });

  it("rejects a saved-card dispatch authorization bound to another logical credential", () => {
    const assertCredentialBinding = Reflect.get(
      providerOperationRuntime,
      "assertSavedCardCredentialAuthorizationBinding"
    ) as
      | undefined
      | ((envelope: unknown, credentialId: unknown, credentialVersion: unknown) => void);
    expect(typeof assertCredentialBinding).toBe("function");
    if (!assertCredentialBinding) throw new Error("credential binding assertion expected");

    expect(() =>
      assertCredentialBinding(savedCardEnvelope(), "saved-card-credential-1", 3)
    ).not.toThrow();
    for (const [credentialId, credentialVersion] of [
      ["saved-card-credential-other", 3],
      ["saved-card-credential-1", 4],
      ["saved-card-credential-1", 0]
    ] as const) {
      expect(() =>
        assertCredentialBinding(savedCardEnvelope(), credentialId, credentialVersion)
      ).toThrow(ProviderOperationIntentIntegrityError);
    }
  });

  it("rejects operation, purpose, source and dispatch-envelope drift", () => {
    for (const patch of [
      { purpose: "platform_invoice" },
      { source: { ...clientOrderSource(), kind: "platform_invoice" } },
      { operationKind: "saved_card_charge" },
      { dispatchEnvelope: savedCardEnvelope() },
      { operationKind: "capture" }
    ]) {
      expect(() => createIntent(patch)).toThrow(ProviderOperationIntentIntegrityError);
    }
  });

  it("rejects an economic intent/session correlation different from the resolved source chain", () => {
    for (const sourcePatch of [
      { economicIntentId: "economic-intent-other" },
      { economicSessionId: "session-other" },
      { providerAccount: { ...providerAccountBinding, seriesId: "arc-series-other" } }
    ]) {
      expect(() =>
        createProviderOperationIntent({
          ...createIntentCommand(),
          sourceChain: {
            source: { ...clientOrderSource(), ...sourcePatch },
            version: 0,
            intents: []
          }
        })
      ).toThrow(ProviderOperationIntentIntegrityError);
    }
  });

  it("binds full provider identity to the exact economic series/account/version tuple", () => {
    for (const bindingPatch of [
      { seriesId: "arc-series-other" },
      { providerAccountId: "arc-account-other" },
      { identityVersion: 2 }
    ]) {
      expect(() =>
        createIntent({
          providerAccountBinding: { ...providerAccountBinding, ...bindingPatch }
        })
      ).toThrow(ProviderOperationIntentIntegrityError);
    }

    expect(() =>
      createIntent({
        providerAccount: { ...providerAccount, providerAccountId: "arc-account-other" },
        providerAccountBinding: {
          ...providerAccountBinding,
          providerAccountId: "arc-account-other"
        }
      })
    ).toThrow(ProviderOperationIntentIntegrityError);
  });

  it("rejects raw request payloads and undeclared secret/split fields", () => {
    expect(() =>
      createIntent({
        request: { amountMinor: 10_000, currency: "RUB", cvv: "123" }
      })
    ).toThrow(ProviderOperationIntentIntegrityError);
    expect(() =>
      createIntent({
        dispatchEnvelope: { ...checkoutEnvelope(), split: [{ merchantId: "astrologer-1" }] }
      })
    ).toThrow(ProviderOperationIntentIntegrityError);
  });

  it("plans ambiguous provider outcomes without changing dispatch identity or authority", () => {
    const initial = createIntent();
    const plan = planUnverifiedProviderOperationResult({
      intent: initial,
      expectedVersion: 0,
      result: { kind: "provider_unknown", observedAt: "2026-08-03T09:01:00Z" }
    });

    expect(plan).toMatchObject({
      kind: "unverified_provider_operation_result_plan",
      authorityStatus: "unverified",
      currentIntent: initial,
      proposedResult: {
        nextVersion: 1,
        status: "provider_unknown"
      }
    });
    expect(plan).not.toHaveProperty("intent");
    expect(initial.status).toBe("pending_dispatch");
    expect(providerOperationRuntime).not.toHaveProperty("recordProviderOperationResult");
  });

  it("retries only the stored exact envelope and never accepts a caller-supplied replacement body", () => {
    const unknown = unknownIntent();
    const retry = decideProviderOperationRetry({
      intent: unknown,
      now: "2026-08-06T08:59:59.999999999Z",
      idempotencyKey: "finance:checkout:order-1"
    });

    expect(retry).toEqual({
      kind: "retry_same_operation",
      intentId: "provider-operation-1",
      expectedVersion: 1,
      providerAccountBinding,
      operationKind: "checkout_session_create",
      source: clientOrderSource(),
      dispatchEnvelope: createProviderDispatchEnvelope(checkoutEnvelope()),
      canonicalRequestDigest: hashFinanceCommandPayload(
        createProviderDispatchEnvelope(checkoutEnvelope())
      ),
      idempotencyKey: "finance:checkout:order-1"
    });
    expect(Object.isFrozen(retry)).toBe(true);
    if (retry.kind !== "retry_same_operation") throw new Error("retry expected");
    expect(Object.isFrozen(retry.dispatchEnvelope)).toBe(true);

    expect(() =>
      decideProviderOperationRetry({
        intent: unknown,
        now: "2026-08-03T10:00:00Z",
        idempotencyKey: "finance:checkout:order-1",
        dispatchEnvelope: { ...checkoutEnvelope(), externalId: "forged-attempt" }
      })
    ).toThrow(ProviderOperationIntentIntegrityError);
  });

  it("blocks retry at ArcPay's 72-hour idempotency retention deadline", () => {
    expect(
      decideProviderOperationRetry({
        intent: unknownIntent(),
        now: retentionDeadline,
        idempotencyKey: "finance:checkout:order-1"
      })
    ).toEqual({
      kind: "blocked_reconciliation_required",
      intentId: "provider-operation-1",
      reason: "idempotency_retention_expired"
    });
  });

  it("rejects an already-expired sealed setup secret and blocks retry at provider expiry", () => {
    const setupSource = {
      kind: "platform_card_setup" as const,
      id: "setup-1",
      economicIntentId: "economic-intent-setup-1",
      economicSessionId: "session-setup-1",
      providerAccount: providerAccountBinding
    };
    expect(() =>
      createIntent({
        purpose: "platform_card_setup",
        operationKind: "card_setup_execute",
        source: setupSource,
        dispatchEnvelope: cardSetupExecuteEnvelope("2026-08-03T08:59:59Z")
      })
    ).toThrow(ProviderOperationIntentIntegrityError);

    const initial = createIntent({
      purpose: "platform_card_setup",
      operationKind: "card_setup_execute",
      source: setupSource,
      dispatchEnvelope: cardSetupExecuteEnvelope("2026-08-03T09:10:00Z")
    });
    const unknown = persistedUnknownIntent(initial, "2026-08-03T09:01:00Z");
    expect(
      decideProviderOperationRetry({
        intent: unknown,
        now: "2026-08-03T09:10:00Z",
        idempotencyKey: initial.idempotencyKey
      })
    ).toEqual({
      kind: "blocked_reconciliation_required",
      intentId: initial.intentId,
      reason: "sealed_secret_expired"
    });
  });

  it("allows replacement only after canonical failure and binds the unchanged exact envelope", () => {
    const failed = definitiveFailure(createIntent(), "2026-08-03T09:02:00Z");
    const authority = createProviderOperationReplacementAuthority({
      predecessor: failed,
      candidateRequestDigest: failed.canonicalRequestDigest
    });
    const replacement = createIntent(
      {
        intentId: "provider-operation-2",
        idempotencyKey: "finance:checkout:order-1:replacement",
        createdAt: "2026-08-03T09:03:00Z",
        idempotencyRetentionDeadline: "2026-08-06T09:03:00Z"
      },
      [failed],
      { replacementAuthority: authority }
    );

    expect(replacement).toMatchObject({
      predecessorIntentId: failed.intentId,
      providerAccountBinding,
      dispatchEnvelope: failed.dispatchEnvelope
    });
    expect(() =>
      createIntent(
        {
          intentId: "provider-operation-3",
          idempotencyKey: "finance:checkout:order-1:changed",
          createdAt: "2026-08-03T09:03:00Z",
          idempotencyRetentionDeadline: "2026-08-06T09:03:00Z",
          dispatchEnvelope: { ...checkoutEnvelope(), externalId: "changed" }
        },
        [failed],
        { replacementAuthority: authority }
      )
    ).toThrow(ProviderOperationIntentConflictError);
  });

  it("rejects impossible terminal versions and replacement chronology on rehydration", () => {
    const failed = definitiveFailure(createIntent(), "2026-08-03T09:02:00Z");
    expect(() =>
      createProviderOperationReplacementAuthority({
        predecessor: { ...failed, version: 0 },
        candidateRequestDigest: failed.canonicalRequestDigest
      })
    ).toThrow(ProviderOperationIntentIntegrityError);

    const replacement = createIntent(
      {
        intentId: "provider-operation-2",
        idempotencyKey: "finance:checkout:order-1:replacement",
        createdAt: "2026-08-03T09:03:00Z",
        idempotencyRetentionDeadline: "2026-08-06T09:03:00Z"
      },
      [failed],
      {
        replacementAuthority: createProviderOperationReplacementAuthority({
          predecessor: failed,
          candidateRequestDigest: failed.canonicalRequestDigest
        })
      }
    );
    expect(() =>
      planUnverifiedProviderOperationResult({
        intent: {
          ...replacement,
          createdAt: "2026-08-03T09:01:00Z",
          idempotencyRetentionDeadline: "2026-08-06T09:01:00Z"
        },
        expectedVersion: 0,
        result: { kind: "provider_unknown", observedAt: "2026-08-03T09:04:00Z" }
      })
    ).toThrow(ProviderOperationIntentIntegrityError);
  });

  it("self-validates rehydrated envelope digest, source correlation and provider binding", () => {
    const intent = createIntent();
    for (const patch of [
      { canonicalRequestDigest: `sha256:${"c".repeat(64)}` },
      { dispatchEnvelope: { ...checkoutEnvelope(), externalId: "forged" } },
      { providerAccountBinding: { ...providerAccountBinding, seriesId: "arc-series-other" } }
    ]) {
      expect(() =>
        planUnverifiedProviderOperationResult({
          intent: { ...intent, ...patch },
          expectedVersion: 0,
          result: { kind: "provider_unknown", observedAt: "2026-08-03T09:01:00Z" }
        })
      ).toThrow(ProviderOperationIntentIntegrityError);
    }
  });

  it("plans a definitive operation outcome without granting terminal authority", () => {
    const unknown = unknownIntent();
    const plan = planUnverifiedProviderOperationResult({
      intent: unknown,
      expectedVersion: 1,
      result: {
        kind: "definitive_success",
        canonicalEvidence: {
          kind: "canonical_provider_read",
          reference: "provider-evidence-1",
          digest: evidenceDigest,
          observedAt: "2026-08-03T09:02:00Z"
        }
      }
    });
    expect(plan).toMatchObject({
      kind: "unverified_provider_operation_result_plan",
      authorityStatus: "unverified",
      currentIntent: unknown,
      proposedResult: {
        nextVersion: 2,
        status: "succeeded",
        canonicalResult: { outcome: "succeeded" }
      }
    });
    expect(unknown.status).toBe("provider_unknown");
    expect(() =>
      planUnverifiedProviderOperationResult({
        intent: unknownIntent(),
        expectedVersion: 0,
        result: {
          kind: "definitive_failure",
          canonicalEvidence: canonicalEvidence("2026-08-03T09:02:00Z")
        }
      })
    ).toThrow(ProviderOperationIntentConflictError);
  });

  it("rejects accessors, proxies and revoked proxies before invoking traps", () => {
    let getterCalls = 0;
    const accessor = { ...createIntentInput() };
    Object.defineProperty(accessor, "dispatchEnvelope", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return checkoutEnvelope();
      }
    });
    expect(() =>
      createProviderOperationIntent({
        ...createIntentCommand(),
        candidate: accessor
      })
    ).toThrow(ProviderOperationIntentIntegrityError);
    expect(getterCalls).toBe(0);

    let trapCalls = 0;
    const proxy = new Proxy(createIntentCommand(), {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Object.prototype;
      }
    });
    expect(() => createProviderOperationIntent(proxy)).toThrow(
      ProviderOperationIntentIntegrityError
    );
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable(createIntentCommand(), {});
    revoked.revoke();
    expect(() => createProviderOperationIntent(revoked.proxy)).toThrow(
      ProviderOperationIntentIntegrityError
    );
  });

  it("rejects missing, unknown, descriptor, symbol, prototype and container drift", () => {
    const command = createIntentCommand();
    const missing = { ...command };
    Reflect.deleteProperty(missing, "replacementAuthority");
    const nonEnumerable = { ...command };
    Object.defineProperty(nonEnumerable, "candidate", {
      enumerable: false,
      value: command.candidate
    });
    const polluted = { ...command };
    Object.defineProperty(polluted, "__proto__", {
      enumerable: true,
      value: { elevated: true }
    });

    for (const candidate of [
      missing,
      { ...command, extra: true },
      { ...command, [Symbol("secret")]: true },
      nonEnumerable,
      Object.assign(Object.create({ inherited: true }), command),
      Object.assign(Object.create(null), command),
      polluted,
      [],
      () => null
    ]) {
      expect(() => createProviderOperationIntent(candidate)).toThrow(
        ProviderOperationIntentIntegrityError
      );
    }
    expect(Object.prototype).not.toHaveProperty("elevated");
  });

  it("rejects nested provider-account and intent-array proxies without executing traps", () => {
    let trapCalls = 0;
    const providerAccountProxy = new Proxy(providerAccount, {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Object.prototype;
      }
    });
    expect(() =>
      createProviderOperationIntent(createIntentCommand({ providerAccount: providerAccountProxy }))
    ).toThrow(ProviderOperationIntentIntegrityError);
    expect(trapCalls).toBe(0);

    const intentsProxy = new Proxy([] as ProviderOperationIntent[], {
      ownKeys: () => {
        trapCalls += 1;
        return ["length"];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Array.prototype;
      }
    });
    expect(() =>
      createProviderOperationIntent(
        createIntentCommand({}, [], {
          sourceChain: { source: clientOrderSource(), version: 0, intents: intentsProxy }
        })
      )
    ).toThrow(ProviderOperationIntentIntegrityError);
    expect(trapCalls).toBe(0);
  });
});

const providerAccount = {
  providerAccountId: "arc-account-live-primary",
  identityVersion: 3,
  provider: "arc_pay",
  merchantTenantId: "elevenhouse-live",
  environment: "live",
  terminalScope: "primary-payins",
  settlementScope: "merchant-ledger-primary"
} as const;

const providerAccountBinding = {
  seriesId: "arc-series-primary",
  providerAccountId: "arc-account-live-primary",
  identityVersion: 3
} as const;

function clientOrderSource() {
  return {
    kind: "client_order" as const,
    id: "order-1",
    economicIntentId: "economic-intent-order-1",
    economicSessionId: "session-1",
    providerAccount: providerAccountBinding
  };
}

function platformInvoiceSource() {
  return {
    kind: "platform_invoice" as const,
    id: "platform-invoice-1",
    economicIntentId: "economic-intent-platform-invoice-1",
    economicSessionId: "session-invoice-1",
    providerAccount: providerAccountBinding
  };
}

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
    fiscalSnapshot: fiscalSnapshot("client_purchase", "order-1", 10_000)
  };
}

function cardSetupEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "create" as const,
    customerId: "customer-1",
    setupExternalId: "setup-1",
    successUrl: "https://astrologer.elevenhouse.test/billing/card-setup/success",
    failureUrl: "https://astrologer.elevenhouse.test/billing/card-setup/failure"
  };
}

function cardSetupExecuteEnvelope(providerExpiresAt: string) {
  return {
    kind: "card_setup" as const,
    step: "execute" as const,
    customerId: "customer-1",
    providerSetupId: "arc-setup-1",
    setupExternalId: "setup-1",
    tokenizationSecret: {
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: "vault://arc/tokenization/setup-1",
      providerExpiresAt,
      providerConsumption: "one_time" as const
    }
  };
}

function cardSetupThreeDsMethodEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "complete_3ds_method" as const,
    providerSetupId: "provider-setup-1",
    setupExternalId: "setup-1",
    customerActionId: "customer-action-1",
    completionIndicator: "Y" as const,
    threeDsMethodContextSecret: {
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: "vault://arc/three-ds-method/setup-1",
      providerExpiresAt: "2026-08-04T12:04:00Z",
      providerConsumption: "one_time" as const
    }
  };
}

function savedCardEnvelope(credentialVersion = 3) {
  return {
    kind: "saved_card_charge" as const,
    amount: { amountMinor: 1_990_00, currency: "RUB" as const },
    savedCardCredential: {
      kind: "restricted_saved_card_credential_ref" as const,
      schemaVersion: 1 as const,
      credentialId: "saved-card-credential-1",
      credentialVersion
    },
    externalId: "invoice-attempt-1",
    storedCredentialReason: "recurring" as const,
    recurringFrequencyDays: 31,
    fiscalSnapshot: fiscalSnapshot("platform_subscription", "platform-invoice-1", 199_000)
  };
}

function savedCardThreeDsMethodEnvelope() {
  return {
    kind: "saved_card_charge_3ds_method" as const,
    providerPaymentId: "provider-payment-1",
    invoiceId: "platform-invoice-1",
    customerActionId: "customer-action-1",
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
  sourceLineId: string,
  amountMinor: number
) {
  return createFiscalChargeSnapshot({
    profile: createFiscalProfile({
      profileSeriesId: `${transactionCategory}-fiscal-profile`,
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
        itemCode: "elevenhouse-service"
      }
    }),
    buyerContact: { kind: "email", value: "astrologer@example.com" },
    lines: [{ sourceLineId, name: "ElevenHouse service", amountMinor }]
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

function createIntent(
  overrides: Record<string, unknown> = {},
  intents: readonly ProviderOperationIntent[] = [],
  commandOverrides: Record<string, unknown> = {}
): ProviderOperationIntent {
  return createIntentResult(overrides, intents, commandOverrides).intent;
}

function createIntentResult(
  overrides: Record<string, unknown> = {},
  intents: readonly ProviderOperationIntent[] = [],
  commandOverrides: Record<string, unknown> = {}
) {
  return createProviderOperationIntent(createIntentCommand(overrides, intents, commandOverrides));
}

function createIntentCommand(
  candidateOverrides: Record<string, unknown> = {},
  intents: readonly ProviderOperationIntent[] = [],
  commandOverrides: Record<string, unknown> = {}
) {
  const candidate = { ...createIntentInput(), ...candidateOverrides };
  return {
    candidate,
    sourceChain: {
      source: candidate.source,
      version: intents.length,
      intents
    },
    expectedSourceChainVersion: intents.length,
    replacementAuthority: null,
    ...commandOverrides
  };
}

function createIntentInput() {
  return {
    intentId: "provider-operation-1",
    providerAccount,
    providerAccountBinding,
    purpose: "client_order",
    operationKind: "checkout_session_create",
    source: clientOrderSource(),
    dispatchEnvelope: checkoutEnvelope(),
    idempotencyKey: "finance:checkout:order-1",
    createdAt,
    idempotencyRetentionDeadline: retentionDeadline
  } as Record<string, unknown>;
}

function unknownIntent(): ProviderOperationIntent {
  return persistedUnknownIntent(createIntent(), "2026-08-03T09:01:00Z");
}

function definitiveFailure(intent: ProviderOperationIntent, observedAt: string) {
  return Object.freeze({
    ...intent,
    version: intent.version + 1,
    status: "failed" as const,
    canonicalResult: Object.freeze({
      outcome: "failed" as const,
      evidence: Object.freeze(canonicalEvidence(observedAt))
    })
  });
}

function persistedUnknownIntent(
  intent: ProviderOperationIntent,
  observedAt: string
): ProviderOperationIntent {
  return Object.freeze({
    ...intent,
    version: intent.version + 1,
    status: "provider_unknown",
    providerUnknownObservedAt: observedAt,
    canonicalResult: null
  });
}

function canonicalEvidence(observedAt: string) {
  return {
    kind: "canonical_provider_read" as const,
    reference: "provider-evidence-1",
    digest: evidenceDigest,
    observedAt
  };
}
