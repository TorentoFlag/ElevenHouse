import { describe, expect, it } from "vitest";
import { createFinanceJournalTransaction } from "./journal";
import {
  createUnverifiedWalletOperationComparisonSnapshot,
  rehydrateWalletProjectionLimitPolicy,
  unverifiedWalletProjectionPolicyInput
} from "./wallet-operation-boundary.fixture";
import {
  compareUnverifiedWalletOperation as compareWithBoundary,
  createUnverifiedWalletOperationComparisonSnapshot as createSnapshotWithBoundary,
  createUnverifiedWalletProjectionLimitPolicySnapshot as createPolicyWithBoundary,
  createWalletOperationCommitBindingRecord as createBindingWithBoundary,
  rehydrateUnverifiedWalletOperationComparisonSnapshot as rehydrateSnapshotWithBoundary,
  rehydrateUnverifiedWalletProjectionLimitPolicySnapshot as rehydratePolicyWithBoundary,
  rehydrateWalletOperationCommitBindingRecord as rehydrateBindingWithBoundary,
  WalletOperationProjectionIntegrityError
} from "./wallet-operation-projection";
import {
  links,
  outboundAccount,
  payoutFixture,
  payoutSnapshotInput,
  projectionLimitPolicy,
  sha,
  walletProjectionDecoderEnvelope
} from "./wallet-operation-projection.fixture";

