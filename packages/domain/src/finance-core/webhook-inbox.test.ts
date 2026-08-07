import { describe, expect, it } from "vitest";
import {
  WebhookInboxIntegrityError,
  WebhookInboxVersionConflictError,
  advanceWebhookInboxCheckpoint,
  beginWebhookInboxProcessingAttempt,
  decideWebhookAcknowledgement,
  decideWebhookProcessing,
  decideWebhookTransportDedupe,
  prepareWebhookIngress,
  recordWebhookInboxProcessingFailure,
  resumeWebhookInboxProcessing
} from "./webhook-inbox";

const rawBodyDigest = "sha256:0f6e103fa10d7f5f7e6a91799a918913c9065185cae8e1277c4aa7a174884e8f";
// ArcPay OpenAPI v1.0.0 webhook-event/refund/chargeback schemas, fetched 2026-08-03:
// https://api.arcpay.space/openapi.json; SHA-256 324c994d8e53236cdff1d221f90fabfde9a2d54ef71df7f67aa4948676e930ff.

describe("durable webhook ingress", () => {
  it("projects a valid signed envelope into safe metadata that must be stored before ack", () => {
    const ingress = validIngress();

    expect(ingress).toEqual({
      kind: "store_before_acknowledgement",
      item: {
        transportIdentity: {
          provider: "arc_pay",
          webhookId: "arc-webhook-1"
        },
        providerEventType: "payment.captured",
        rawBodyDigest,
        sealedPayloadRef: "sealed-webhooks/2026/08/arc-webhook-1",
        receivedAt: "2026-08-03T10:00:00Z",
        version: 0,
        processingStatus: "stored",
        processingAttempts: 0,
        lastErrorClass: null,
        lastCommittedCheckpoint: null
      }
    });
    if (ingress.kind !== "store_before_acknowledgement") {
      throw new Error("Expected a storage-gated ingress decision");
    }
    expect(Object.isFrozen(ingress.item)).toBe(true);
    expect(Object.isFrozen(ingress.item.transportIdentity)).toBe(true);
  });

  it.each([
    [{ envelope: "bounded", signature: "invalid", timestamp: "valid" }, 401, "invalid_signature"],
    [{ envelope: "bounded", signature: "valid", timestamp: "invalid" }, 401, "invalid_timestamp"],
    [{ envelope: "malformed", signature: "valid", timestamp: "valid" }, 400, "malformed_envelope"],
    [{ envelope: "oversized", signature: "valid", timestamp: "valid" }, 413, "oversized_envelope"]
  ] as const)("rejects %s before storage", (transportValidation, statusCode, reason) => {
    expect(validIngress({ transportValidation })).toEqual({
      kind: "reject_before_storage",
      statusCode,
      reason
    });
  });

  it("returns 2xx only after durable storage and returns retryable 5xx on storage failure", () => {
    const ingress = validIngress();

    expect(
      decideWebhookAcknowledgement({
        ingress,
        storageOutcome: { kind: "durably_stored", transportDisposition: "created" }
      })
    ).toEqual({ kind: "acknowledge", statusCode: 204, transportDisposition: "created" });
    expect(
      decideWebhookAcknowledgement({
        ingress,
        storageOutcome: { kind: "storage_failed" }
      })
    ).toEqual({ kind: "retryable_storage_failure", statusCode: 503 });
  });

  it("does not turn a pre-storage rejection into an acknowledgement", () => {
    const ingress = validIngress({
      transportValidation: { envelope: "bounded", signature: "invalid", timestamp: "valid" }
    });

    expect(
      decideWebhookAcknowledgement({
        ingress,
        storageOutcome: { kind: "durably_stored", transportDisposition: "created" }
      })
    ).toEqual({ kind: "reject_before_storage", statusCode: 401, reason: "invalid_signature" });
  });

  it("rejects undeclared ingress fields and accessors without reading them", () => {
    expect(() => validIngress({ rawBody: "must-not-leak" })).toThrow(WebhookInboxIntegrityError);

    let getterCalls = 0;
    const input = validIngressInput();
    Object.defineProperty(input, "webhookId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("getter must not execute");
      }
    });
    expect(() => prepareWebhookIngress(input)).toThrow(WebhookInboxIntegrityError);
    expect(getterCalls).toBe(0);
  });

  it("rejects live and revoked proxies with fresh typed errors without executing traps", () => {
    let trapCalls = 0;
    const forgedError = new WebhookInboxIntegrityError();
    const proxied = new Proxy(validIngressInput(), {
      ownKeys() {
        trapCalls += 1;
        throw forgedError;
      }
    });
    let caught: unknown;
    try {
      prepareWebhookIngress(proxied);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WebhookInboxIntegrityError);
    expect(caught).not.toBe(forgedError);
    expect((caught as Error).message).toBe("Webhook inbox integrity check failed");
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable(validIngressInput(), {});
    revoked.revoke();
    expect(() => prepareWebhookIngress(revoked.proxy)).toThrow(WebhookInboxIntegrityError);
  });
});

