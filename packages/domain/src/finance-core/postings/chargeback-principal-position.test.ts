import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  assertChargebackPrincipalPositionPriorResolved,
  FinancePostingIntegrityError,
  readUnverifiedChargebackPrincipalPositionTransitionBinding
} from "./chargeback-principal-position";
import {
  chargebackPrincipalPositionInput,
  nextChargebackPrincipalPositionInput,
  rehashChargebackPrincipalPosition
} from "./chargeback-principal-position-test-fixtures";
import { postingDecoderEnvelope } from "./posting-test-primitives";

function decode(input: unknown) {
  return readUnverifiedChargebackPrincipalPositionTransitionBinding(input, postingDecoderEnvelope);
}

function expectPostingError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected posting integrity error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}

describe("chargeback principal position transition", () => {
  it("decodes a bounded B = prior + H + O + E + U position transition", () => {
    const decoded = decode(chargebackPrincipalPositionInput());
    expect(decoded).toMatchObject({
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      expectedPositionVersion: "0",
      nextPositionVersion: "1",
      caseExposure: {
        disputedPrincipal: { amountMinor: 5_000 },
        allocatedBefore: { amountMinor: 0 },
        payableDelta: { amountMinor: 2_000 },
        recoveryDelta: { amountMinor: 500 },
        platformDelta: { amountMinor: 500 },
        allocationDelta: { amountMinor: 3_000 },
        allocatedAfter: { amountMinor: 3_000 },
        unallocatedAfter: { amountMinor: 2_000 }
      }
    });
    expect(Object.isFrozen(decoded.recoveryPositions)).toBe(true);
  });

  it("rejects recovery over-consumption and same-actor treatment approval", () => {
    const fixture = chargebackPrincipalPositionInput();
    const recovery = fixture.recoveryPositions[0];
    if (!recovery) throw new Error("missing recovery position");
    expectPostingError(
      () =>
        decode(
          rehashChargebackPrincipalPosition({
            ...fixture,
            recoveryPositions: [
              {
                ...recovery,
                consumedAfter: { amountMinor: 900, currency: "RUB" },
                remainingAfter: { amountMinor: 0, currency: "RUB" }
              }
            ]
          })
        ),
      "amount_mismatch"
    );
    const decisionCore: Record<string, unknown> = {
      ...recovery.treatmentDecision,
      approvedByActorUserId: recovery.treatmentDecision.proposedByActorUserId
    };
    Reflect.deleteProperty(decisionCore, "canonicalDigest");
    const treatmentDecision = {
      ...decisionCore,
      canonicalDigest: hashFinanceCommandPayload(decisionCore)
    };
    expectPostingError(
      () =>
        decode(
          rehashChargebackPrincipalPosition({
            ...fixture,
            recoveryPositions: [{ ...recovery, treatmentDecision }]
          })
        ),
      "authority_mismatch"
    );
  });

  it("rejects a platform position that loses commission conservation", () => {
    const fixture = chargebackPrincipalPositionInput();
    const position = fixture.platformPositions[0];
    if (!position) throw new Error("missing platform position");
    expectPostingError(
      () =>
        decode(
          rehashChargebackPrincipalPosition({
            ...fixture,
            platformPositions: [
              {
                ...position,
                revenueRemainingAfter: { amountMinor: 600, currency: "RUB" }
              }
            ]
          })
        ),
      "amount_mismatch"
    );
  });

  it("requires an exact adjacent snapshot and carries every prior source position", () => {
    const prior = decode(chargebackPrincipalPositionInput());
    const current = decode(nextChargebackPrincipalPositionInput());
    expect(() => assertChargebackPrincipalPositionPriorResolved(current, prior)).not.toThrow();
    expectPostingError(
      () =>
        assertChargebackPrincipalPositionPriorResolved(
          decode(
            nextChargebackPrincipalPositionInput(undefined, {
              recoveryPositions: []
            })
          ),
          prior
        ),
      "authority_mismatch"
    );
  });

  it.each([
    ["series", { seriesId: "arc-series-other" }],
    ["identity version", { identityVersion: 2 }]
  ] as const)("rejects same-ID provider %s drift across position history", (_label, drift) => {
    const prior = decode(chargebackPrincipalPositionInput());
    const candidate = nextChargebackPrincipalPositionInput();
    const current = decode(
      rehashChargebackPrincipalPosition({
        ...candidate,
        confirmedBasis: {
          ...candidate.confirmedBasis,
          providerAccount: {
            ...candidate.confirmedBasis.providerAccount,
            ...drift
          }
        }
      })
    );

    expectPostingError(
      () => assertChargebackPrincipalPositionPriorResolved(current, prior),
      "authority_mismatch"
    );
  });

  it("does not let an existing platform-loss position change its source identity", () => {
    const priorInput = chargebackPrincipalPositionInput();
    const priorPlatform = priorInput.platformPositions[0];
    if (!priorPlatform || priorPlatform.kind !== "platform_commission_reversal") {
      throw new Error("missing platform position fixture");
    }
    const lossDecisionCore = {
      ...priorInput.recoveryPositions[0]?.treatmentDecision,
      decisionId: "decision-platform-loss-position",
      positionId: "platform-loss-position",
      treatment: "platform_loss" as const,
      approvedAmount: { amountMinor: 500, currency: "RUB" as const }
    };
    Reflect.deleteProperty(lossDecisionCore, "canonicalDigest");
    const treatmentDecision = {
      ...lossDecisionCore,
      canonicalDigest: hashFinanceCommandPayload(lossDecisionCore)
    };
    const platformLoss = {
      kind: "platform_loss" as const,
      positionId: "platform-loss-position",
      originalSaleId: priorInput.orderId,
      componentId: "platform-loss-component",
      sourceCapacity: { amountMinor: 500, currency: "RUB" as const },
      consumedBefore: { amountMinor: 0, currency: "RUB" as const },
      currentDelta: { amountMinor: 500, currency: "RUB" as const },
      consumedAfter: { amountMinor: 500, currency: "RUB" as const },
      remainingAfter: { amountMinor: 0, currency: "RUB" as const },
      treatmentDecision
    };
    const prior = decode(
      rehashChargebackPrincipalPosition({
        ...priorInput,
        caseExposure: {
          ...priorInput.caseExposure,
          platformDelta: { amountMinor: 500, currency: "RUB" },
          allocationDelta: { amountMinor: 3_000, currency: "RUB" }
        },
        platformPositions: [platformLoss]
      })
    );
    const currentInput = nextChargebackPrincipalPositionInput(undefined, {
      previousBindingRef: {
        bindingId: prior.bindingId,
        nextPositionVersion: prior.nextPositionVersion,
        bindingDigest: prior.bindingDigest
      },
      platformPositions: [
        {
          ...platformLoss,
          componentId: "foreign-platform-loss-component",
          consumedBefore: platformLoss.consumedAfter,
          currentDelta: { amountMinor: 0, currency: "RUB" },
          consumedAfter: platformLoss.consumedAfter,
          remainingAfter: platformLoss.remainingAfter
        }
      ]
    });
    const current = decode(currentInput);
    expectPostingError(
      () => assertChargebackPrincipalPositionPriorResolved(current, prior),
      "authority_mismatch"
    );
  });

  it("rejects a Proxy before executing reflective traps", () => {
    let trapCalls = 0;
    const input = new Proxy(chargebackPrincipalPositionInput(), {
      ownKeys(target) {
        trapCalls += 1;
        return Reflect.ownKeys(target);
      }
    });
    expectPostingError(() => decode(input), "invalid_shape");
    expect(trapCalls).toBe(0);
  });
});