describe("wallet-operation decoder envelope and limit-policy codec", () => {
  it("requires the decoder envelope at every public create, rehydrate, compare, and binding entry", () => {
    const baseline = payoutFixture();
    const policyInput = unverifiedWalletProjectionPolicyInput();
    const callsWithoutEnvelope: readonly (() => unknown)[] = [
      () => (createPolicyWithBoundary as unknown as (input: unknown) => unknown)(policyInput),
      () =>
        (rehydratePolicyWithBoundary as unknown as (input: unknown) => unknown)(
          baseline.operationSnapshot.unverifiedLimitPolicy
        ),
      () =>
        (createSnapshotWithBoundary as unknown as (input: unknown) => unknown)(
          payoutSnapshotInput()
        ),
      () =>
        (rehydrateSnapshotWithBoundary as unknown as (input: unknown) => unknown)(
          baseline.operationSnapshot
        ),
      () =>
        (createBindingWithBoundary as unknown as (input: unknown) => unknown)(
          baseline.commitBinding
        ),
      () =>
        (rehydrateBindingWithBoundary as unknown as (input: unknown) => unknown)(
          baseline.commitBinding
        ),
      () => (compareWithBoundary as unknown as (input: unknown) => unknown)(baseline)
    ];

    for (const call of callsWithoutEnvelope) {
      expectIntegrityReason(call, "decoder_envelope_required");
    }

    const compileTimeOnly = () => {
      // @ts-expect-error decoder envelope is required
      createPolicyWithBoundary(policyInput);
      // @ts-expect-error decoder envelope is required
      rehydratePolicyWithBoundary(baseline.operationSnapshot.unverifiedLimitPolicy);
      // @ts-expect-error decoder envelope and resolved policy are required
      createSnapshotWithBoundary(payoutSnapshotInput());
      // @ts-expect-error decoder envelope and resolved policy are required
      rehydrateSnapshotWithBoundary(baseline.operationSnapshot);
      // @ts-expect-error decoder envelope and resolved policy are required
      createBindingWithBoundary(baseline.commitBinding);
      // @ts-expect-error decoder envelope and resolved policy are required
      rehydrateBindingWithBoundary(baseline.commitBinding);
      // @ts-expect-error decoder envelope and resolved policy are required
      compareWithBoundary(baseline);
      // @ts-expect-error resolved policy is required
      createSnapshotWithBoundary(payoutSnapshotInput(), walletProjectionDecoderEnvelope);
      // @ts-expect-error resolved policy is required
      rehydrateSnapshotWithBoundary(baseline.operationSnapshot, walletProjectionDecoderEnvelope);
      // @ts-expect-error resolved policy is required
      createBindingWithBoundary(baseline.commitBinding, walletProjectionDecoderEnvelope);
      // @ts-expect-error resolved policy is required
      rehydrateBindingWithBoundary(baseline.commitBinding, walletProjectionDecoderEnvelope);
      // @ts-expect-error resolved policy is required
      compareWithBoundary(baseline, walletProjectionDecoderEnvelope);
    };
    expect(compileTimeOnly).toBeTypeOf("function");
  });

  it("requires an out-of-band resolved policy for every operation and binding entry", () => {
    const baseline = payoutFixture();
    const callsWithoutPolicy: readonly (() => unknown)[] = [
      () =>
        (
          createSnapshotWithBoundary as unknown as (
            input: unknown,
            envelope: typeof walletProjectionDecoderEnvelope
          ) => unknown
        )(payoutSnapshotInput(), walletProjectionDecoderEnvelope),
      () =>
        (
          rehydrateSnapshotWithBoundary as unknown as (
            input: unknown,
            envelope: typeof walletProjectionDecoderEnvelope
          ) => unknown
        )(baseline.operationSnapshot, walletProjectionDecoderEnvelope),
      () =>
        (
          createBindingWithBoundary as unknown as (
            input: unknown,
            envelope: typeof walletProjectionDecoderEnvelope
          ) => unknown
        )(baseline.commitBinding, walletProjectionDecoderEnvelope),
      () =>
        (
          rehydrateBindingWithBoundary as unknown as (
            input: unknown,
            envelope: typeof walletProjectionDecoderEnvelope
          ) => unknown
        )(baseline.commitBinding, walletProjectionDecoderEnvelope),
      () =>
        (
          compareWithBoundary as unknown as (
            input: unknown,
            envelope: typeof walletProjectionDecoderEnvelope
          ) => unknown
        )(baseline, walletProjectionDecoderEnvelope)
    ];

    for (const call of callsWithoutPolicy) {
      expectIntegrityReason(call, "resolved_policy_required");
    }
  });

  it("round-trips the exact immutable limit-policy snapshot and rejects digest drift", () => {
    const policy = projectionLimitPolicy();
    const persisted = JSON.parse(JSON.stringify(policy)) as Record<string, unknown>;

    const rehydrated = rehydrateWalletProjectionLimitPolicy(persisted);

    expect(rehydrated).toEqual(policy);
    expect(rehydrated).toEqual({
      policyId: "wallet-projection-standard",
      version: "3",
      effectiveAt: "2026-08-01T00:00:00Z",
      maxEconomicEdgesPerOperation: "64",
      maxAuthorityRefsPerOperation: "16",
      canonicalDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    expect(Object.isFrozen(rehydrated)).toBe(true);
    expect(() =>
      rehydrateWalletProjectionLimitPolicy({
        ...persisted,
        maxEconomicEdgesPerOperation: "65"
      })
    ).toThrowError(WalletOperationProjectionIntegrityError);
  });

  it.each(["01", "+1", "1.0", "1e3", "-1", 1])(
    "rejects non-canonical unsigned policy revision %s",
    (invalidRevision) => {
      expect(() => projectionLimitPolicy({ version: invalidRevision })).toThrowError(
        WalletOperationProjectionIntegrityError
      );
    }
  );

  it.each(["01", "+1", "1.0", "1e3", "-1", 1])(
    "rejects non-canonical unsigned policy maximum %s",
    (invalidMaximum) => {
      expect(() =>
        projectionLimitPolicy({ maxEconomicEdgesPerOperation: invalidMaximum })
      ).toThrowError(WalletOperationProjectionIntegrityError);
      expect(() =>
        projectionLimitPolicy({ maxAuthorityRefsPerOperation: invalidMaximum })
      ).toThrowError(WalletOperationProjectionIntegrityError);
    }
  );

  it.each([
    { maxEconomicEdges: -1, maxAuthorityRefs: 16, maxJournalEntries: 4, maxDecimalDigits: 128 },
    {
      maxEconomicEdges: Number.POSITIVE_INFINITY,
      maxAuthorityRefs: 16,
      maxJournalEntries: 4,
      maxDecimalDigits: 128
    },
    {
      maxEconomicEdges: 64,
      maxAuthorityRefs: Number.MAX_SAFE_INTEGER + 1,
      maxJournalEntries: 4,
      maxDecimalDigits: 128
    },
    { maxEconomicEdges: 64, maxAuthorityRefs: 16, maxJournalEntries: -1, maxDecimalDigits: 128 },
    { maxEconomicEdges: 64, maxAuthorityRefs: 16, maxJournalEntries: 4, maxDecimalDigits: -1 },
    { maxEconomicEdges: 64.5, maxAuthorityRefs: 16, maxJournalEntries: 4, maxDecimalDigits: 128 }
  ])("rejects an invalid trusted decoder envelope %#", (invalidEnvelope) => {
    expectIntegrityReason(
      () => createPolicyWithBoundary(unverifiedWalletProjectionPolicyInput(), invalidEnvelope),
      "invalid_field"
    );
  });

  it("rejects policy maxima that exceed the trusted decoder envelope", () => {
    expectIntegrityReason(
      () =>
        createPolicyWithBoundary(
          {
            ...unverifiedWalletProjectionPolicyInput(),
            maxEconomicEdgesPerOperation: "65"
          },
          walletProjectionDecoderEnvelope
        ),
      "decoder_envelope_exceeded"
    );
    expectIntegrityReason(
      () =>
        createPolicyWithBoundary(
          {
            ...unverifiedWalletProjectionPolicyInput(),
            maxAuthorityRefsPerOperation: "17"
          },
          walletProjectionDecoderEnvelope
        ),
      "decoder_envelope_exceeded"
    );
  });

  it("bounds decimal strings before regex or BigInt conversion", () => {
    const narrowEnvelope = Object.freeze({
      maxEconomicEdges: 64,
      maxAuthorityRefs: 16,
      maxJournalEntries: 4,
      maxDecimalDigits: 4
    });
    const narrowPolicy = createPolicyWithBoundary(
      {
        ...unverifiedWalletProjectionPolicyInput(),
        version: "3",
        maxEconomicEdgesPerOperation: "64",
        maxAuthorityRefsPerOperation: "16"
      },
      narrowEnvelope
    );
    const digitBomb = "9".repeat(5);

    expectIntegrityReason(
      () =>
        createSnapshotWithBoundary(
          payoutSnapshotInput({
            unverifiedLimitPolicy: narrowPolicy,
            previousWalletRevision: digitBomb
          }),
          narrowEnvelope,
          narrowPolicy
        ),
      "decoder_envelope_exceeded"
    );

    const baseline = payoutFixture();
    expectIntegrityReason(
      () =>
        compareWithBoundary(
          {
            ...baseline,
            previousWallet: {
              ...baseline.previousWallet,
              balances: { ...baseline.previousWallet.balances, availableMinor: digitBomb }
            }
          },
          narrowEnvelope,
          narrowPolicy
        ),
      "decoder_envelope_exceeded"
    );
  });

  it("rejects an oversized journal-entry array before handing it to the journal constructor", () => {
    const baseline = payoutFixture();
    const oversizedJournal = createFinanceJournalTransaction({
      id: baseline.journalTransaction.id,
      sourceKey: baseline.journalTransaction.sourceKey,
      occurredAt: baseline.journalTransaction.occurredAt,
      postedAt: baseline.journalTransaction.postedAt,
      reversesTransactionId: null,
      entries: [
        ...baseline.journalTransaction.entries,
        {
          account: outboundAccount,
          side: "debit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: { ...links, componentId: "non-wallet-1" }
        },
        {
          account: outboundAccount,
          side: "credit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: { ...links, componentId: "non-wallet-1" }
        },
        {
          account: outboundAccount,
          side: "debit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: { ...links, componentId: "non-wallet-2" }
        },
        {
          account: outboundAccount,
          side: "credit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: { ...links, componentId: "non-wallet-2" }
        }
      ]
    });

    expectIntegrityReason(
      () =>
        compareWithBoundary(
          { ...baseline, journalTransaction: oversizedJournal },
          walletProjectionDecoderEnvelope,
          baseline.operationSnapshot.unverifiedLimitPolicy
        ),
      "decoder_envelope_exceeded"
    );
  });

  it("accepts zero as an unsigned policy value and enforces it from the snapshot", () => {
    const zeroPolicy = projectionLimitPolicy({
      version: "0",
      maxEconomicEdgesPerOperation: "0",
      maxAuthorityRefsPerOperation: "1"
    });
    const snapshot = createUnverifiedWalletOperationComparisonSnapshot(
      payoutSnapshotInput({ unverifiedLimitPolicy: zeroPolicy, economicEdges: [] })
    );

    expect(snapshot.unverifiedLimitPolicy.version).toBe("0");
    expect(snapshot.economicEdges).toEqual([]);
  });

  it("uses the policy maxima instead of an invented module-wide ceiling", () => {
    const oneEdgePolicy = projectionLimitPolicy({ maxEconomicEdgesPerOperation: "1" });
    const oneAuthorityPolicy = projectionLimitPolicy({ maxAuthorityRefsPerOperation: "1" });
    const baselineAuthorities = payoutSnapshotInput().authorityRefs as readonly Record<
      string,
      unknown
    >[];

    expectIntegrityReason(
      () =>
        createUnverifiedWalletOperationComparisonSnapshot(
          payoutSnapshotInput({ unverifiedLimitPolicy: oneEdgePolicy })
        ),
      "limit_policy_exceeded"
    );
    expectIntegrityReason(
      () =>
        createUnverifiedWalletOperationComparisonSnapshot(
          payoutSnapshotInput({
            unverifiedLimitPolicy: oneAuthorityPolicy,
            authorityRefs: [
              ...baselineAuthorities,
              {
                kind: "payout_request",
                authorityId: "payout-request-authority-2",
                version: "1",
                canonicalDigest: sha("f")
              }
            ]
          })
        ),
      "limit_policy_exceeded"
    );
  });
});

function expectIntegrityReason(
  action: () => unknown,
  reason: WalletOperationProjectionIntegrityError["reason"]
): void {
  try {
    action();
    throw new Error("Expected wallet operation integrity failure");
  } catch (error) {
    expect(error).toBeInstanceOf(WalletOperationProjectionIntegrityError);
    expect((error as WalletOperationProjectionIntegrityError).reason).toBe(reason);
  }
}