describe("webhook dedupe and canonical semantic processing", () => {
  it("distinguishes a transport replay from a semantic source replay", () => {
    const first = validItem();
    expect(decideWebhookTransportDedupe({ existing: first, incoming: first })).toEqual({
      kind: "resume_existing",
      item: first
    });

    const secondTransport = validItem({
      transportIdentity: {
        provider: "arc_pay",
        webhookId: "arc-webhook-2"
      }
    });
    expect(decideWebhookTransportDedupe({ existing: null, incoming: secondTransport })).toEqual({
      kind: "store_new",
      item: secondTransport
    });

    const active = beginWebhookInboxProcessingAttempt({
      item: secondTransport,
      expectedVersion: 0
    });
    expect(
      decideWebhookProcessing({
        item: active,
        expectedFacts,
        observedFacts,
        committedSemanticRecords: [semanticRecord]
      })
    ).toEqual({
      kind: "semantic_replay",
      semanticRecord,
      businessEffect: null
    });
  });

  it("quarantines a reused transport identity with a different body digest", () => {
    const existing = validItem();
    const incoming = validItem({
      rawBodyDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });

    expect(decideWebhookTransportDedupe({ existing, incoming })).toEqual({
      kind: "quarantine_transport_conflict",
      reason: "transport_identity_body_mismatch",
      businessEffect: null
    });
  });

  it("records a validly signed unknown event losslessly and derives quarantine from the pinned catalog", () => {
    const item = activeItem({ providerEventType: "provider.future_event.v9" });

    expect(
      decideWebhookProcessing({
        item,
        expectedFacts: null,
        observedFacts: null,
        committedSemanticRecords: []
      })
    ).toEqual({
      kind: "quarantine",
      reason: "unknown_provider_event_type",
      providerEventType: "provider.future_event.v9",
      businessEffect: null
    });
  });

  it.each([
    ["provider", { provider: "another-provider" }],
    ["provider_account", { providerAccountId: "arc-account-other" }],
    ["tenant", { merchantTenantId: "wrong-tenant" }],
    ["environment", { livemode: false }],
    ["payment", { providerPaymentId: "arc-payment-other" }],
    ["source", { logicalSource: { kind: "order", id: "order-other" } }],
    ["amount", { amount: { amountMinor: 20_000, currency: "RUB" } }],
    ["currency", { amount: { amountMinor: 10_000, currency: "USD" } }]
  ] as const)("computes a %s mismatch instead of trusting a caller boolean", (mismatch, patch) => {
    expect(
      decideWebhookProcessing({
        item: activeItem(),
        expectedFacts,
        observedFacts: { ...observedFacts, ...patch },
        committedSemanticRecords: []
      })
    ).toEqual({
      kind: "quarantine",
      reason: "semantic_correlation_mismatch",
      mismatches: [mismatch],
      businessEffect: null
    });
  });

  it("does not select or persist an ArcPay key environment when correlating a webhook", () => {
    const decision = decideWebhookProcessing({
      item: activeItem(),
      expectedFacts,
      observedFacts: { ...observedFacts, environment: "sandbox", livemode: false },
      committedSemanticRecords: []
    });

    expect(decision.kind).toBe("apply_once");
  });

  it.each([
    ["client_order", "post_client_sale_payable"],
    ["platform_invoice", "record_platform_invoice_capture"],
    ["platform_card_setup", "activate_saved_card_credential"]
  ] as const)(
    "derives the %s capture effect from event type, source kind and purpose",
    (purpose, businessEffect) => {
      const logicalSource = {
        kind: purpose === "client_order" ? "order" : purpose,
        id:
          purpose === "client_order"
            ? "order-1"
            : purpose === "platform_invoice"
              ? "invoice-1"
              : "card-setup-1"
      };
      const amount =
        purpose === "platform_card_setup"
          ? { amountMinor: 0, currency: "RUB" as const }
          : expectedFacts.amount;
      const expected = { ...expectedFacts, purpose, logicalSource, amount };
      const observed = { ...observedFacts, logicalSource, amount };

      const decision = decideWebhookProcessing({
        item: activeItem(),
        expectedFacts: expected,
        observedFacts: observed,
        committedSemanticRecords: []
      });
      expect(decision).toMatchObject({
        kind: "apply_once",
        semanticRecord: {
          identity: semanticIdentity,
          canonicalFact: {
            kind: "payment_transition",
            purpose,
            logicalSource,
            providerPaymentId: "arc-payment-1",
            transition: "payment.captured",
            amount
          },
          canonicalFactDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
        },
        businessEffect
      });
    }
  );

  it.each([
    ["client_order", { kind: "platform_invoice", id: "invoice-1" }],
    ["platform_invoice", { kind: "order", id: "order-1" }],
    ["platform_card_setup", { kind: "order", id: "order-1" }]
  ] as const)(
    "quarantines a %s capture whose logical source belongs to another purpose",
    (purpose, logicalSource) => {
      const amount =
        purpose === "platform_card_setup"
          ? { amountMinor: 0, currency: "RUB" as const }
          : expectedFacts.amount;

      expect(
        decideWebhookProcessing({
          item: activeItem(),
          expectedFacts: { ...expectedFacts, purpose, logicalSource, amount },
          observedFacts: { ...observedFacts, logicalSource, amount },
          committedSemanticRecords: []
        })
      ).toEqual({
        kind: "quarantine",
        reason: "semantic_correlation_mismatch",
        mismatches: ["source"],
        businessEffect: null
      });
    }
  );

  it("maps payment.failed only to state recording and rejects caller-supplied effects", () => {
    const item = activeItem({ providerEventType: "payment.failed" });
    const failedObserved = { ...observedFacts };

    expect(
      decideWebhookProcessing({
        item,
        expectedFacts,
        observedFacts: failedObserved,
        committedSemanticRecords: []
      })
    ).toMatchObject({
      kind: "apply_once",
      semanticRecord: {
        identity: {
          providerAccountId: "arc-account-live-primary",
          source: {
            kind: "payment_transition",
            providerPaymentId: "arc-payment-1",
            transition: "payment.failed"
          }
        },
        canonicalFact: {
          kind: "payment_transition",
          purpose: "client_order",
          logicalSource: { kind: "order", id: "order-1" },
          providerPaymentId: "arc-payment-1",
          transition: "payment.failed",
          amount: { amountMinor: 10_000, currency: "RUB" }
        }
      },
      businessEffect: "record_payment_state_only"
    });

    expect(() =>
      decideWebhookProcessing({
        item,
        expectedFacts,
        observedFacts: failedObserved,
        committedSemanticRecords: [],
        requestedEffect: "post_client_sale_payable"
      })
    ).toThrow(WebhookInboxIntegrityError);
  });

  it.each([
    ["payment.failed", expectedRefundFacts, observedRefundFacts],
    ["payment.refunded", expectedFacts, observedFacts]
  ] as const)(
    "quarantines %s when the event and fact discriminants disagree",
    (providerEventType, expected, observed) => {
      expect(
        decideWebhookProcessing({
          item: activeItem({ providerEventType }),
          expectedFacts: expected,
          observedFacts: observed,
          committedSemanticRecords: []
        })
      ).toEqual({
        kind: "quarantine",
        reason: "event_source_mismatch",
        businessEffect: null
      });
    }
  );

  it("derives one canonical partial-refund fact and never collapses it to payment state", () => {
    const decision = decideWebhookProcessing({
      item: activeItem({ providerEventType: "payment.refunded" }),
      expectedFacts: expectedRefundFacts,
      observedFacts: observedRefundFacts,
      committedSemanticRecords: []
    });

    expect(decision).toEqual({
      kind: "apply_once",
      semanticRecord: refundSemanticRecord,
      businessEffect: {
        kind: "record_refund_fact",
        providerPaymentId: "arc-payment-1",
        providerRefundId: "arc-refund-1",
        refundAmount: { amountMinor: 2_500, currency: "RUB" },
        previousTotalRefunded: { amountMinor: 2_000, currency: "RUB" },
        totalRefunded: { amountMinor: 4_500, currency: "RUB" },
        capturedAmount: { amountMinor: 10_000, currency: "RUB" }
      }
    });
    expect(decision.businessEffect).not.toBe("record_payment_state_only");
    if (
      typeof decision.businessEffect !== "string" &&
      decision.businessEffect?.kind === "record_refund_fact"
    ) {
      expect(Object.isFrozen(decision.businessEffect)).toBe(true);
      expect(Object.isFrozen(decision.businessEffect.refundAmount)).toBe(true);
      expect(Object.isFrozen(decision.businessEffect.totalRefunded)).toBe(true);
    }
  });

  it("recognizes an exact refund semantic replay before validating the current cumulative total", () => {
    const first = decideWebhookProcessing({
      item: activeItem({ providerEventType: "payment.refunded" }),
      expectedFacts: expectedRefundFacts,
      observedFacts: observedRefundFacts,
      committedSemanticRecords: []
    });
    if (first.kind !== "apply_once") throw new Error("Expected the first refund fact to apply");

    expect(
      decideWebhookProcessing({
        item: activeItem({
          transportIdentity: {
            provider: "arc_pay",
            webhookId: "arc-webhook-refund-replay"
          },
          providerEventType: "payment.refunded"
        }),
        expectedFacts: {
          ...expectedRefundFacts,
          previousTotalRefunded: { amountMinor: 4_500, currency: "RUB" }
        },
        observedFacts: observedRefundFacts,
        committedSemanticRecords: [first.semanticRecord]
      })
    ).toEqual({
      kind: "semantic_replay",
      semanticRecord: first.semanticRecord,
      businessEffect: null
    });
  });

  it.each([
    ["negative delta", { refundAmountMinor: -1, totalRefundedMinor: 1_999 }],
    ["zero delta", { refundAmountMinor: 0, totalRefundedMinor: 2_000 }],
    ["non-monotonic cumulative", { refundAmountMinor: 100, totalRefundedMinor: 1_900 }],
    ["delta mismatch", { refundAmountMinor: 2_500, totalRefundedMinor: 5_000 }],
    ["capture overflow", { refundAmountMinor: 9_000, totalRefundedMinor: 11_000 }]
  ] as const)("quarantines refund economics: %s", (_label, patch) => {
    expect(
      decideWebhookProcessing({
        item: activeItem({ providerEventType: "payment.refunded" }),
        expectedFacts: expectedRefundFacts,
        observedFacts: { ...observedRefundFacts, ...patch },
        committedSemanticRecords: []
      })
    ).toEqual({
      kind: "quarantine",
      reason: "refund_economics_mismatch",
      businessEffect: null
    });
  });

  it("correlates the authoritative refund source and deduplicates by refund identity", () => {
    expect(
      decideWebhookProcessing({
        item: activeItem({ providerEventType: "payment.refunded" }),
        expectedFacts: expectedRefundFacts,
        observedFacts: { ...observedRefundFacts, providerRefundId: "arc-refund-other" },
        committedSemanticRecords: []
      })
    ).toEqual({
      kind: "quarantine",
      reason: "semantic_correlation_mismatch",
      mismatches: ["source"],
      businessEffect: null
    });

    expect(
      decideWebhookProcessing({
        item: activeItem({ providerEventType: "payment.refunded" }),
        expectedFacts: expectedRefundFacts,
        observedFacts: observedRefundFacts,
        committedSemanticRecords: [refundSemanticRecord]
      })
    ).toEqual({
      kind: "semantic_replay",
      semanticRecord: refundSemanticRecord,
      businessEffect: null
    });
  });

  it("derives a bounded canonical chargeback fact with its case identity", () => {
    const decision = decideWebhookProcessing({
      item: activeItem({ providerEventType: "payment.chargeback" }),
      expectedFacts: expectedChargebackFacts,
      observedFacts: observedChargebackFacts,
      committedSemanticRecords: []
    });

    expect(decision).toEqual({
      kind: "apply_once",
      semanticRecord: chargebackSemanticRecord,
      businessEffect: {
        kind: "record_chargeback_fact",
        providerPaymentId: "arc-payment-1",
        chargebackSource: {
          kind: "provider_chargeback_id",
          providerChargebackId: "arc-chargeback-1"
        },
        disputedAmount: { amountMinor: 3_500, currency: "RUB" },
        capturedAmount: { amountMinor: 10_000, currency: "RUB" }
      }
    });
    expect(decision.businessEffect).not.toBe("record_payment_state_only");
  });

  it("correlates the authoritative chargeback case source before applying it", () => {
    expect(
      decideWebhookProcessing({
        item: activeItem({ providerEventType: "payment.chargeback" }),
        expectedFacts: expectedChargebackFacts,
        observedFacts: {
          ...observedChargebackFacts,
          chargebackSource: {
            kind: "provider_chargeback_id",
            providerChargebackId: "arc-chargeback-other"
          }
        },
        committedSemanticRecords: []
      })
    ).toEqual({
      kind: "quarantine",
      reason: "semantic_correlation_mismatch",
      mismatches: ["source"],
      businessEffect: null
    });
  });

  it("quarantines a reused chargeback semantic identity whose economic facts changed", () => {
    expect(
      decideWebhookProcessing({
        item: activeItem({ providerEventType: "payment.chargeback" }),
        expectedFacts: expectedChargebackFacts,
        observedFacts: { ...observedChargebackFacts, disputedAmountMinor: 4_000 },
        committedSemanticRecords: [chargebackSemanticRecord]
      })
    ).toEqual({
      kind: "quarantine",
      reason: "semantic_fact_conflict",
      semanticIdentity: chargebackSemanticIdentity,
      businessEffect: null
    });
  });

  it("uses the required webhook event id as an explicit chargeback source when chargeback_id is absent", () => {
    const chargebackSource = {
      kind: "webhook_event_id",
      webhookEventId: "arc-webhook-1"
    } as const;
    const expected = {
      kind: "chargeback",
      providerAccount,
      purpose: "client_order",
      providerPaymentId: "arc-payment-1",
      logicalSource: { kind: "order", id: "order-1" },
      chargebackSource,
      capturedAmount: { amountMinor: 10_000, currency: "RUB" }
    } as const;
    const observed = {
      kind: "chargeback",
      provider: "arc_pay",
      providerAccountId: "arc-account-live-primary",
      merchantTenantId: "elevenhouse-live",
      environment: "live",
      livemode: true,
      providerPaymentId: "arc-payment-1",
      logicalSource: { kind: "order", id: "order-1" },
      chargebackSource,
      disputedAmountMinor: 3_500,
      currency: "RUB"
    } as const;

    const decision = decideWebhookProcessing({
      item: activeItem({ providerEventType: "payment.chargeback" }),
      expectedFacts: expected,
      observedFacts: observed,
      committedSemanticRecords: []
    });

    expect(decision).toMatchObject({
      kind: "apply_once",
      businessEffect: {
        kind: "record_chargeback_fact",
        providerPaymentId: "arc-payment-1",
        chargebackSource,
        disputedAmount: { amountMinor: 3_500, currency: "RUB" }
      }
    });
  });

  it("quarantines a webhook-event chargeback source that does not equal the inbox event id", () => {
    const chargebackSource = {
      kind: "webhook_event_id",
      webhookEventId: "another-webhook-event"
    } as const;
    const expected = {
      kind: "chargeback",
      providerAccount,
      purpose: "client_order",
      providerPaymentId: "arc-payment-1",
      logicalSource: { kind: "order", id: "order-1" },
      chargebackSource,
      capturedAmount: { amountMinor: 10_000, currency: "RUB" }
    } as const;
    const observed = {
      kind: "chargeback",
      provider: "arc_pay",
      providerAccountId: "arc-account-live-primary",
      merchantTenantId: "elevenhouse-live",
      environment: "live",
      livemode: true,
      providerPaymentId: "arc-payment-1",
      logicalSource: { kind: "order", id: "order-1" },
      chargebackSource,
      disputedAmountMinor: 3_500,
      currency: "RUB"
    } as const;

    expect(
      decideWebhookProcessing({
        item: activeItem({ providerEventType: "payment.chargeback" }),
        expectedFacts: expected,
        observedFacts: observed,
        committedSemanticRecords: []
      })
    ).toEqual({
      kind: "quarantine",
      reason: "semantic_correlation_mismatch",
      mismatches: ["source"],
      businessEffect: null
    });
  });

  it.each([
    ["negative disputed amount", -1],
    ["zero disputed amount", 0],
    ["amount above capture", 10_001]
  ] as const)("quarantines chargeback economics: %s", (_label, disputedAmountMinor) => {
    expect(
      decideWebhookProcessing({
        item: activeItem({ providerEventType: "payment.chargeback" }),
        expectedFacts: expectedChargebackFacts,
        observedFacts: { ...observedChargebackFacts, disputedAmountMinor },
        committedSemanticRecords: []
      })
    ).toEqual({
      kind: "quarantine",
      reason: "chargeback_economics_mismatch",
      businessEffect: null
    });
  });

  it("rejects a proxied committed-identity array before executing reflection traps", () => {
    let trapCalls = 0;
    const committed = new Proxy([], {
      ownKeys() {
        trapCalls += 1;
        throw new WebhookInboxIntegrityError();
      }
    });
    expect(() =>
      decideWebhookProcessing({
        item: activeItem(),
        expectedFacts,
        observedFacts,
        committedSemanticRecords: committed
      })
    ).toThrow(WebhookInboxIntegrityError);
    expect(trapCalls).toBe(0);
  });

  it("rejects completed and quarantined items before any second processing decision", () => {
    for (const processingStatus of ["completed", "quarantined"] as const) {
      const terminal = advanceWebhookInboxCheckpoint({
        item: activeItem(),
        expectedVersion: 1,
        checkpoint: checkpoint,
        nextStatus: processingStatus
      });
      expect(() =>
        decideWebhookProcessing({
          item: terminal,
          expectedFacts,
          observedFacts,
          committedSemanticRecords: []
        })
      ).toThrow(WebhookInboxVersionConflictError);
    }
  });

  it("rejects accessor-backed canonical facts without invoking the accessor", () => {
    let getterCalls = 0;
    const observed = { ...observedFacts };
    Object.defineProperty(observed, "providerPaymentId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("getter must not execute");
      }
    });

    expect(() =>
      decideWebhookProcessing({
        item: activeItem(),
        expectedFacts,
        observedFacts: observed,
        committedSemanticRecords: []
      })
    ).toThrow(WebhookInboxIntegrityError);
    expect(getterCalls).toBe(0);
  });
});

