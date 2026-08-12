import { describe, expect, it } from "vitest";
import { clientSubscriptionEventSchema } from "@elevenhouse/contracts";
import { clientSubscriptionEvent } from "./client-subscription-events";
import type { ClientSubscriptionContract } from "./client-subscription-types";
import {
  applyInitialCapture,
  applyPermanentRevocation,
  applyRenewalCapture,
  applyRenewalFailure,
  createPendingClientSubscription,
  endPendingInitialPayment,
  endSubscriptionAtPaidBoundary,
  revokeCancellation,
  requestRenewalCharge,
  scheduleCancellation
} from "./client-subscription-lifecycle";

const ids = {
  subscriptionId: "11111111-1111-4111-8111-111111111111",
  contractId: "22222222-2222-4222-8222-222222222222",
  journalEpochId: "33333333-3333-4333-8333-333333333333",
  orderId: "44444444-4444-4444-8444-444444444444",
  productId: "55555555-5555-4555-8555-555555555555",
  relationshipId: "66666666-6666-4666-8666-666666666666",
  astrologerUserId: "77777777-7777-4777-8777-777777777777",
  clientUserId: "88888888-8888-4888-8888-888888888888",
  period1: "99999999-9999-4999-8999-999999999999",
  period2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
} as const;

const runtimeId = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const contract = (
  overrides: Partial<ClientSubscriptionContract> = {}
): ClientSubscriptionContract => ({
  id: ids.contractId,
  orderId: ids.orderId,
  productId: ids.productId,
  productRevision: 3,
  relationshipId: ids.relationshipId,
  astrologerUserId: ids.astrologerUserId,
  clientUserId: ids.clientUserId,
  priceMinor: 4_900,
  currency: "RUB",
  cadence: "month",
  billingEconomics: {
    orderId: ids.orderId,
    astrologerUserId: ids.astrologerUserId,
    planId: "start",
    planVersionId: "start-v3",
    gross: { amountMinor: 4_900, currency: "RUB" },
    commission: { amountMinor: 196, currency: "RUB" },
    payable: { amountMinor: 4_704, currency: "RUB" },
    commissionBps: 400,
    allocationRevision: "bps_half_up_v1"
  },
  accessGrants: ["journal"],
  deliveryFormats: ["chat", "audio", "file"],
  requiredClientData: [],
  methods: [],
  modifiers: [],
  astroDiaryConfig: {
    reflectionCyclesPerPeriod: 4,
    responseSlaWorkingDays: 2,
    clientResponseWindowCalendarDays: 5,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow"
  },
  canonicalDigest: `sha256:${"a".repeat(64)}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const pending = (terms = contract()) =>
  createPendingClientSubscription({
    subscriptionId: ids.subscriptionId,
    journalEpochId: ids.journalEpochId,
    contract: terms
  });

describe("client subscription capture calendar", () => {
  it("anchors initial access at verified capture and preserves Jan-31 without drift", () => {
    const first = applyInitialCapture(pending(), {
      sourceEventId: runtimeId(901),
      evidenceId: runtimeId(101),
      capturedAt: "2026-01-31T07:30:00.000Z",
      periodId: ids.period1,
      eventIds: [runtimeId(2), runtimeId(3)]
    });
    expect(first).toMatchObject({
      outcome: "applied",
      subscription: {
        state: "active",
        version: 2,
        paidPeriods: [
          {
            sequence: 1,
            startsAt: "2026-01-31T07:30:00Z",
            endsAt: "2026-02-28T07:30:00Z",
            resolvedEndLocal: "2026-02-28T10:30:00",
            resolvedEndOffset: "+03:00"
          }
        ]
      }
    });

    if (first.outcome !== "applied") throw new Error("capture must apply");
    const renewalRequest = appliedRenewalRequest(first.subscription, {
      renewalRequestId: runtimeId(401),
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z"
    });
    const renewed = applyRenewalCapture(renewalRequest, {
      sourceEventId: runtimeId(902),
      evidenceId: runtimeId(102),
      renewalRequestId: runtimeId(401),
      intendedPeriodId: ids.period2,
      capturedAt: "2026-02-20T08:00:00.000Z",
      periodId: ids.period2,
      eventIds: [runtimeId(5), runtimeId(6)]
    });
    expect(renewed).toMatchObject({
      outcome: "applied",
      subscription: {
        paidPeriods: [
          {},
          {
            sequence: 2,
            startsAt: "2026-02-28T07:30:00Z",
            endsAt: "2026-03-31T07:30:00Z"
          }
        ]
      }
    });
  });

  it("constrains Feb-29 yearly anchors without moving the original anchor", () => {
    const result = applyInitialCapture(pending(contract({ cadence: "year" })), {
      sourceEventId: runtimeId(901),
      evidenceId: runtimeId(103),
      capturedAt: "2024-02-29T07:30:00.000Z",
      periodId: ids.period1,
      eventIds: [runtimeId(2), runtimeId(3)]
    });
    expect(result).toMatchObject({
      outcome: "applied",
      subscription: { paidPeriods: [{ endsAt: "2025-02-28T07:30:00Z" }] }
    });
  });

  it("adds exactly seven calendar days for weekly periods in the service timezone", () => {
    const result = applyInitialCapture(pending(contract({ cadence: "week" })), {
      sourceEventId: runtimeId(901),
      evidenceId: runtimeId(104),
      capturedAt: "2026-03-23T08:15:00.000Z",
      periodId: ids.period1,
      eventIds: [runtimeId(2), runtimeId(3)]
    });
    expect(result).toMatchObject({
      outcome: "applied",
      subscription: {
        paidPeriods: [
          {
            startsAt: "2026-03-23T08:15:00Z",
            endsAt: "2026-03-30T08:15:00Z",
            resolvedEndLocal: "2026-03-30T11:15:00"
          }
        ]
      }
    });
  });

  it.each([
    ["gap", "2026-02-08T07:30:00.000Z", "2026-03-08T07:30:00Z", "2026-03-08T03:30:00", "-04:00"],
    ["fold", "2026-10-01T05:30:00.000Z", "2026-11-01T06:30:00Z", "2026-11-01T01:30:00", "-05:00"]
  ])("uses the later instant for a DST %s", (_case, capturedAt, endsAt, local, offset) => {
    const result = applyInitialCapture(
      pending(
        contract({
          astroDiaryConfig: {
            ...contract().astroDiaryConfig,
            serviceTimezone: "America/New_York"
          }
        })
      ),
      {
        sourceEventId: runtimeId(901),
        evidenceId: runtimeId(_case === "gap" ? 105 : 106),
        capturedAt,
        periodId: ids.period1,
        eventIds: [runtimeId(2), runtimeId(3)]
      }
    );
    expect(result).toMatchObject({
      outcome: "applied",
      subscription: {
        paidPeriods: [{ endsAt, resolvedEndLocal: local, resolvedEndOffset: offset }]
      }
    });
  });

  it("creates at most one future period, replays duplicate evidence, and re-anchors after lapse", () => {
    const first = appliedInitial();
    const earlyRequest = appliedRenewalRequest(first, {
      renewalRequestId: runtimeId(403),
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z"
    });
    const early = applyRenewalCapture(earlyRequest, {
      sourceEventId: runtimeId(903),
      evidenceId: runtimeId(107),
      renewalRequestId: runtimeId(403),
      intendedPeriodId: ids.period2,
      capturedAt: "2026-02-20T08:00:00.000Z",
      periodId: ids.period2,
      eventIds: [runtimeId(5), runtimeId(6)]
    });
    if (early.outcome !== "applied") throw new Error("renewal must apply");

    expect(
      applyRenewalCapture(early.subscription, {
        sourceEventId: runtimeId(903),
        evidenceId: runtimeId(107),
        renewalRequestId: runtimeId(403),
        intendedPeriodId: ids.period2,
        capturedAt: "2026-02-20T08:00:00.000Z",
        periodId: ids.period2,
        eventIds: [runtimeId(5), runtimeId(6)]
      })
    ).toMatchObject({ outcome: "idempotent", subscription: early.subscription });
    expect(
      requestRenewalCharge(early.subscription, {
        renewalRequestId: runtimeId(404),
        sourcePeriodId: ids.period2,
        intendedPeriodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        requestedAt: "2026-02-21T08:00:00.000Z",
        eventId: runtimeId(7)
      })
    ).toEqual({ outcome: "rejected", code: "future_period_exists" });
    expect(
      endSubscriptionAtPaidBoundary(early.subscription, {
        now: "2026-02-28T07:30:00.000Z",
        eventIds: [runtimeId(10), runtimeId(11)]
      })
    ).toMatchObject({
      outcome: "applied",
      subscription: { state: "active", version: 5, endedPeriodIds: [ids.period1] },
      receipt: { period: { id: ids.period1 }, entitlementState: "ended" }
    });

    const lapsedRequest = appliedRenewalRequest(first, {
      renewalRequestId: runtimeId(405),
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z"
    });
    const lapsed = applyRenewalCapture(lapsedRequest, {
      sourceEventId: runtimeId(904),
      evidenceId: runtimeId(109),
      renewalRequestId: runtimeId(405),
      intendedPeriodId: ids.period2,
      capturedAt: "2026-03-02T08:00:00.000Z",
      periodId: ids.period2,
      eventIds: [runtimeId(5), runtimeId(6)]
    });
    expect(lapsed).toMatchObject({
      outcome: "applied",
      subscription: {
        paidPeriods: [
          {},
          {
            startsAt: "2026-03-02T08:00:00Z",
            endsAt: "2026-04-02T08:00:00Z",
            anchor: { originSequence: 2, capturedAt: "2026-03-02T08:00:00Z" }
          }
        ]
      }
    });
  });
});

describe("client subscription lifecycle", () => {
  it.each(["checkout_expired", "payment_failed"] as const)(
    "ends pending initial payment for canonical %s evidence and rejects a late capture",
    (reason) => {
      const evidenceId = runtimeId(reason === "checkout_expired" ? 430 : 431);
      const ended = endPendingInitialPayment(pending(), {
        sourceEventId: runtimeId(909),
        evidenceId,
        reason,
        observedAt: "2026-01-02T00:00:00Z",
        eventId: runtimeId(49)
      });
      expect(ended).toMatchObject({
        outcome: "applied",
        subscription: {
          state: "ended",
          version: 2,
          paidPeriods: [],
          appliedFinanceEvidenceIds: [evidenceId]
        },
        events: [
          {
            eventType: "client_subscription.initial_payment_ended.v1",
            data: { financeEvidenceId: evidenceId, reason }
          }
        ],
        receipt: {
          transitionId: runtimeId(909),
          entitlementScope: "none",
          period: null,
          slotEffect: "release"
        }
      });
      if (ended.outcome !== "applied") throw new Error("terminal evidence must apply");
      expect(
        endPendingInitialPayment(ended.subscription, {
          sourceEventId: runtimeId(909),
          evidenceId,
          reason,
          observedAt: "2026-01-02T00:00:00Z",
          eventId: runtimeId(49)
        })
      ).toMatchObject({ outcome: "idempotent" });
      expect(
        applyInitialCapture(ended.subscription, {
          sourceEventId: runtimeId(910),
          evidenceId: runtimeId(432),
          capturedAt: "2026-01-03T00:00:00Z",
          periodId: ids.period1,
          eventIds: [runtimeId(51), runtimeId(52)]
        })
      ).toEqual({ outcome: "rejected", code: "initial_payment_ended" });
    }
  );
  it("emits only runtime-valid shared event contracts and rejects an invalid event at the factory", () => {
    const initial = applyInitialCapture(pending(), {
      sourceEventId: runtimeId(905),
      evidenceId: runtimeId(110),
      capturedAt: "2026-01-31T07:30:00.000Z",
      periodId: ids.period1,
      eventIds: [runtimeId(13), runtimeId(14)]
    });
    if (initial.outcome !== "applied") throw new Error("initial capture must apply");
    expect(initial.events.map((event) => event.eventType)).toEqual([
      "client_subscription.activated.v1",
      "client_subscription.entitlement_changed.v1"
    ]);
    expect(initial.receipt.transitionId).toBe(runtimeId(905));
    expect(
      initial.events.every((event) => clientSubscriptionEventSchema.safeParse(event).success)
    ).toBe(true);
    expect(() =>
      clientSubscriptionEvent({
        eventId: "not-a-uuid",
        eventType: "client_subscription.activated.v1",
        occurredAt: "2026-01-31T07:30:00.000Z",
        subscription: initial.subscription,
        periodId: ids.period1
      })
    ).toThrow();
  });

  it("schedules cancellation at the last paid boundary and permits revocation only before it", () => {
    const active = appliedInitial();
    const scheduled = scheduleCancellation(active, {
      now: "2026-02-10T10:00:00.000Z",
      eventId: runtimeId(15)
    });
    expect(scheduled).toMatchObject({
      outcome: "applied",
      receipt: { period: { id: ids.period1 }, entitlementScope: "none" },
      subscription: {
        state: "cancel_at_period_end",
        cancellationEffectiveAt: "2026-02-28T07:30:00Z"
      }
    });
    if (scheduled.outcome !== "applied") throw new Error("cancel must schedule");
    expect(
      revokeCancellation(scheduled.subscription, {
        now: "2026-02-28T07:29:59.999Z",
        eventId: runtimeId(16)
      })
    ).toMatchObject({
      outcome: "applied",
      receipt: { period: { id: ids.period1 }, entitlementScope: "none" },
      subscription: { state: "active", cancellationEffectiveAt: null }
    });
    expect(
      revokeCancellation(scheduled.subscription, {
        now: "2026-02-28T07:30:00.000Z",
        eventId: runtimeId(17)
      })
    ).toEqual({ outcome: "rejected", code: "cancellation_already_effective" });
  });

  it("serializes a body-free renewal request and rejects cancellation-first renewal", () => {
    const active = appliedInitial();
    const input = {
      renewalRequestId: runtimeId(401),
      sourcePeriodId: ids.period1,
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z",
      eventId: runtimeId(25)
    } as const;
    const requested = requestRenewalCharge(active, input);
    expect(requested).toMatchObject({
      outcome: "applied",
      receipt: { period: { id: ids.period1 }, entitlementScope: "none" },
      subscription: {
        version: 3,
        renewalRequest: {
          id: input.renewalRequestId,
          sourcePeriodId: ids.period1,
          intendedPeriodId: ids.period2,
          requestedAt: "2026-02-20T08:00:00Z"
        }
      },
      events: [
        {
          eventType: "client_subscription.renewal_charge_requested.v1",
          data: {
            sourcePeriodId: ids.period1,
            intendedPeriodId: ids.period2,
            renewalRequestId: input.renewalRequestId
          }
        }
      ]
    });
    if (requested.outcome !== "applied") throw new Error("renewal request must apply");
    expect(
      requested.events.every((event) => clientSubscriptionEventSchema.safeParse(event).success)
    ).toBe(true);
    expect(requestRenewalCharge(requested.subscription, input)).toMatchObject({
      outcome: "idempotent"
    });

    const cancelled = scheduleCancellation(active, {
      now: "2026-02-19T08:00:00.000Z",
      eventId: runtimeId(26)
    });
    if (cancelled.outcome !== "applied") throw new Error("cancellation must apply");
    expect(requestRenewalCharge(cancelled.subscription, input)).toEqual({
      outcome: "rejected",
      code: "renewal_disabled"
    });
    expect(
      endSubscriptionAtPaidBoundary(cancelled.subscription, {
        now: cancelled.subscription.paidPeriods[0]!.endsAt,
        eventIds: [runtimeId(411), runtimeId(412)]
      })
    ).toMatchObject({ outcome: "applied", receipt: { slotEffect: "release" } });
    expect(
      requestRenewalCharge(active, {
        ...input,
        renewalRequestId: runtimeId(499),
        requestedAt: active.paidPeriods[0]!.endsAt
      })
    ).toEqual({ outcome: "rejected", code: "paid_access_ended" });
  });

  it("binds renewal failure to its recorded request and intended period", () => {
    const active = appliedInitial();
    const requested = requestRenewalCharge(active, {
      renewalRequestId: runtimeId(402),
      sourcePeriodId: ids.period1,
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z",
      eventId: runtimeId(27)
    });
    if (requested.outcome !== "applied") throw new Error("renewal request must apply");

    expect(
      applyRenewalFailure(requested.subscription, {
        renewalRequestId: runtimeId(499),
        intendedPeriodId: ids.period2,
        attemptId: runtimeId(201),
        observedAt: "2026-02-20T09:00:00.000Z",
        eventId: runtimeId(28)
      })
    ).toEqual({ outcome: "rejected", code: "renewal_request_mismatch" });
    expect(
      applyRenewalFailure(requested.subscription, {
        renewalRequestId: runtimeId(402),
        intendedPeriodId: runtimeId(498),
        attemptId: runtimeId(201),
        observedAt: "2026-02-20T09:00:00.000Z",
        eventId: runtimeId(28)
      })
    ).toEqual({ outcome: "rejected", code: "renewal_period_mismatch" });
  });

  it("binds renewal capture and honors a verified capture after later cancellation", () => {
    const active = appliedInitial();
    const requested = requestRenewalCharge(active, {
      renewalRequestId: runtimeId(407),
      sourcePeriodId: ids.period1,
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z",
      eventId: runtimeId(29)
    });
    if (requested.outcome !== "applied") throw new Error("renewal request must apply");
    expect(
      applyRenewalCapture(requested.subscription, {
        sourceEventId: runtimeId(906),
        renewalRequestId: runtimeId(499),
        intendedPeriodId: ids.period2,
        evidenceId: runtimeId(111),
        capturedAt: "2026-02-21T08:00:00.000Z",
        periodId: ids.period2,
        eventIds: [runtimeId(31), runtimeId(32)]
      })
    ).toEqual({ outcome: "rejected", code: "renewal_request_mismatch" });

    const cancelled = scheduleCancellation(requested.subscription, {
      now: "2026-02-20T09:00:00.000Z",
      eventId: runtimeId(33)
    });
    if (cancelled.outcome !== "applied") throw new Error("cancellation must apply");
    const captured = applyRenewalCapture(cancelled.subscription, {
      sourceEventId: runtimeId(906),
      renewalRequestId: runtimeId(407),
      intendedPeriodId: ids.period2,
      evidenceId: runtimeId(111),
      capturedAt: "2026-02-21T08:00:00.000Z",
      periodId: ids.period2,
      eventIds: [runtimeId(35), runtimeId(36)]
    });
    expect(captured).toMatchObject({
      outcome: "applied",
      subscription: {
        state: "cancel_at_period_end",
        renewalRequest: null,
        cancellationEffectiveAt: "2026-03-31T07:30:00Z",
        paidPeriods: [{ id: ids.period1 }, { id: ids.period2 }]
      }
    });
  });

  it("preserves stopped renewal intent across period end and a late verified capture", () => {
    const requested = requestRenewalCharge(appliedInitial(), {
      renewalRequestId: runtimeId(408),
      sourcePeriodId: ids.period1,
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z",
      eventId: runtimeId(37)
    });
    if (requested.outcome !== "applied") throw new Error("renewal request must apply");
    const cancelled = scheduleCancellation(requested.subscription, {
      now: "2026-02-21T08:00:00.000Z",
      eventId: runtimeId(38)
    });
    if (cancelled.outcome !== "applied") throw new Error("cancellation must apply");
    expect(cancelled.subscription.renewalStoppedAt).toBe("2026-02-21T08:00:00Z");
    const ended = endSubscriptionAtPaidBoundary(cancelled.subscription, {
      now: "2026-02-28T07:30:00.000Z",
      eventIds: [runtimeId(39), runtimeId(40)]
    });
    if (ended.outcome !== "applied") throw new Error("period end must apply");
    expect(ended.receipt.slotEffect).toBe("retain");
    expect(ended.subscription).toMatchObject({
      state: "ended",
      cancellationEffectiveAt: null,
      renewalStoppedAt: "2026-02-21T08:00:00Z"
    });

    const captured = applyRenewalCapture(ended.subscription, {
      sourceEventId: runtimeId(907),
      renewalRequestId: runtimeId(408),
      intendedPeriodId: ids.period2,
      evidenceId: runtimeId(112),
      capturedAt: "2026-03-02T08:00:00.000Z",
      periodId: ids.period2,
      eventIds: [runtimeId(41), runtimeId(42)]
    });
    expect(captured).toMatchObject({
      outcome: "applied",
      subscription: {
        state: "cancel_at_period_end",
        renewalStoppedAt: "2026-02-21T08:00:00Z",
        cancellationEffectiveAt: "2026-04-02T08:00:00Z",
        renewalRequest: null
      }
    });
    if (captured.outcome !== "applied") throw new Error("late capture must apply");
    expect(
      requestRenewalCharge(captured.subscription, {
        renewalRequestId: runtimeId(409),
        sourcePeriodId: ids.period2,
        intendedPeriodId: runtimeId(410),
        requestedAt: "2026-03-20T08:00:00.000Z",
        eventId: runtimeId(43)
      })
    ).toEqual({ outcome: "rejected", code: "renewal_disabled" });
  });

  it("keeps a no-cancellation late renewal retry active after period end", () => {
    const requested = appliedRenewalRequest(appliedInitial(), {
      renewalRequestId: runtimeId(411),
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z"
    });
    const failed = applyRenewalFailure(requested, {
      renewalRequestId: runtimeId(411),
      intendedPeriodId: ids.period2,
      attemptId: runtimeId(202),
      observedAt: "2026-02-21T08:00:00.000Z",
      eventId: runtimeId(44)
    });
    expect(failed).toMatchObject({
      outcome: "applied",
      receipt: { period: { id: ids.period1 }, entitlementScope: "none" }
    });
    if (failed.outcome !== "applied") throw new Error("failure must apply");
    const ended = endSubscriptionAtPaidBoundary(failed.subscription, {
      now: "2026-02-28T07:30:00.000Z",
      eventIds: [runtimeId(45), runtimeId(46)]
    });
    if (ended.outcome !== "applied") throw new Error("period end must apply");
    const captured = applyRenewalCapture(ended.subscription, {
      sourceEventId: runtimeId(908),
      renewalRequestId: runtimeId(411),
      intendedPeriodId: ids.period2,
      evidenceId: runtimeId(113),
      capturedAt: "2026-03-02T08:00:00.000Z",
      periodId: ids.period2,
      eventIds: [runtimeId(47), runtimeId(48)]
    });
    expect(captured).toMatchObject({
      outcome: "applied",
      subscription: {
        state: "active",
        renewalStoppedAt: null,
        cancellationEffectiveAt: null
      }
    });
  });

  it("does not shorten paid access on renewal failure and ends exactly at the paid boundary", () => {
    const active = appliedRenewalRequest(appliedInitial(), {
      renewalRequestId: runtimeId(406),
      intendedPeriodId: ids.period2,
      requestedAt: "2026-02-20T08:00:00.000Z"
    });
    const failure = applyRenewalFailure(active, {
      renewalRequestId: runtimeId(406),
      intendedPeriodId: ids.period2,
      attemptId: runtimeId(201),
      observedAt: "2026-02-20T08:00:00.000Z",
      eventId: runtimeId(18)
    });
    expect(failure).toMatchObject({
      outcome: "applied",
      subscription: {
        state: "active",
        version: 4,
        paidPeriods: [{ endsAt: "2026-02-28T07:30:00Z" }],
        appliedFinanceEvidenceIds: [runtimeId(101), runtimeId(201)]
      }
    });
    if (failure.outcome !== "applied") throw new Error("failure observation must apply");
    expect(
      applyRenewalFailure(failure.subscription, {
        renewalRequestId: runtimeId(406),
        intendedPeriodId: ids.period2,
        attemptId: runtimeId(201),
        observedAt: "2026-02-20T08:00:00.000Z",
        eventId: runtimeId(19)
      })
    ).toMatchObject({ outcome: "idempotent", subscription: failure.subscription, events: [] });
    expect(
      endSubscriptionAtPaidBoundary(failure.subscription, {
        now: "2026-02-28T07:30:00.000Z",
        eventIds: [runtimeId(20), runtimeId(21)]
      })
    ).toMatchObject({ outcome: "applied", subscription: { state: "ended" } });
  });

  it.each(["full_refund_succeeded", "chargeback_observed"] as const)(
    "permanently revokes for %s and replays the same finance evidence",
    (reason) => {
      const active = appliedRenewalRequest(appliedInitial(), {
        renewalRequestId: runtimeId(reason === "full_refund_succeeded" ? 420 : 421),
        intendedPeriodId: ids.period2,
        requestedAt: "2026-02-05T08:00:00.000Z"
      });
      const revoked = applyPermanentRevocation(active, {
        evidenceId: runtimeId(reason === "full_refund_succeeded" ? 301 : 302),
        reason,
        observedAt: "2026-02-10T08:00:00.000Z",
        eventIds: [runtimeId(22), runtimeId(23)]
      });
      expect(revoked).toMatchObject({
        outcome: "applied",
        subscription: { state: "revoked", renewalRequest: null },
        receipt: { slotEffect: "release" }
      });
      if (revoked.outcome !== "applied") throw new Error("revocation must apply");
      expect(
        applyPermanentRevocation(revoked.subscription, {
          evidenceId: runtimeId(reason === "full_refund_succeeded" ? 301 : 302),
          reason,
          observedAt: "2026-02-10T08:00:00.000Z",
          eventIds: [runtimeId(22), runtimeId(23)]
        })
      ).toMatchObject({ outcome: "idempotent" });
      expect(
        scheduleCancellation(revoked.subscription, {
          now: "2026-02-11T00:00:00Z",
          eventId: runtimeId(24)
        })
      ).toEqual({ outcome: "rejected", code: "subscription_revoked" });
    }
  );
});

function appliedInitial() {
  const result = applyInitialCapture(pending(), {
    sourceEventId: runtimeId(901),
    evidenceId: runtimeId(101),
    capturedAt: "2026-01-31T07:30:00.000Z",
    periodId: ids.period1,
    eventIds: [runtimeId(2), runtimeId(3)]
  });
  if (result.outcome !== "applied") throw new Error("initial capture must apply");
  return result.subscription;
}

function appliedRenewalRequest(
  subscription: ReturnType<typeof appliedInitial>,
  input: {
    readonly renewalRequestId: string;
    readonly intendedPeriodId: string;
    readonly requestedAt: string;
  }
) {
  const result = requestRenewalCharge(subscription, {
    ...input,
    sourcePeriodId: subscription.paidPeriods.at(-1)!.id,
    eventId: runtimeId(50)
  });
  if (result.outcome !== "applied") throw new Error("renewal request must apply");
  return result.subscription;
}
