import { describe, expect, it } from "vitest";
import * as economicPaymentRuntime from "./economic-payment";
import {
  EconomicPaymentIntegrityError,
  advancePaymentClearing,
  createEconomicPaymentIntent,
  createPaymentClearingProjection,
  economicPaymentPurposeValues,
  economicPaymentStateValues,
  openEconomicPaymentSession,
  planUnverifiedCapture,
  planUnverifiedEconomicPaymentTransition,
  readUnverifiedStoredEconomicPaymentCaptureCandidate,
  type EconomicPaymentIntent,
  type PersistedVerifiedEconomicPaymentCaptureReceipt
} from "./economic-payment";

const providerAccount = () => ({
  seriesId: "arc-series-primary",
  providerAccountId: "arc-account-primary",
  identityVersion: 3
});

const orderIntentInput = () => ({
  intentId: "intent-order-1",
  version: 1,
  purpose: "client_order" as const,
  sourceId: "order-1",
  providerAccount: providerAccount(),
  amount: { amountMinor: 10_000, currency: "RUB" as const }
});

const orderCorrelation = () => ({
  intentId: "intent-order-1",
  purpose: "client_order" as const,
  sourceId: "order-1",
  providerAccount: providerAccount(),
  amount: { amountMinor: 10_000, currency: "RUB" as const }
});