describe("webhook attempts and processor checkpoints", () => {
  it("begins one CAS-bound processing attempt and exposes a resumable active state", () => {
    const started = beginWebhookInboxProcessingAttempt({
      item: validItem(),
      expectedVersion: 0
    });

    expect(started).toMatchObject({
      version: 1,
      processingStatus: "processing",
      processingAttempts: 1,
      lastErrorClass: null
    });
    expect(resumeWebhookInboxProcessing(started)).toEqual({
      kind: "resume_active_attempt",
      expectedVersion: 1,
      nextSequence: 1,
      processingAttempts: 1,
      lastErrorClass: null,
      lastCommittedCheckpoint: null
    });
  });

  it("records only an allowlisted error class and starts the next attempt without a raw message", () => {
    const started = activeItem();
    const failed = recordWebhookInboxProcessingFailure({
      item: started,
      expectedVersion: 1,
      errorClass: "canonical_provider_read_unavailable"
    });

    expect(failed).toMatchObject({
      version: 2,
      processingAttempts: 1,
      lastErrorClass: "canonical_provider_read_unavailable"
    });
    expect(failed).not.toHaveProperty("errorMessage");
    expect(resumeWebhookInboxProcessing(failed)).toMatchObject({
      kind: "begin_retry_attempt",
      expectedVersion: 2,
      processingAttempts: 1,
      lastErrorClass: "canonical_provider_read_unavailable"
    });

    const retry = beginWebhookInboxProcessingAttempt({ item: failed, expectedVersion: 2 });
    expect(retry).toMatchObject({
      version: 3,
      processingAttempts: 2,
      lastErrorClass: null
    });
    expect(() =>
      recordWebhookInboxProcessingFailure({
        item: retry,
        expectedVersion: 3,
        errorClass: "connection reset by peer: raw stack"
      })
    ).toThrow(WebhookInboxIntegrityError);
  });

  it("rejects an unsafe hydrated attempt counter", () => {
    expect(() =>
      resumeWebhookInboxProcessing({
        ...activeItem(),
        processingAttempts: Number.MAX_SAFE_INTEGER + 1
      })
    ).toThrow(WebhookInboxIntegrityError);
  });

  it("advances one committed sequence with expected version and preserves an opaque code", () => {
    const item = activeItem();
    const advanced = advanceWebhookInboxCheckpoint({
      item,
      expectedVersion: 1,
      checkpoint,
      nextStatus: "processing"
    });

    expect(advanced).toMatchObject({
      version: 2,
      processingStatus: "processing",
      processingAttempts: 1,
      lastErrorClass: null,
      lastCommittedCheckpoint: checkpoint
    });
    expect(item.version).toBe(1);
    expect(Object.isFrozen(advanced.lastCommittedCheckpoint)).toBe(true);
    expect(resumeWebhookInboxProcessing(advanced)).toEqual({
      kind: "resume_active_attempt",
      expectedVersion: 2,
      nextSequence: 2,
      processingAttempts: 1,
      lastErrorClass: null,
      lastCommittedCheckpoint: advanced.lastCommittedCheckpoint
    });
  });

  it("rejects a stale version, skipped sequence and checkpoint chronology regression", () => {
    const first = advanceWebhookInboxCheckpoint({
      item: activeItem(),
      expectedVersion: 1,
      checkpoint,
      nextStatus: "processing"
    });

    expect(() =>
      advanceWebhookInboxCheckpoint({
        item: first,
        expectedVersion: 1,
        checkpoint: { ...checkpoint, sequence: 2, committedAt: "2026-08-03T10:02:00Z" },
        nextStatus: "completed"
      })
    ).toThrow(WebhookInboxVersionConflictError);
    for (const nextCheckpoint of [
      { ...checkpoint, sequence: 1, committedAt: "2026-08-03T10:02:00Z" },
      { ...checkpoint, sequence: 3, committedAt: "2026-08-03T10:02:00Z" },
      { ...checkpoint, sequence: 2, committedAt: "2026-08-03T09:59:59Z" }
    ]) {
      expect(() =>
        advanceWebhookInboxCheckpoint({
          item: first,
          expectedVersion: 2,
          checkpoint: nextCheckpoint,
          nextStatus: "completed"
        })
      ).toThrow(WebhookInboxIntegrityError);
    }
  });

  it("rejects impossible hydrated status, checkpoint and version combinations", () => {
    const item = validItem();
    for (const impossible of [
      { ...item, version: 1 },
      { ...item, processingStatus: "processing" as const },
      {
        ...item,
        version: 1,
        processingStatus: "completed" as const,
        processingAttempts: 1
      },
      {
        ...activeItem(),
        version: 1,
        lastCommittedCheckpoint: checkpoint
      },
      { ...activeItem(), version: 99 }
    ]) {
      expect(() => resumeWebhookInboxProcessing(impossible)).toThrow(WebhookInboxIntegrityError);
    }
  });

  it("never resumes, advances or begins a terminal item", () => {
    const terminal = advanceWebhookInboxCheckpoint({
      item: activeItem(),
      expectedVersion: 1,
      checkpoint,
      nextStatus: "completed"
    });

    expect(() => resumeWebhookInboxProcessing(terminal)).toThrow(WebhookInboxVersionConflictError);
    expect(() =>
      beginWebhookInboxProcessingAttempt({ item: terminal, expectedVersion: 2 })
    ).toThrow(WebhookInboxVersionConflictError);
    expect(() =>
      advanceWebhookInboxCheckpoint({
        item: terminal,
        expectedVersion: 2,
        checkpoint: { ...checkpoint, sequence: 2, committedAt: "2026-08-03T10:02:00Z" },
        nextStatus: "completed"
      })
    ).toThrow(WebhookInboxVersionConflictError);
  });
});

