import { describe, expect, it } from "vitest";
import type { ClientSubscriptionTransitionReceipt } from "../client-subscriptions/client-subscription-events";
import {
  canStartAstroDiaryCycle,
  projectClientEntitlement,
  projectClientEntitlementBatch,
  type ClientEntitlement
} from "./client-entitlement-policy";

const receipt = (
  overrides: Partial<ClientSubscriptionTransitionReceipt> = {}
): ClientSubscriptionTransitionReceipt => ({
  source: "client_subscription_transition",
  transitionId: "transition-1",
  subscriptionId: "11111111-1111-4111-8111-111111111111",
  contractId: "22222222-2222-4222-8222-222222222222",
  relationshipId: "33333333-3333-4333-8333-333333333333",
  journalEpochId: "44444444-4444-4444-8444-444444444444",
  subscriptionVersion: 2,
  state: "active",
  entitlementState: "active",
  entitlementScope: "period",
  period: {
    id: "55555555-5555-4555-8555-555555555555",
    sequence: 1,
    startsAt: "2026-08-11T12:00:00Z",
    endsAt: "2026-09-11T12:00:00Z",
    anchor: {
      capturedAt: "2026-08-11T12:00:00Z",
      serviceTimezone: "Europe/Moscow",
      originSequence: 1,
      localDateTime: "2026-08-11T15:00:00"
    },
    resolvedStartLocal: "2026-08-11T15:00:00",
    resolvedStartOffset: "+03:00",
    resolvedEndLocal: "2026-09-11T15:00:00",
    resolvedEndOffset: "+03:00"
  },
  slotEffect: "retain",
  occurredAt: "2026-08-11T12:00:00Z",
  ...overrides
});

