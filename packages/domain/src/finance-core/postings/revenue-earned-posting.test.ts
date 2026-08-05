import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";
import {
  buildApprovedRevenueEarnedPosting,
  type ApprovedRevenueRecognitionEvent,
  type RevenueRecognitionKind,
  type UnverifiedDeferredRevenueSource
} from "./revenue-earned-posting";

describe("approved revenue earned posting", () => {
  it.each([
    [
      "commission",
      "platform_commission_deferred",
      "platform_commission_revenue",
      { kind: "order", sourceId: "order-1", operation: "commission_earned" }
    ],
    [
      "subscription",
      "platform_subscription_deferred",
      "platform_subscription_revenue",
      { kind: "platform_invoice", sourceId: "invoice-1", operation: "revenue_earned" }
    ]
  ] as const)(
    "moves the full exact %s deferred source to matching earned revenue",
    (recognitionKind, deferredCode, revenueCode, expectedSourceKey) => {
      const input = recognitionInput(recognitionKind);
      const result = build(input);

      expect(result).toMatchObject({
        kind: "journal",
        authorizationStatus: "unverified",
        atomicityStatus: "unverified"
      });
      expect(result.transaction.sourceKey).toEqual(expectedSourceKey);
      expect(result.transaction.entries).toEqual([
        {
          account: { code: deferredCode, currency: "RUB" },
          side: "debit",
          amount: { amountMinor: recognitionKind === "commission" ? 400 : 2_500, currency: "RUB" },
          links: input.event.deferredSource.entry.links
        },
        {
          account: { code: revenueCode, currency: "RUB" },
          side: "credit",
          amount: { amountMinor: recognitionKind === "commission" ? 400 : 2_500, currency: "RUB" },
          links: input.event.deferredSource.entry.links
        }
      ]);
      expect(result.linkProof).toMatchObject({
        allocationAuthorityRef: {
          kind: "approved_revenue_recognition_event",
          authorityId: input.event.eventId,
          version: 4,
          canonicalDigest: input.event.canonicalDigest
        },
        sourceEvidenceRef: {
          kind: "approved_revenue_recognition_event",
          evidenceId: input.event.eventId,
          canonicalDigest: input.event.canonicalDigest
        },
        operationSnapshotRef: null
      });
    }
  );

  it("has no partial or staged recognition field and consumes the entire source cap", () => {
    const input = recognitionInput("commission");
    expectPostingError(
      () =>
        buildApprovedRevenueEarnedPosting(
          {
            ...input,
            event: { ...input.event, recognizedAmount: { amountMinor: 200, currency: "RUB" } }
          } as never,
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(build(input).transaction.totalDebitMinor).toBe("400");
  });

  it("requires a versioned approved accounting event with intact digests", () => {
    const input = recognitionInput("commission");
    expectPostingError(
      () => build({ ...input, event: { ...input.event, version: 0 } }),
      "invalid_version"
    );
    expectPostingError(
      () => build({ ...input, event: { ...input.event, approvalStatus: "draft" } as never }),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          event: {
            ...input.event,
            deferredSource: { ...input.event.deferredSource, canonicalDigest: sha("d") }
          }
        }),
      "evidence_mismatch"
    );
    expectPostingError(
      () => build({ ...input, event: { ...input.event, canonicalDigest: sha("e") } }),
      "authority_mismatch"
    );
  });

  it.each([
    ["side", { side: "debit" }, "evidence_mismatch"],
    [
      "account",
      { account: { code: "platform_subscription_deferred", currency: "RUB" } },
      "evidence_mismatch"
    ],
    ["amount", { amount: { amountMinor: 0, currency: "RUB" } }, "invalid_money"]
  ] as const)("rejects an invalid exact deferred source %s", (_label, entryChange, reason) => {
    const input = recognitionInput("commission");
    const source = bindSource({
      ...input.event.deferredSource,
      entry: { ...input.event.deferredSource.entry, ...entryChange }
    });
    expectPostingError(() => build(bindEvent(input, { deferredSource: source })), reason);
  });

  it("requires exact capture source kind, operation and business links", () => {
    const input = recognitionInput("commission");
    const wrongOperation = bindSource({
      ...input.event.deferredSource,
      sourceKey: { kind: "order", sourceId: "order-1", operation: "commission_earned" }
    });
    expectPostingError(
      () => build(bindEvent(input, { deferredSource: wrongOperation })),
      "source_mismatch"
    );
    const missingComponent = bindSource({
      ...input.event.deferredSource,
      entry: {
        ...input.event.deferredSource.entry,
        links: { ...input.event.deferredSource.entry.links, componentId: null }
      }
    });
    expectPostingError(
      () => build(bindEvent(input, { deferredSource: missingComponent })),
      "evidence_mismatch"
    );
  });

  it("requires natural source identity and approved-event chronology", () => {
    const input = recognitionInput("subscription");
    expectPostingError(
      () => build({ ...input, context: { ...input.context, operationId: "command-id" } }),
      "source_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          context: {
            ...input.context,
            sourceKey: { ...input.context.sourceKey, sourceId: "other" }
          }
        }),
      "source_mismatch"
    );
    const lateApproval = bindEvent(input, {
      deferredSource: input.event.deferredSource,
      approvedAt: "2026-08-03T11:00:01Z"
    });
    expectPostingError(() => build(lateApproval), "invalid_chronology");
  });

  it("normalizes OOB envelope before hostile target and rejects nested traps", () => {
    const hostileTarget = hostileProxy({});
    expectPostingError(
      () => buildApprovedRevenueEarnedPosting(hostileTarget.value as never, undefined as never),
      "decoder_envelope_required"
    );
    expect(hostileTarget.trapCalls()).toBe(0);

    const input = recognitionInput("commission");
    const hostileEntry = hostileProxy(input.event.deferredSource.entry);
    expectPostingError(
      () =>
        build({
          ...input,
          event: {
            ...input.event,
            deferredSource: { ...input.event.deferredSource, entry: hostileEntry.value }
          }
        }),
      "invalid_shape"
    );
    expect(hostileEntry.trapCalls()).toBe(0);

    const accessor = structuredClone(input);
    let getterCalls = 0;
    Object.defineProperty(accessor.event.deferredSource, "entry", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error("must not run getter");
      }
    });
    expectPostingError(() => build(accessor), "invalid_shape");
    expect(getterCalls).toBe(0);
  });
});

