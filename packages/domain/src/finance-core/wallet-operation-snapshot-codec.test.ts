import { describe, expect, it } from "vitest";
import {
  compareUnverifiedWalletOperation,
  createUnverifiedWalletOperationComparisonSnapshot,
  rehydrateUnverifiedWalletOperationComparisonSnapshot,
  unverifiedWalletProjectionPolicyInput
} from "./wallet-operation-boundary.fixture";
import {
  createUnverifiedWalletOperationComparisonSnapshot as createSnapshotWithBoundary,
  createUnverifiedWalletProjectionLimitPolicySnapshot as createPolicyWithBoundary,
  WalletOperationProjectionIntegrityError
} from "./wallet-operation-projection";
import {
  links,
  payoutFixture,
  payoutSnapshotInput,
  projectionLimitPolicy,
  sha,
  wallet,
  walletProjectionDecoderEnvelope
} from "./wallet-operation-projection.fixture";

describe("unverified wallet-operation snapshot codec", () => {
  it("round-trips a persisted unverified comparison snapshot and rejects digest drift", () => {
    const snapshot = createUnverifiedWalletOperationComparisonSnapshot(payoutSnapshotInput());
    const persisted = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;

    const rehydrated = rehydrateUnverifiedWalletOperationComparisonSnapshot(persisted);

    expect(rehydrated).toEqual(snapshot);
    expect(rehydrated.authorizationStatus).toBe("unverified");
    expect(Object.isFrozen(rehydrated)).toBe(true);
    expect(Object.isFrozen(rehydrated.sourceKey)).toBe(true);
    expect(Object.isFrozen(rehydrated.unverifiedLimitPolicy)).toBe(true);
    expect(Object.isFrozen(rehydrated.authorityRefs)).toBe(true);
    expect(Object.isFrozen(rehydrated.authorityRefs[0])).toBe(true);
    expect(Object.isFrozen(rehydrated.economicEdges)).toBe(true);
    expect(Object.isFrozen(rehydrated.economicEdges[0]?.links)).toBe(true);
    expect(() =>
      rehydrateUnverifiedWalletOperationComparisonSnapshot({
        ...persisted,
        historyRecordDigest: sha("d")
      })
    ).toThrowError(WalletOperationProjectionIntegrityError);
  });

  it.each([
    ["policyId", "wallet-projection-other"],
    ["version", "4"],
    ["effectiveAt", "2026-07-31T00:00:00Z"],
    ["maxEconomicEdgesPerOperation", "63"],
    ["maxAuthorityRefsPerOperation", "15"]
  ] as const)(
    "fails closed when resolved-policy %s differs from the embedded policy",
    (field, value) => {
      const embeddedPolicy = projectionLimitPolicy();
      const differentlyResolvedPolicy = projectionLimitPolicy({ [field]: value });

      expectIntegrityReason(
        () =>
          createSnapshotWithBoundary(
            payoutSnapshotInput({ unverifiedLimitPolicy: embeddedPolicy }),
            walletProjectionDecoderEnvelope,
            differentlyResolvedPolicy
          ),
        "resolved_policy_mismatch"
      );
    }
  );

  it("rejects a resolved policy whose effectiveAt is after the operation occurredAt", () => {
    const futurePolicy = projectionLimitPolicy({ effectiveAt: "2026-08-04T00:00:00Z" });

    expectIntegrityReason(
      () =>
        createSnapshotWithBoundary(
          payoutSnapshotInput({ unverifiedLimitPolicy: futurePolicy }),
          walletProjectionDecoderEnvelope,
          futurePolicy
        ),
      "policy_not_effective"
    );
  });

  it("keeps authority references as unique identities and never interprets approval policy", () => {
    const authority = {
      kind: "payout_request",
      authorityId: "payout-request-authority-1",
      version: "1",
      canonicalDigest: sha("e")
    };
    expect(() =>
      createUnverifiedWalletOperationComparisonSnapshot(payoutSnapshotInput({ authorityRefs: [] }))
    ).toThrowError(WalletOperationProjectionIntegrityError);
    expect(() =>
      createUnverifiedWalletOperationComparisonSnapshot(
        payoutSnapshotInput({ authorityRefs: [authority, { ...authority }] })
      )
    ).toThrowError(WalletOperationProjectionIntegrityError);
    expect(() =>
      createUnverifiedWalletOperationComparisonSnapshot(
        payoutSnapshotInput({
          authorityRefs: [{ ...authority, policyDecision: "approved" }]
        })
      )
    ).toThrowError(WalletOperationProjectionIntegrityError);

    const snapshot = createUnverifiedWalletOperationComparisonSnapshot(payoutSnapshotInput());
    expect(snapshot.authorizationStatus).toBe("unverified");
    expect(snapshot.authorityRefs[0]).toEqual(authority);
  });

  it("rejects authority accessors and sparse authority arrays without invoking accessors", () => {
    let getterInvoked = false;
    const hostileAuthority = {
      kind: "payout_request",
      authorityId: "payout-request-authority-1",
      version: "1",
      canonicalDigest: sha("e")
    };
    Object.defineProperty(hostileAuthority, "authorityId", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "hostile";
      }
    });
    const sparseAuthorities = Array<unknown>(2);
    sparseAuthorities[0] = {
      kind: "payout_request",
      authorityId: "payout-request-authority-1",
      version: "1",
      canonicalDigest: sha("e")
    };

    expect(() =>
      createUnverifiedWalletOperationComparisonSnapshot(
        payoutSnapshotInput({ authorityRefs: [hostileAuthority] })
      )
    ).toThrowError(WalletOperationProjectionIntegrityError);
    expect(getterInvoked).toBe(false);
    expect(() =>
      createUnverifiedWalletOperationComparisonSnapshot(
        payoutSnapshotInput({ authorityRefs: sparseAuthorities })
      )
    ).toThrowError(WalletOperationProjectionIntegrityError);
  });

  it("rejects top-level accessors and symbol keys without invoking accessors", () => {
    let getterInvoked = false;
    const accessorInput = payoutSnapshotInput();
    Object.defineProperty(accessorInput, "snapshotId", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "hostile";
      }
    });
    const symbolInput = payoutSnapshotInput();
    Object.defineProperty(symbolInput, Symbol("hidden"), { value: true, enumerable: true });

    expect(() => createUnverifiedWalletOperationComparisonSnapshot(accessorInput)).toThrowError(
      WalletOperationProjectionIntegrityError
    );
    expect(getterInvoked).toBe(false);
    expect(() => createUnverifiedWalletOperationComparisonSnapshot(symbolInput)).toThrowError(
      WalletOperationProjectionIntegrityError
    );
  });

  it("rejects hostile proxies and sparse economic-edge arrays", () => {
    const proxy = new Proxy(payoutSnapshotInput(), {
      ownKeys() {
        throw new Error("hostile ownKeys trap");
      }
    });
    const baselineEdges = payoutSnapshotInput().economicEdges as readonly unknown[];
    const sparseEdges = Array<unknown>(2);
    sparseEdges[0] = baselineEdges[0];

    expect(() => createUnverifiedWalletOperationComparisonSnapshot(proxy)).toThrowError(
      WalletOperationProjectionIntegrityError
    );
    expect(() =>
      createUnverifiedWalletOperationComparisonSnapshot(
        payoutSnapshotInput({ economicEdges: sparseEdges })
      )
    ).toThrowError(WalletOperationProjectionIntegrityError);
  });

  it("enforces the envelope length before array-key reflection or element iteration", () => {
    const narrowEnvelope = Object.freeze({
      maxEconomicEdges: 2,
      maxAuthorityRefs: 1,
      maxJournalEntries: 4,
      maxDecimalDigits: 128
    });
    const narrowPolicy = createPolicyWithBoundary(
      {
        ...unverifiedWalletProjectionPolicyInput(),
        maxEconomicEdgesPerOperation: "2",
        maxAuthorityRefsPerOperation: "1"
      },
      narrowEnvelope
    );
    const baselineEdges = payoutSnapshotInput().economicEdges as readonly Record<string, unknown>[];
    let elementGetterInvoked = false;
    const oversizedEdges = Array<unknown>(3);
    for (let index = 0; index < oversizedEdges.length; index += 1) {
      Object.defineProperty(oversizedEdges, String(index), {
        enumerable: true,
        configurable: true,
        get() {
          elementGetterInvoked = true;
          return baselineEdges[index % baselineEdges.length];
        }
      });
    }

    expectIntegrityReason(
      () =>
        createSnapshotWithBoundary(
          payoutSnapshotInput({
            unverifiedLimitPolicy: narrowPolicy,
            economicEdges: oversizedEdges
          }),
          narrowEnvelope,
          narrowPolicy
        ),
      "decoder_envelope_exceeded"
    );
    expect(elementGetterInvoked).toBe(false);

    let ownKeysTrapCount = 0;
    let descriptorTrapCount = 0;
    const proxyEdges = new Proxy([...baselineEdges], {
      ownKeys(target) {
        ownKeysTrapCount += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, property) {
        descriptorTrapCount += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });
    expect(() =>
      createSnapshotWithBoundary(
        payoutSnapshotInput({
          unverifiedLimitPolicy: narrowPolicy,
          economicEdges: proxyEdges
        }),
        narrowEnvelope,
        narrowPolicy
      )
    ).toThrowError(WalletOperationProjectionIntegrityError);
    expect(ownKeysTrapCount).toBe(0);
    expect(descriptorTrapCount).toBe(0);
  });

  it("rejects nested hostile amount and link records without invoking their accessors", () => {
    const baselineEdges = payoutSnapshotInput().economicEdges as readonly Record<string, unknown>[];
    const baselineEdge = baselineEdges[0]!;
    let amountGetterInvoked = false;
    let linkGetterInvoked = false;
    const hostileAmount = { amountMinor: 8_000, currency: "RUB" };
    Object.defineProperty(hostileAmount, "amountMinor", {
      enumerable: true,
      get() {
        amountGetterInvoked = true;
        return 8_000;
      }
    });
    const hostileLinks = { ...links };
    Object.defineProperty(hostileLinks, "componentId", {
      enumerable: true,
      get() {
        linkGetterInvoked = true;
        return "payable-order-1";
      }
    });
    const amountProxy = new Proxy(
      { amountMinor: 8_000, currency: "RUB" },
      {
        ownKeys() {
          throw new Error("hostile nested amount");
        }
      }
    );
    const linksWithSymbol = { ...links };
    Object.defineProperty(linksWithSymbol, Symbol("hidden"), {
      enumerable: true,
      value: "hostile"
    });

    for (const edge of [
      { ...baselineEdge, amount: hostileAmount },
      { ...baselineEdge, links: hostileLinks },
      { ...baselineEdge, amount: amountProxy },
      { ...baselineEdge, links: linksWithSymbol }
    ]) {
      expect(() =>
        createUnverifiedWalletOperationComparisonSnapshot(
          payoutSnapshotInput({ economicEdges: [edge] })
        )
      ).toThrowError(WalletOperationProjectionIntegrityError);
    }
    expect(amountGetterInvoked).toBe(false);
    expect(linkGetterInvoked).toBe(false);
  });

  it.each(["01", "+1", "1.0", "1e3", "-1", 1])(
    "rejects non-canonical wallet, operation, and authority revision %s",
    (invalidRevision) => {
      const baseline = payoutFixture();
      expect(() =>
        compareUnverifiedWalletOperation({
          ...baseline,
          previousWallet: { ...baseline.previousWallet, revision: invalidRevision }
        })
      ).toThrowError(WalletOperationProjectionIntegrityError);
      expect(() =>
        createUnverifiedWalletOperationComparisonSnapshot(
          payoutSnapshotInput({ previousWalletRevision: invalidRevision })
        )
      ).toThrowError(WalletOperationProjectionIntegrityError);
      expect(() =>
        createUnverifiedWalletOperationComparisonSnapshot(
          payoutSnapshotInput({
            authorityRefs: [
              {
                kind: "payout_request",
                authorityId: "payout-request-authority-1",
                version: invalidRevision,
                canonicalDigest: sha("e")
              }
            ]
          })
        )
      ).toThrowError(WalletOperationProjectionIntegrityError);
    }
  );

  it.each(["01", "+1", "1.0", "1e3", "-0"])(
    "rejects non-canonical BigInt balance string %s",
    (invalidMinor) => {
      const baseline = payoutFixture();
      expect(() =>
        compareUnverifiedWalletOperation({
          ...baseline,
          previousWallet: wallet("7", { availableMinor: invalidMinor })
        })
      ).toThrowError(WalletOperationProjectionIntegrityError);
    }
  );

  it("rejects mixed or unsupported currency before comparison", () => {
    expect(() =>
      createUnverifiedWalletOperationComparisonSnapshot(payoutSnapshotInput({ currency: "USD" }))
    ).toThrowError(WalletOperationProjectionIntegrityError);
    const baselineEdges = payoutSnapshotInput().economicEdges as readonly Record<string, unknown>[];
    expect(() =>
      createUnverifiedWalletOperationComparisonSnapshot(
        payoutSnapshotInput({
          economicEdges: [
            {
              ...baselineEdges[0],
              amount: { amountMinor: 8_000, currency: "USD" }
            }
          ]
        })
      )
    ).toThrowError(WalletOperationProjectionIntegrityError);
    const baseline = payoutFixture();
    expect(() =>
      compareUnverifiedWalletOperation({
        ...baseline,
        nextWallet: { ...baseline.nextWallet, currency: "USD" }
      })
    ).toThrowError(WalletOperationProjectionIntegrityError);
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unrepresentable economic-edge amount %s",
    (amountMinor) => {
      const baselineEdges = payoutSnapshotInput().economicEdges as readonly Record<
        string,
        unknown
      >[];
      expect(() =>
        createUnverifiedWalletOperationComparisonSnapshot(
          payoutSnapshotInput({
            economicEdges: [
              {
                ...baselineEdges[0],
                amount: { amountMinor, currency: "RUB" }
              }
            ]
          })
        )
      ).toThrowError(WalletOperationProjectionIntegrityError);
    }
  );
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