describe("economic payment intent", () => {
  it("exposes only the approved purpose and state vocabularies", () => {
    expect(economicPaymentPurposeValues).toEqual([
      "client_order",
      "platform_invoice",
      "platform_card_setup"
    ]);
    expect(economicPaymentStateValues).toEqual([
      "created",
      "checkout_opened",
      "pending",
      "pending_3ds",
      "authorized",
      "captured",
      "declined",
      "failed",
      "expired",
      "voided",
      "timeout",
      "provider_unknown"
    ]);
  });

  it("requires an explicit unverified resolved source-set input", () => {
    expectEconomicError(
      () => createEconomicPaymentIntent(orderIntentInput(), undefined),
      "invalid_shape"
    );
    expectEconomicError(
      () =>
        createEconomicPaymentIntent(orderIntentInput(), {
          kind: "resolved_economic_payment_source_set_input",
          authorityStatus: "unverified",
          sourceId: "order-other",
          intents: []
        }),
      "economic_correlation_mismatch"
    );
    expectEconomicError(
      () =>
        createEconomicPaymentIntent(orderIntentInput(), {
          kind: "resolved_economic_payment_source_set_input",
          authorityStatus: "authoritative",
          sourceId: "order-1",
          intents: []
        }),
      "invalid_field"
    );
  });

  it("uses the resolved set as a fail-closed planning input without claiming DB authority", () => {
    const existing = createIntent();
    expectEconomicError(
      () => createIntent({ ...orderIntentInput(), intentId: "intent-order-2" }, [existing]),
      "source_intent_exists"
    );
    expectEconomicError(
      () => createIntent({ ...orderIntentInput(), sourceId: "order-2" }, [existing]),
      "intent_id_exists"
    );
  });

  it("binds intent, session and clearing to the exact provider-account series identity", () => {
    const intent = createIntent();
    const opened = openEconomicPaymentSession(intent, {
      expectedVersion: 1,
      sessionId: "checkout-1",
      correlation: orderCorrelation()
    });
    const clearing = createPaymentClearingProjection(intent);

    expect(intent.providerAccount).toEqual(providerAccount());
    expect(opened.sessions[0]?.providerAccount).toEqual(providerAccount());
    expect(clearing.providerAccount).toEqual(providerAccount());
    expect(Object.isFrozen(intent.providerAccount)).toBe(true);
    expect(Object.isFrozen(opened.sessions[0]?.providerAccount)).toBe(true);
    expect(Object.isFrozen(clearing.providerAccount)).toBe(true);

    for (const mismatch of [
      { ...providerAccount(), seriesId: "arc-series-other" },
      { ...providerAccount(), providerAccountId: "arc-account-other" },
      { ...providerAccount(), identityVersion: 2 }
    ]) {
      expectEconomicError(
        () =>
          openEconomicPaymentSession(intent, {
            expectedVersion: 1,
            sessionId: "checkout-other",
            correlation: { ...orderCorrelation(), providerAccount: mismatch }
          }),
        "economic_correlation_mismatch"
      );
    }
  });

  it("requires positive pay-in amounts and an exact zero setup amount", () => {
    expect(createIntent().amount.amountMinor).toBe(10_000);
    expect(
      createIntent({
        ...orderIntentInput(),
        intentId: "intent-setup-1",
        purpose: "platform_card_setup",
        sourceId: "setup-1",
        amount: { amountMinor: 0, currency: "RUB" }
      }).amount.amountMinor
    ).toBe(0);
    expectEconomicError(
      () => createIntent({ ...orderIntentInput(), amount: { amountMinor: 0, currency: "RUB" } }),
      "amount_invalid_for_purpose"
    );
    expectEconomicError(
      () =>
        createIntent({
          ...orderIntentInput(),
          amount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RUB" }
        }),
      "amount_invalid"
    );
  });

  it("opens a single immutable provider session under optimistic version and full correlation", () => {
    const intent = createIntent();
    const opened = openEconomicPaymentSession(intent, {
      expectedVersion: 1,
      sessionId: "checkout-1",
      correlation: orderCorrelation()
    });
    expect(opened).toMatchObject({ version: 2, state: "checkout_opened" });
    expect(Object.isFrozen(opened.sessions)).toBe(true);
    expect(intent.state).toBe("created");
    expectEconomicError(
      () =>
        openEconomicPaymentSession(opened, {
          expectedVersion: 2,
          sessionId: "checkout-2",
          correlation: orderCorrelation()
        }),
      "active_or_unknown_session_exists"
    );
    expectEconomicError(
      () =>
        openEconomicPaymentSession(intent, {
          expectedVersion: 0,
          sessionId: "checkout-1",
          correlation: orderCorrelation()
        }),
      "version_conflict"
    );
  });

  it("rejects accessors and undeclared fields without invoking them", () => {
    let getterCalls = 0;
    const hostile = { ...orderIntentInput() };
    Object.defineProperty(hostile, "amount", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return orderIntentInput().amount;
      }
    });
    expectEconomicError(() => createIntent(hostile), "invalid_shape");
    expect(getterCalls).toBe(0);

    expectEconomicError(
      () => createIntent({ ...orderIntentInput(), hidden: "field" }),
      "unknown_field"
    );
  });

  it("rejects proxies and revoked proxies before invoking reflective traps", () => {
    let trapCalls = 0;
    const proxy = new Proxy(orderIntentInput(), {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Object.prototype;
      }
    });
    expectEconomicError(
      () =>
        createEconomicPaymentIntent(proxy, {
          kind: "resolved_economic_payment_source_set_input",
          authorityStatus: "unverified",
          sourceId: "order-1",
          intents: []
        }),
      "invalid_shape"
    );
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable(orderIntentInput(), {});
    revoked.revoke();
    expectEconomicError(
      () =>
        createEconomicPaymentIntent(revoked.proxy, {
          kind: "resolved_economic_payment_source_set_input",
          authorityStatus: "unverified",
          sourceId: "order-1",
          intents: []
        }),
      "invalid_shape"
    );
  });

  it("rejects missing, descriptor, prototype and container drift with stable reasons", () => {
    const input = orderIntentInput();
    const missing = { ...input };
    Reflect.deleteProperty(missing, "amount");
    const nonEnumerable = { ...input };
    Object.defineProperty(nonEnumerable, "amount", {
      enumerable: false,
      value: input.amount
    });

    for (const candidate of [
      missing,
      nonEnumerable,
      Object.assign(Object.create({ inherited: true }), input),
      Object.assign(Object.create(null), input),
      [],
      () => null
    ]) {
      expectEconomicError(() => createIntentFromUnknown(candidate), "invalid_shape");
    }
  });

  it("rejects symbol, unknown and prototype-pollution keys with stable reasons", () => {
    const input = orderIntentInput();
    const polluted = { ...input };
    Object.defineProperty(polluted, "__proto__", {
      enumerable: true,
      value: { elevated: true }
    });

    for (const candidate of [
      { ...input, extra: true },
      { ...input, [Symbol("secret")]: true },
      polluted
    ]) {
      expectEconomicError(() => createIntentFromUnknown(candidate), "unknown_field");
    }
    expect(Object.prototype).not.toHaveProperty("elevated");
  });

  it("rejects nested money and resolved-set array proxies without executing traps", () => {
    let trapCalls = 0;
    const amountProxy = new Proxy(orderIntentInput().amount, {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Object.prototype;
      }
    });
    expectEconomicError(
      () => createIntent({ ...orderIntentInput(), amount: amountProxy }),
      "amount_invalid"
    );
    expect(trapCalls).toBe(0);

    const intentsProxy = new Proxy([] as EconomicPaymentIntent[], {
      ownKeys: () => {
        trapCalls += 1;
        return ["length"];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Array.prototype;
      }
    });
    expectEconomicError(
      () =>
        createEconomicPaymentIntent(orderIntentInput(), {
          kind: "resolved_economic_payment_source_set_input",
          authorityStatus: "unverified",
          sourceId: "order-1",
          intents: intentsProxy
        }),
      "invalid_shape"
    );
    expect(trapCalls).toBe(0);
  });
});