type RevenueInput = Parameters<typeof buildApprovedRevenueEarnedPosting>[0];

function build(input: RevenueInput) {
  return buildApprovedRevenueEarnedPosting(input, postingDecoderEnvelope);
}

function recognitionInput(recognitionKind: RevenueRecognitionKind): RevenueInput {
  const sourceId = recognitionKind === "commission" ? "order-1" : "invoice-1";
  const occurredAt = "2026-08-03T11:00:00Z";
  const deferredSource = bindSource({
    kind: "unverified_deferred_revenue_source",
    schemaVersion: 1,
    sourceTransactionId: `capture-${sourceId}`,
    sourceEntryIndex: recognitionKind === "commission" ? 2 : 1,
    sourceKey:
      recognitionKind === "commission"
        ? { kind: "order", sourceId, operation: "sale_captured" }
        : { kind: "platform_invoice", sourceId, operation: "captured" },
    entry: {
      account: {
        code:
          recognitionKind === "commission"
            ? "platform_commission_deferred"
            : "platform_subscription_deferred",
        currency: "RUB"
      },
      side: "credit",
      amount: {
        amountMinor: recognitionKind === "commission" ? 400 : 2_500,
        currency: "RUB"
      },
      links:
        recognitionKind === "commission"
          ? {
              originalSaleId: sourceId,
              componentId: "component-platform-commission",
              payableLotId: null,
              payoutAllocationId: null
            }
          : {
              originalSaleId: null,
              componentId: null,
              payableLotId: null,
              payoutAllocationId: null
            }
    },
    integrityStatus: "unverified",
    digestPurpose: "drift_detection_only"
  });
  const base = {
    context: {
      journalTransactionId: `journal-earned-${sourceId}`,
      linkProofId: `proof-earned-${sourceId}`,
      operationId: `recognition-${sourceId}`,
      sourceKey:
        recognitionKind === "commission"
          ? { kind: "order" as const, sourceId, operation: "commission_earned" as const }
          : { kind: "platform_invoice" as const, sourceId, operation: "revenue_earned" as const },
      occurredAt,
      postedAt: occurredAt
    }
  };
  return bindEvent(base, { recognitionKind, sourceId, deferredSource, recognizedAt: occurredAt });
}

function bindSource(
  input: Omit<UnverifiedDeferredRevenueSource, "canonicalDigest"> | UnverifiedDeferredRevenueSource
): UnverifiedDeferredRevenueSource {
  const core = withoutDigest(input);
  return {
    ...core,
    canonicalDigest: hashFinanceCommandPayload(core)
  } as UnverifiedDeferredRevenueSource;
}

function bindEvent(
  input: { context: RevenueInput["context"]; event?: ApprovedRevenueRecognitionEvent },
  change: Partial<Omit<ApprovedRevenueRecognitionEvent, "canonicalDigest">> &
    Pick<Omit<ApprovedRevenueRecognitionEvent, "canonicalDigest">, "deferredSource">
): RevenueInput {
  const defaults: Omit<ApprovedRevenueRecognitionEvent, "canonicalDigest"> = {
    kind: "approved_revenue_recognition_event" as const,
    schemaVersion: 1 as const,
    eventId: input.context.operationId,
    version: 4,
    approvalStatus: "approved" as const,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    recognitionKind: "commission" as const,
    sourceId: input.context.sourceKey.sourceId,
    deferredSource: change.deferredSource,
    approvedAt: "2026-08-03T10:59:00Z",
    recognizedAt: input.context.occurredAt
  };
  const existing = input.event ? withoutDigest(input.event) : {};
  const core = { ...defaults, ...existing, ...change } satisfies Omit<
    ApprovedRevenueRecognitionEvent,
    "canonicalDigest"
  >;
  return { ...input, event: { ...core, canonicalDigest: hashFinanceCommandPayload(core) } };
}

function withoutDigest<T extends object>(input: T): Omit<T, "canonicalDigest"> {
  const copy = { ...input };
  Reflect.deleteProperty(copy, "canonicalDigest");
  return copy;
}

function hostileProxy<T extends object>(target: T) {
  let trapCalls = 0;
  const trap = () => {
    trapCalls += 1;
    throw new Error("must not execute Proxy trap");
  };
  return {
    value: new Proxy(target, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap
    }),
    trapCalls: () => trapCalls
  };
}