const providerAccount = {
  providerAccountId: "arc-account-live-primary",
  identityVersion: 3,
  provider: "arc_pay",
  merchantTenantId: "elevenhouse-live",
  terminalScope: "primary-payins",
  settlementScope: "merchant-ledger-primary"
} as const;

const expectedFacts = {
  kind: "payment_transition",
  providerAccount,
  purpose: "client_order",
  providerPaymentId: "arc-payment-1",
  logicalSource: { kind: "order", id: "order-1" },
  amount: { amountMinor: 10_000, currency: "RUB" }
} as const;

const paymentCaptureSource = {
  kind: "payment_transition",
  providerPaymentId: "arc-payment-1",
  transition: "payment.captured"
} as const;

const observedFacts = {
  kind: "payment_transition",
  provider: "arc_pay",
  providerAccountId: "arc-account-live-primary",
  merchantTenantId: "elevenhouse-live",
  environment: "live",
  livemode: true,
  providerPaymentId: "arc-payment-1",
  logicalSource: { kind: "order", id: "order-1" },
  amount: { amountMinor: 10_000, currency: "RUB" }
} as const;

const semanticIdentity = {
  providerAccountId: "arc-account-live-primary",
  source: paymentCaptureSource
} as const;

const semanticRecord = {
  identity: semanticIdentity,
  canonicalFact: {
    kind: "payment_transition",
    purpose: "client_order",
    logicalSource: { kind: "order", id: "order-1" },
    providerPaymentId: "arc-payment-1",
    transition: "payment.captured",
    amount: { amountMinor: 10_000, currency: "RUB" }
  },
  canonicalFactDigest: "sha256:e33412790406f4a03a091290438374a815ca22b03c2d3cf4b703e059cf032b5e"
} as const;