describe("client entitlement projection", () => {
  it("projects provider-neutral AstroDiary access only from a subscription receipt", () => {
    const result = projectClientEntitlement(null, receipt(), {
      entitlementId: "66666666-6666-4666-8666-666666666666"
    });
    expect(result).toMatchObject({
      outcome: "applied",
      entitlement: {
        id: "66666666-6666-4666-8666-666666666666",
        capability: "astro_diary",
        subscriptionId: "11111111-1111-4111-8111-111111111111",
        contractId: "22222222-2222-4222-8222-222222222222",
        relationshipId: "33333333-3333-4333-8333-333333333333",
        journalEpochId: "44444444-4444-4444-8444-444444444444",
        periodId: "55555555-5555-4555-8555-555555555555",
        startsAt: "2026-08-11T12:00:00Z",
        endsAt: "2026-09-11T12:00:00Z",
        state: "active",
        sourceSubscriptionVersion: 2,
        version: 1
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/provider|payment|attempt/i);
  });

  it.each(["ended", "revoked"] as const)(
    "closes the entitlement when the subscription is %s",
    (state) => {
      const activeResult = projectClientEntitlement(null, receipt(), {
        entitlementId: "entitlement-1"
      });
      if (activeResult.outcome !== "applied") throw new Error("entitlement must project");
      expect(
        projectClientEntitlement(
          activeResult.entitlement,
          receipt({
            transitionId: `transition-${state}`,
            state,
            entitlementState: state,
            subscriptionVersion: 3
          }),
          {
            entitlementId: "ignored"
          }
        )
      ).toMatchObject({
        outcome: "applied",
        entitlement: { id: "entitlement-1", state, sourceSubscriptionVersion: 3, version: 2 }
      });
    }
  );

  it("replays the same receipt, rejects stale order, and cannot mint access without a paid period", () => {
    const activeResult = projectClientEntitlement(null, receipt(), {
      entitlementId: "entitlement-1"
    });
    if (activeResult.outcome !== "applied") throw new Error("entitlement must project");
    expect(
      projectClientEntitlement(activeResult.entitlement, receipt(), { entitlementId: "ignored" })
    ).toMatchObject({ outcome: "idempotent", entitlement: activeResult.entitlement });
    expect(
      projectClientEntitlement(
        activeResult.entitlement,
        receipt({ transitionId: "stale", subscriptionVersion: 1 }),
        { entitlementId: "ignored" }
      )
    ).toEqual({ outcome: "stale_transition", currentSubscriptionVersion: 2 });
    expect(
      projectClientEntitlement(null, receipt({ period: null }), { entitlementId: "entitlement-2" })
    ).toEqual({ outcome: "no_paid_period" });
  });

  it("keeps grants per paid period instead of overwriting prior entitlement history", () => {
    const first = projectClientEntitlement(null, receipt(), {
      entitlementId: "entitlement-period-1"
    });
    if (first.outcome !== "applied") throw new Error("first period must project");
    const secondPeriodReceipt = receipt({
      transitionId: "transition-period-2",
      subscriptionVersion: 3,
      period: {
        ...receipt().period!,
        id: "77777777-7777-4777-8777-777777777777",
        sequence: 2,
        startsAt: "2026-09-11T12:00:00Z",
        endsAt: "2026-10-11T12:00:00Z"
      }
    });

    expect(
      projectClientEntitlement(first.entitlement, secondPeriodReceipt, {
        entitlementId: "entitlement-period-2"
      })
    ).toEqual({ outcome: "period_mismatch" });
    expect(
      projectClientEntitlement(null, secondPeriodReceipt, { entitlementId: "entitlement-period-2" })
    ).toMatchObject({
      outcome: "applied",
      entitlement: {
        id: "entitlement-period-2",
        periodId: "77777777-7777-4777-8777-777777777777",
        version: 1
      }
    });
    expect(first.entitlement.periodId).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("allows a new cycle only inside the active grant's half-open period", () => {
    const projected = projectClientEntitlement(null, receipt(), { entitlementId: "entitlement-1" });
    if (projected.outcome !== "applied") throw new Error("entitlement must project");
    expect(canStartAstroDiaryCycle(projected.entitlement, "2026-08-11T12:00:00Z")).toBe(true);
    expect(canStartAstroDiaryCycle(projected.entitlement, "2026-09-11T11:59:59.999Z")).toBe(true);
    expect(canStartAstroDiaryCycle(projected.entitlement, "2026-09-11T12:00:00Z")).toBe(false);
    expect(canStartAstroDiaryCycle(projected.entitlement, "2026-08-11T11:59:59.999Z")).toBe(false);
  });

  it("revokes current and future grants while preserving ended history and every period identity", () => {
    const ended = entitlementFor(
      receipt({
        transitionId: "transition-ended",
        subscriptionVersion: 3,
        entitlementState: "ended"
      }),
      "entitlement-ended"
    );
    const current = entitlementFor(receipt(), "entitlement-current");
    const future = entitlementFor(
      receipt({
        transitionId: "transition-future",
        subscriptionVersion: 3,
        period: {
          ...receipt().period!,
          id: "77777777-7777-4777-8777-777777777777",
          sequence: 2,
          startsAt: "2026-09-11T12:00:00Z",
          endsAt: "2026-10-11T12:00:00Z"
        }
      }),
      "entitlement-future"
    );

    expect(
      projectClientEntitlementBatch(
        [ended, current, future],
        receipt({
          transitionId: "transition-revoke-all",
          subscriptionVersion: 4,
          state: "revoked",
          entitlementState: "revoked",
          entitlementScope: "subscription_all",
          period: null,
          occurredAt: "2026-08-20T12:00:00Z"
        }),
        { entitlementId: "ignored" }
      )
    ).toMatchObject({
      outcome: "applied",
      entitlements: [
        {
          id: "entitlement-ended",
          periodId: "55555555-5555-4555-8555-555555555555",
          startsAt: "2026-08-11T12:00:00Z",
          endsAt: "2026-09-11T12:00:00Z",
          state: "ended",
          version: 1
        },
        {
          id: "entitlement-current",
          periodId: "55555555-5555-4555-8555-555555555555",
          startsAt: "2026-08-11T12:00:00Z",
          endsAt: "2026-09-11T12:00:00Z",
          state: "revoked",
          version: 2
        },
        {
          id: "entitlement-future",
          periodId: "77777777-7777-4777-8777-777777777777",
          startsAt: "2026-09-11T12:00:00Z",
          endsAt: "2026-10-11T12:00:00Z",
          state: "revoked",
          version: 2
        }
      ]
    });
  });

  it("rejects stale revoke-all receipts against active grants without letting ended history block current revocation", () => {
    const endedNewerHistory = entitlementFor(
      receipt({
        transitionId: "transition-ended-newer",
        subscriptionVersion: 8,
        entitlementState: "ended"
      }),
      "entitlement-ended-newer"
    );
    const activeNewer = entitlementFor(
      receipt({ transitionId: "transition-active-newer", subscriptionVersion: 5 }),
      "entitlement-active-newer"
    );
    const staleReceipt = receipt({
      transitionId: "transition-revoke-stale",
      subscriptionVersion: 4,
      state: "revoked",
      entitlementState: "revoked",
      entitlementScope: "subscription_all",
      period: null,
      occurredAt: "2026-08-20T12:00:00Z"
    });

    expect(
      projectClientEntitlementBatch([endedNewerHistory, activeNewer], staleReceipt, {
        entitlementId: "ignored"
      })
    ).toEqual({ outcome: "stale_transition", currentSubscriptionVersion: 5 });

    const freshReceipt = {
      ...staleReceipt,
      transitionId: "transition-revoke-fresh",
      subscriptionVersion: 6
    };
    expect(
      projectClientEntitlementBatch([endedNewerHistory, activeNewer], freshReceipt, {
        entitlementId: "ignored"
      })
    ).toMatchObject({
      outcome: "applied",
      entitlements: [
        { id: "entitlement-ended-newer", state: "ended", version: 1 },
        { id: "entitlement-active-newer", state: "revoked", version: 2 }
      ]
    });
  });
});

function entitlementFor(
  source: ClientSubscriptionTransitionReceipt,
  entitlementId: string
): ClientEntitlement {
  const result = projectClientEntitlement(null, source, { entitlementId });
  if (result.outcome !== "applied") throw new Error("entitlement must project");
  return result.entitlement;
}

// Compile-time ownership proof: no generic payment/provider grant is part of this projection.
const _providerNeutralShape: keyof ClientEntitlement = "capability";
void _providerNeutralShape;