describe("unverified provider transition planning", () => {
  it("returns only an explicitly unverified proposal and never mutates the aggregate", () => {
    const opened = openIntent();
    const result = planUnverifiedEconomicPaymentTransition(opened, {
      expectedVersion: 2,
      observation: transitionObservation("authorized", "definitive")
    });

    expect(result).toEqual({
      kind: "unverified_economic_payment_transition_plan",
      authorityStatus: "unverified",
      currentIntent: opened,
      observation: transitionObservation("authorized", "definitive"),
      proposedTransition: {
        economicSessionId: "checkout-1",
        fromState: "checkout_opened",
        toState: "authorized",
        evidenceRef: "provider-observation-1"
      }
    });
    expect(result).not.toHaveProperty("intent");
    expect(opened.state).toBe("checkout_opened");
    expect(Object.isFrozen(result.proposedTransition)).toBe(true);
  });

  it("confines ambiguous observations to unknown states and capture to the capture planner", () => {
    const opened = openIntent();
    expect(
      planUnverifiedEconomicPaymentTransition(opened, {
        expectedVersion: 2,
        observation: transitionObservation("provider_unknown", "ambiguous")
      }).proposedTransition.toState
    ).toBe("provider_unknown");

    expectEconomicError(
      () =>
        planUnverifiedEconomicPaymentTransition(opened, {
          expectedVersion: 2,
          observation: transitionObservation("failed", "ambiguous")
        }),
      "definitive_terminal_evidence_required"
    );
    expectEconomicError(
      () =>
        planUnverifiedEconomicPaymentTransition(opened, {
          expectedVersion: 2,
          observation: transitionObservation("captured", "definitive")
        }),
      "state_transition_invalid"
    );
  });

  it("requires exact intent, session, amount and provider identity correlation", () => {
    const opened = openIntent();
    for (const patch of [
      { economicIntentId: "intent-other" },
      { economicSessionId: "checkout-other" },
      { amount: { amountMinor: 9_999, currency: "RUB" } },
      { providerAccount: { ...providerAccount(), seriesId: "arc-series-other" } },
      { providerAccount: { ...providerAccount(), providerAccountId: "arc-account-other" } },
      { providerAccount: { ...providerAccount(), identityVersion: 2 } }
    ]) {
      expectEconomicError(
        () =>
          planUnverifiedEconomicPaymentTransition(opened, {
            expectedVersion: 2,
            observation: { ...transitionObservation("authorized", "definitive"), ...patch }
          }),
        "economic_correlation_mismatch"
      );
    }
  });
});