const expectedRefundFacts = {
  kind: "refund",
  providerAccount,
  purpose: "client_order",
  providerPaymentId: "arc-payment-1",
  logicalSource: { kind: "order", id: "order-1" },
  providerRefundId: "arc-refund-1",
  previousTotalRefunded: { amountMinor: 2_000, currency: "RUB" },
  capturedAmount: { amountMinor: 10_000, currency: "RUB" }
} as const;

const observedRefundFacts = {
  kind: "refund",
  provider: "arc_pay",
  providerAccountId: "arc-account-live-primary",
  merchantTenantId: "elevenhouse-live",
  environment: "live",
  livemode: true,
  providerPaymentId: "arc-payment-1",
  logicalSource: { kind: "order", id: "order-1" },
  providerRefundId: "arc-refund-1",
  refundAmountMinor: 2_500,
  totalRefundedMinor: 4_500,
  currency: "RUB"
} as const;

const refundSemanticIdentity = {
  providerAccountId: "arc-account-live-primary",
  source: { kind: "refund", providerRefundId: "arc-refund-1" }
} as const;

const refundSemanticRecord = {
  identity: refundSemanticIdentity,
  canonicalFact: {
    kind: "refund",
    purpose: "client_order",
    logicalSource: { kind: "order", id: "order-1" },
    providerPaymentId: "arc-payment-1",
    providerRefundId: "arc-refund-1",
    refundAmount: { amountMinor: 2_500, currency: "RUB" },
    totalRefunded: { amountMinor: 4_500, currency: "RUB" },
    capturedAmount: { amountMinor: 10_000, currency: "RUB" }
  },
  canonicalFactDigest: "sha256:e0abc57a669284a626ae58e58a6b6d41ddff7d2ae01d924d84eda08eebfcd8c0"
} as const;

