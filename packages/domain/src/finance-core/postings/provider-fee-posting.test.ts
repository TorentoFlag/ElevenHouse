import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";
import {
  buildProviderFeeConfirmedPosting,
  buildProviderFeeReturnedPosting
} from "./provider-fee-posting";
import type {
  ProviderFeeConfirmedFact,
  ProviderFeeReturnedFact,
  ProviderFeeType
} from "./provider-fee-posting-fact";

describe("provider fee postings", () => {
  it.each([
    ["acquiring", "provider_fee_expense"],
    ["chargeback_processing", "chargeback_fee_expense"]
  ] as const)("maps confirmed %s fee to its exact platform expense", (feeType, expenseCode) => {
    const fact = confirmedFact(feeType);
    const result = buildConfirmed(fact);

    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expect(result.transaction).toMatchObject({
      sourceKey: { kind: "provider_fee", sourceId: fact.providerFeeId, operation: "confirmed" },
      entries: [
        {
          account: { code: expenseCode, currency: "RUB" },
          side: "debit",
          amount: { amountMinor: 250, currency: "RUB" }
        },
        {
          account: {
            code: "arc_provider_clearing",
            arcProviderAccountId: "arc-live",
            currency: "RUB"
          },
          side: "credit",
          amount: { amountMinor: 250, currency: "RUB" }
        }
      ]
    });
    expect(result.transaction.entries.every((entry) => allLinksNull(entry.links))).toBe(true);
    expect(result.transaction.entries.some((entry) => "astrologerUserId" in entry.account)).toBe(
      false
    );
    expect(result.linkProof).toMatchObject({
      allocationAuthorityRef: {
        kind: "provider_fee_confirmed_fact",
        authorityId: fact.providerFeeId,
        version: 2,
        canonicalDigest: fact.canonicalDigest
      },
      sourceEvidenceRef: {
        kind: "provider_fee_confirmed_fact",
        evidenceId: fact.providerFeeId,
        canonicalDigest: fact.canonicalDigest
      },
      operationSnapshotRef: null
    });
  });

  it.each([
    ["acquiring", "provider_fee_expense"],
    ["chargeback_processing", "chargeback_fee_expense"]
  ] as const)("reverses a separately evidenced full %s fee return", (feeType, expenseCode) => {
    const original = confirmedFact(feeType);
    const returned = returnedFact(original);
    const result = buildReturned(returned, original);

    expect(result.transaction.sourceKey).toEqual({
      kind: "provider_fee",
      sourceId: returned.providerFeeReturnId,
      operation: "returned"
    });
    expect(result.transaction.entries).toMatchObject([
      {
        account: {
          code: "arc_provider_clearing",
          arcProviderAccountId: "arc-live",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 250, currency: "RUB" }
      },
      {
        account: { code: expenseCode, currency: "RUB" },
        side: "credit",
        amount: { amountMinor: 250, currency: "RUB" }
      }
    ]);
    expect(result.linkProof.sourceEvidenceRef.evidenceId).toBe(returned.providerFeeReturnId);
  });

  it("rejects a return without a separately supplied original fee fact", () => {
    const original = confirmedFact("acquiring");
    const returned = returnedFact(original);
    expectPostingError(
      () =>
        buildProviderFeeReturnedPosting(
          { context: returnedContext(returned), fact: returned } as never,
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
  });

  it("rejects partial, cross-type and cross-account fee returns", () => {
    const original = confirmedFact("acquiring");
    expectPostingError(
      () =>
        buildReturned(
          returnedFact(original, { amount: { amountMinor: 100, currency: "RUB" } }),
          original
        ),
      "amount_mismatch"
    );
    expectPostingError(
      () => buildReturned(returnedFact(original), confirmedFact("chargeback_processing")),
      "evidence_mismatch"
    );
    const anotherAccount = bindConfirmed({ ...original, arcProviderAccountId: "arc-other" });
    const crossAccountReturn = bindReturned({
      ...returnedFact(anotherAccount),
      arcProviderAccountId: "arc-live"
    });
    expectPostingError(() => buildReturned(crossAccountReturn, anotherAccount), "scope_mismatch");
  });

  it("requires an exact original-fee reference and distinct natural return ID", () => {
    const original = confirmedFact("acquiring");
    const returned = returnedFact(original);
    expectPostingError(
      () =>
        buildReturned(
          bindReturned({
            ...returned,
            originalFeeRef: { ...returned.originalFeeRef, canonicalDigest: sha("b") }
          }),
          original
        ),
      "evidence_mismatch"
    );
    expectPostingError(
      () =>
        buildReturned(
          bindReturned({ ...returned, providerFeeReturnId: original.providerFeeId }),
          original
        ),
      "source_mismatch"
    );
  });

  it("requires natural source identity and fact chronology", () => {
    const fact = confirmedFact("acquiring");
    expectPostingError(
      () =>
        buildProviderFeeConfirmedPosting(
          { context: { ...confirmedContext(fact), operationId: "command-id" }, fact },
          postingDecoderEnvelope
        ),
      "source_mismatch"
    );
    const late = bindConfirmed({ ...fact, observedAt: "2026-08-03T10:05:00Z" });
    expectPostingError(
      () =>
        buildProviderFeeConfirmedPosting(
          { context: { ...confirmedContext(late), postedAt: "2026-08-03T10:04:00Z" }, fact: late },
          postingDecoderEnvelope
        ),
      "invalid_chronology"
    );
  });

  it("does not infer chargeback fee return from a dispute outcome", () => {
    const original = confirmedFact("chargeback_processing");
    const returned = returnedFact(original);
    expectPostingError(
      () =>
        buildProviderFeeReturnedPosting(
          {
            context: returnedContext(returned),
            fact: returned,
            originalFact: original,
            chargebackOutcome: "won"
          } as never,
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
  });

  it("normalizes OOB envelope before hostile target and rejects nested traps", () => {
    const hostileTarget = hostileProxy({});
    expectPostingError(
      () => buildProviderFeeConfirmedPosting(hostileTarget.value as never, undefined as never),
      "decoder_envelope_required"
    );
    expect(hostileTarget.trapCalls()).toBe(0);

    const fact = confirmedFact("acquiring");
    const hostileAmount = hostileProxy(fact.amount);
    expectPostingError(
      () => buildConfirmed({ ...fact, amount: hostileAmount.value }),
      "invalid_shape"
    );
    expect(hostileAmount.trapCalls()).toBe(0);

    const accessor = structuredClone(fact);
    let getterCalls = 0;
    Object.defineProperty(accessor, "amount", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error("must not run getter");
      }
    });
    expectPostingError(() => buildConfirmed(accessor), "invalid_shape");
    expect(getterCalls).toBe(0);
  });
});

function buildConfirmed(fact: ProviderFeeConfirmedFact) {
  return buildProviderFeeConfirmedPosting(
    { context: confirmedContext(fact), fact },
    postingDecoderEnvelope
  );
}

function buildReturned(fact: ProviderFeeReturnedFact, originalFact: ProviderFeeConfirmedFact) {
  return buildProviderFeeReturnedPosting(
    { context: returnedContext(fact), fact, originalFact },
    postingDecoderEnvelope
  );
}

function confirmedContext(fact: ProviderFeeConfirmedFact) {
  return context(fact.providerFeeId, "confirmed", fact.occurredAt, fact.observedAt);
}

function returnedContext(fact: ProviderFeeReturnedFact) {
  return context(fact.providerFeeReturnId, "returned", fact.occurredAt, fact.observedAt);
}

function context(
  sourceId: string,
  operation: "confirmed" | "returned",
  occurredAt: string,
  postedAt: string
) {
  return {
    journalTransactionId: `journal-${sourceId}`,
    linkProofId: `proof-${sourceId}`,
    operationId: sourceId,
    sourceKey: { kind: "provider_fee" as const, sourceId, operation },
    occurredAt,
    postedAt
  };
}

function confirmedFact(feeType: ProviderFeeType): ProviderFeeConfirmedFact {
  return bindConfirmed({
    kind: "provider_fee_confirmed_fact",
    schemaVersion: 1,
    providerFeeId: `fee-${feeType}`,
    version: 2,
    feeType,
    arcProviderAccountId: "arc-live",
    ...(feeType === "acquiring"
      ? { providerPaymentId: "payment-1" }
      : { chargebackCaseId: "chargeback-1" }),
    amount: { amountMinor: 250, currency: "RUB" },
    occurredAt: "2026-08-03T10:00:00Z",
    observedAt: "2026-08-03T10:00:01Z",
    integrityStatus: "unverified",
    digestPurpose: "drift_detection_only"
  });
}

function returnedFact(
  original: ProviderFeeConfirmedFact,
  change: Partial<Omit<ProviderFeeReturnedFact, "canonicalDigest">> = {}
): ProviderFeeReturnedFact {
  return bindReturned({
    kind: "provider_fee_returned_fact",
    schemaVersion: 1,
    providerFeeReturnId: `return-${original.providerFeeId}`,
    version: 1,
    feeType: original.feeType,
    arcProviderAccountId: original.arcProviderAccountId,
    ...("providerPaymentId" in original
      ? { providerPaymentId: original.providerPaymentId }
      : { chargebackCaseId: original.chargebackCaseId }),
    originalFeeRef: {
      providerFeeId: original.providerFeeId,
      version: original.version,
      canonicalDigest: original.canonicalDigest
    },
    amount: original.amount,
    occurredAt: "2026-08-03T11:00:00Z",
    observedAt: "2026-08-03T11:00:01Z",
    integrityStatus: "unverified",
    digestPurpose: "drift_detection_only",
    ...change
  });
}

function bindConfirmed(
  input: Omit<ProviderFeeConfirmedFact, "canonicalDigest"> | ProviderFeeConfirmedFact
) {
  const core = withoutDigest(input);
  return { ...core, canonicalDigest: hashFinanceCommandPayload(core) } as ProviderFeeConfirmedFact;
}

function bindReturned(
  input: Omit<ProviderFeeReturnedFact, "canonicalDigest"> | ProviderFeeReturnedFact
) {
  const core = withoutDigest(input);
  return { ...core, canonicalDigest: hashFinanceCommandPayload(core) } as ProviderFeeReturnedFact;
}

function withoutDigest<T extends object>(input: T): Omit<T, "canonicalDigest"> {
  const copy = { ...input };
  Reflect.deleteProperty(copy, "canonicalDigest");
  return copy;
}

function allLinksNull(links: Record<string, string | null>) {
  return Object.values(links).every((value) => value === null);
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