describe("unverified capture planning", () => {
  it("cannot turn caller-declared provider fields into a captured aggregate or confirmed effect", () => {
    const opened = openIntent();
    const result = planUnverifiedCapture(opened, {
      expectedVersion: 2,
      providerFact: captureFact()
    });

    expect(result).toMatchObject({
      kind: "unverified_capture_plan",
      authorityStatus: "unverified",
      currentIntent: { state: "checkout_opened" },
      providerFact: { authorityStatus: "unverified", observedState: "captured" },
      proposedEffect: {
        kind: "proposed_client_sale_capture",
        confirmationStatus: "unverified_proposal",
        providerPaymentId: "arc-payment-1"
      }
    });
    expect(result).not.toHaveProperty("intent");
    expect(result).not.toHaveProperty("effect");
    expect(opened.state).toBe("checkout_opened");
    expect(Object.isFrozen(result.providerFact)).toBe(true);
    if (result.kind !== "unverified_capture_plan") throw new Error("capture plan expected");
    expect(Object.isFrozen(result.proposedEffect)).toBe(true);
  });

  it("requires exact provider identity, intent, session and amount correlation", () => {
    const opened = openIntent();
    for (const patch of [
      { economicIntentId: "intent-other" },
      { economicSessionId: "checkout-other" },
      { amount: { amountMinor: 9_999, currency: "RUB" } },
      { providerAccount: { ...providerAccount(), seriesId: "arc-series-other" } },
      { providerAccount: { ...providerAccount(), providerAccountId: "arc-account-other" } },
      { providerAccount: { ...providerAccount(), identityVersion: 2 } }
    ]) {
      expectEconomicError(
        () =>
          planUnverifiedCapture(opened, {
            expectedVersion: 2,
            providerFact: { ...captureFact(), ...patch }
          }),
        patch.economicSessionId ? "session_not_found" : "economic_correlation_mismatch"
      );
    }
  });

  it("keeps persisted capture authority nominal and exposes no self-issuing runtime hydrator", () => {
    const structuralReceipt = persistedVerifiedCaptureReceipt();

    // @ts-expect-error A structurally matching object is not persistence-issued authority.
    const forgedReceipt: PersistedVerifiedEconomicPaymentCaptureReceipt = structuralReceipt;

    expect(forgedReceipt.kind).toBe("verified_provider_capture_receipt");
    expect(economicPaymentRuntime).not.toHaveProperty(
      "hydratePersistedVerifiedEconomicPaymentCaptureReceipt"
    );
  });

  it("decodes stored capture snapshots only as explicitly unverified audit candidates", () => {
    const structuralReceipt = persistedVerifiedCaptureReceipt();
    const candidate = readUnverifiedStoredEconomicPaymentCaptureCandidate({
      intent: structuralReceipt.intent,
      effect: structuralReceipt.effect
    });

    expect(candidate).toMatchObject({
      kind: "unverified_stored_economic_payment_capture_candidate",
      authorityStatus: "unverified",
      intent: { state: "captured" },
      effect: { kind: "client_sale_captured" }
    });
    expect(candidate).not.toHaveProperty("receiptId");
  });
});