const expectedChargebackFacts = {
  kind: "chargeback",
  providerAccount,
  purpose: "client_order",
  providerPaymentId: "arc-payment-1",
  logicalSource: { kind: "order", id: "order-1" },
  chargebackSource: {
    kind: "provider_chargeback_id",
    providerChargebackId: "arc-chargeback-1"
  },
  capturedAmount: { amountMinor: 10_000, currency: "RUB" }
} as const;

const observedChargebackFacts = {
  kind: "chargeback",
  provider: "arc_pay",
  providerAccountId: "arc-account-live-primary",
  merchantTenantId: "elevenhouse-live",
  environment: "live",
  livemode: true,
  providerPaymentId: "arc-payment-1",
  logicalSource: { kind: "order", id: "order-1" },
  chargebackSource: {
    kind: "provider_chargeback_id",
    providerChargebackId: "arc-chargeback-1"
  },
  disputedAmountMinor: 3_500,
  currency: "RUB"
} as const;

const chargebackSemanticIdentity = {
  providerAccountId: "arc-account-live-primary",
  source: {
    kind: "chargeback",
    chargebackSource: {
      kind: "provider_chargeback_id",
      providerChargebackId: "arc-chargeback-1"
    }
  }
} as const;

const chargebackSemanticRecord = {
  identity: chargebackSemanticIdentity,
  canonicalFact: {
    kind: "chargeback",
    purpose: "client_order",
    logicalSource: { kind: "order", id: "order-1" },
    providerPaymentId: "arc-payment-1",
    chargebackSource: {
      kind: "provider_chargeback_id",
      providerChargebackId: "arc-chargeback-1"
    },
    disputedAmount: { amountMinor: 3_500, currency: "RUB" },
    capturedAmount: { amountMinor: 10_000, currency: "RUB" }
  },
  canonicalFactDigest: "sha256:74c931f5fed62beb8d1589516816dd534caf57a1f5fd7c6343b2957fdd3cad79"
} as const;

const checkpoint = {
  sequence: 1,
  processorVersion: 7,
  opaqueCode: "provider-read/confirmed:v7",
  committedAt: "2026-08-03T10:01:00Z"
} as const;

function validIngress(overrides: Record<string, unknown> = {}) {
  return prepareWebhookIngress({ ...validIngressInput(), ...overrides });
}

function validIngressInput() {
  return {
    provider: "arc_pay",
    webhookId: "arc-webhook-1",
    providerEventType: "payment.captured",
    rawBodyDigest,
    sealedPayloadRef: "sealed-webhooks/2026/08/arc-webhook-1",
    receivedAt: "2026-08-03T10:00:00Z",
    transportValidation: {
      envelope: "bounded",
      signature: "valid",
      timestamp: "valid"
    }
  } as Record<string, unknown>;
}

function validItem(overrides: Record<string, unknown> = {}) {
  const ingress = validIngress();
  if (ingress.kind !== "store_before_acknowledgement") {
    throw new Error("Expected a valid ingress fixture");
  }
  return { ...ingress.item, ...overrides };
}

function activeItem(overrides: Record<string, unknown> = {}) {
  return beginWebhookInboxProcessingAttempt({
    item: validItem(overrides),
    expectedVersion: 0
  });
}