describe("payment clearing projection", () => {
  it("advances settlement, provider and bank evidence independently", () => {
    const payment = createIntent();
    const unmatched = createPaymentClearingProjection(payment);
    const settlement = advancePaymentClearing(unmatched, {
      expectedVersion: 1,
      nextState: "settlement_seen",
      evidenceId: "settlement-entry-1"
    });
    const providerMatched = advancePaymentClearing(settlement, {
      expectedVersion: 2,
      nextState: "provider_matched",
      evidenceId: "provider-match-1"
    });
    const bankMatched = advancePaymentClearing(providerMatched, {
      expectedVersion: 3,
      nextState: "bank_matched",
      evidenceId: "bank-row-1"
    });

    expect(bankMatched).toMatchObject({ version: 4, state: "bank_matched" });
    expect(bankMatched.evidenceIds).toEqual([
      "settlement-entry-1",
      "provider-match-1",
      "bank-row-1"
    ]);
    expect(payment.state).toBe("created");
  });

  it("rejects skipped and stale clearing transitions", () => {
    const unmatched = createPaymentClearingProjection(createIntent());
    expectEconomicError(
      () =>
        advancePaymentClearing(unmatched, {
          expectedVersion: 1,
          nextState: "provider_matched",
          evidenceId: "provider-match-1"
        }),
      "clearing_transition_invalid"
    );
    expectEconomicError(
      () =>
        advancePaymentClearing(unmatched, {
          expectedVersion: 0,
          nextState: "settlement_seen",
          evidenceId: "settlement-entry-1"
        }),
      "version_conflict"
    );
  });
});

function createIntent(
  input: Record<string, unknown> = orderIntentInput(),
  intents: readonly EconomicPaymentIntent[] = []
): EconomicPaymentIntent {
  return createEconomicPaymentIntent(input, {
    kind: "resolved_economic_payment_source_set_input",
    authorityStatus: "unverified",
    sourceId: input.sourceId,
    intents
  });
}

function createIntentFromUnknown(input: unknown): EconomicPaymentIntent {
  return createEconomicPaymentIntent(input, {
    kind: "resolved_economic_payment_source_set_input",
    authorityStatus: "unverified",
    sourceId: "order-1",
    intents: []
  });
}

function openIntent(): EconomicPaymentIntent {
  return openEconomicPaymentSession(createIntent(), {
    expectedVersion: 1,
    sessionId: "checkout-1",
    correlation: orderCorrelation()
  });
}

function transitionObservation(observedState: string, confidence: "ambiguous" | "definitive") {
  return {
    kind: "unverified_provider_payment_observation",
    authorityStatus: "unverified",
    confidence,
    economicIntentId: "intent-order-1",
    economicSessionId: "checkout-1",
    providerAccount: providerAccount(),
    observedState,
    evidenceRef: "provider-observation-1",
    amount: { amountMinor: 10_000, currency: "RUB" }
  };
}

function captureFact() {
  return {
    kind: "unverified_provider_payment_fact",
    authorityStatus: "unverified",
    observedState: "captured",
    economicIntentId: "intent-order-1",
    economicSessionId: "checkout-1",
    providerAccount: providerAccount(),
    providerPaymentId: "arc-payment-1",
    evidenceRef: "provider-read-1",
    amount: { amountMinor: 10_000, currency: "RUB" }
  };
}

function persistedVerifiedCaptureReceipt() {
  const opened = openIntent();
  const effect = {
    kind: "client_sale_captured" as const,
    intentId: opened.intentId,
    sourceId: opened.sourceId,
    providerAccount: opened.providerAccount,
    providerPaymentId: "arc-payment-1",
    amount: opened.amount,
    canonicalEvidenceId: "provider-read-1"
  };
  return {
    kind: "verified_provider_capture_receipt" as const,
    authorityStatus: "verified_persisted" as const,
    receiptId: "provider-read-1",
    intent: {
      ...opened,
      version: 3,
      state: "captured" as const,
      sessions: [
        {
          ...opened.sessions[0]!,
          state: "captured" as const,
          evidenceHistory: [
            {
              fromState: "checkout_opened" as const,
              toState: "captured" as const,
              kind: "canonical_provider_result" as const,
              evidenceId: "provider-read-1"
            }
          ]
        }
      ],
      capture: effect,
      captureSessionId: "checkout-1"
    },
    effect
  };
}

function expectEconomicError(operation: () => unknown, reason: string): void {
  try {
    operation();
    throw new Error("Expected economic-payment validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(EconomicPaymentIntegrityError);
    expect((error as EconomicPaymentIntegrityError).reason).toBe(reason);
  }
}
