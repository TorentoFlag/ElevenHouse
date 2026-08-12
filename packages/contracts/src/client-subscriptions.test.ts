import { describe, expect, it } from "vitest";
import {
  clientEntitlementSchema,
  clientSubscriptionAllowanceSchema,
  clientSubscriptionContractSchema,
  clientSubscriptionEventSchema,
  clientSubscriptionResponseSchema
} from "./client-subscriptions";

const ids = {
  contractId: "11111111-1111-4111-8111-111111111111",
  subscriptionId: "22222222-2222-4222-8222-222222222222",
  orderId: "33333333-3333-4333-8333-333333333333",
  productId: "44444444-4444-4444-8444-444444444444",
  relationshipId: "55555555-5555-4555-8555-555555555555",
  astrologerUserId: "66666666-6666-4666-8666-666666666666",
  clientUserId: "77777777-7777-4777-8777-777777777777",
  journalEpochId: "88888888-8888-4888-8888-888888888888",
  periodId: "99999999-9999-4999-8999-999999999999",
  eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
} as const;

const contract = {
  id: ids.contractId,
  orderId: ids.orderId,
  productId: ids.productId,
  productRevision: 7,
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
  createdAt: "2026-08-11T12:00:00.000Z"
} as const;

describe("client subscription contracts", () => {
  it("accepts only the immutable canonical AstroDiary contract shape", () => {
    expect(clientSubscriptionContractSchema.parse(contract)).toEqual(contract);

    for (const invalid of [
      { ...contract, priceMinor: 0 },
      {
        ...contract,
        billingEconomics: {
          ...contract.billingEconomics,
          commission: { amountMinor: 195, currency: "RUB" }
        }
      },
      { ...contract, accessGrants: [] },
      { ...contract, deliveryFormats: ["chat", "file"] },
      { ...contract, requiredClientData: ["birth_data"] },
      { ...contract, methods: ["natal"] },
      { ...contract, modifiers: [{ id: ids.eventId }] }
    ]) {
      expect(clientSubscriptionContractSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      clientSubscriptionContractSchema.safeParse({
        ...contract,
        orderId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
      }).success
    ).toBe(false);
  });

  it("keeps subscription states closed and payment-attempt states out of the head", () => {
    const response = {
      id: ids.subscriptionId,
      contract,
      journalEpochId: ids.journalEpochId,
      state: "active",
      version: 2,
      cancellationEffectiveAt: null,
      renewalRequest: null,
      paidPeriods: [
        {
          id: ids.periodId,
          sequence: 1,
          startsAt: "2026-08-11T12:00:00.000Z",
          endsAt: "2026-09-11T12:00:00.000Z"
        }
      ]
    } as const;

    expect(clientSubscriptionResponseSchema.parse(response)).toEqual(response);
    expect(
      clientSubscriptionResponseSchema.safeParse({ ...response, state: "past_due" }).success
    ).toBe(false);
    expect(
      clientSubscriptionResponseSchema.safeParse({ ...response, state: "paused" }).success
    ).toBe(false);
  });

  it("accepts only versioned IDs-only lifecycle events", () => {
    const event = {
      eventId: ids.eventId,
      eventType: "client_subscription.capture_applied.v1",
      schemaVersion: 1,
      occurredAt: "2026-08-11T12:00:00.000Z",
      data: {
        subscriptionId: ids.subscriptionId,
        contractId: ids.contractId,
        periodId: ids.periodId,
        financeEvidenceId: ids.orderId
      }
    } as const;

    expect(clientSubscriptionEventSchema.parse(event)).toEqual(event);
    expect(
      clientSubscriptionEventSchema.safeParse({
        ...event,
        data: { ...event.data, priceMinor: 4_900 }
      }).success
    ).toBe(false);
    expect(
      clientSubscriptionEventSchema.safeParse({
        ...event,
        data: {
          subscriptionId: ids.subscriptionId,
          contractId: ids.contractId,
          periodId: ids.periodId,
          scope: "period",
          relationshipId: ids.relationshipId,
          journalEpochId: ids.journalEpochId
        }
      }).success
    ).toBe(false);
    expect(
      clientSubscriptionEventSchema.safeParse({
        ...event,
        eventType: "client_subscription.entitlement_changed.v1",
        data: {
          subscriptionId: ids.subscriptionId,
          contractId: ids.contractId,
          scope: "subscription_all",
          relationshipId: ids.relationshipId,
          journalEpochId: ids.journalEpochId
        }
      }).success
    ).toBe(true);
    expect(
      clientSubscriptionEventSchema.safeParse({
        ...event,
        eventType: "client_subscription.entitlement_changed.v1",
        data: {
          subscriptionId: ids.subscriptionId,
          contractId: ids.contractId,
          periodId: ids.periodId
        }
      }).success
    ).toBe(false);
    expect(
      clientSubscriptionEventSchema.safeParse({ ...event, eventType: "subscription.active" })
        .success
    ).toBe(false);
  });

  it("binds renewal request and failure events to explicit source and intended periods", () => {
    const intendedPeriodId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const renewalRequestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const renewalAttemptId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const renewalRequested = {
      eventId: ids.eventId,
      eventType: "client_subscription.renewal_charge_requested.v1",
      schemaVersion: 1,
      occurredAt: "2026-08-11T12:00:00.000Z",
      data: {
        subscriptionId: ids.subscriptionId,
        contractId: ids.contractId,
        sourcePeriodId: ids.periodId,
        intendedPeriodId,
        renewalRequestId
      }
    } as const;
    const renewalFailed = {
      ...renewalRequested,
      eventType: "client_subscription.renewal_failed.v1",
      data: {
        subscriptionId: ids.subscriptionId,
        contractId: ids.contractId,
        renewalRequestId,
        intendedPeriodId,
        renewalAttemptId
      }
    } as const;

    expect(clientSubscriptionEventSchema.parse(renewalRequested)).toEqual(renewalRequested);
    expect(clientSubscriptionEventSchema.parse(renewalFailed)).toEqual(renewalFailed);
    expect(
      clientSubscriptionEventSchema.safeParse({
        ...renewalRequested,
        data: { ...renewalRequested.data, sourcePeriodId: undefined }
      }).success
    ).toBe(false);
    expect(
      clientSubscriptionEventSchema.safeParse({
        ...renewalFailed,
        data: { ...renewalFailed.data, renewalRequestId: undefined }
      }).success
    ).toBe(false);
  });

  it("models initial payment terminal evidence without a paid period", () => {
    const event = {
      eventId: ids.eventId,
      eventType: "client_subscription.initial_payment_ended.v1",
      schemaVersion: 1,
      occurredAt: "2026-08-11T12:00:00.000Z",
      data: {
        subscriptionId: ids.subscriptionId,
        contractId: ids.contractId,
        financeEvidenceId: ids.orderId,
        reason: "checkout_expired"
      }
    } as const;
    expect(clientSubscriptionEventSchema.parse(event)).toEqual(event);
    expect(
      clientSubscriptionEventSchema.safeParse({
        ...event,
        data: { ...event.data, periodId: ids.periodId }
      }).success
    ).toBe(false);
    expect(
      clientSubscriptionEventSchema.safeParse({
        ...event,
        data: { ...event.data, reason: undefined }
      }).success
    ).toBe(false);
  });

  it("accounts explicitly released units without making them reusable", () => {
    expect(
      clientSubscriptionAllowanceSchema.parse({
        periodId: ids.periodId,
        total: 4,
        available: 0,
        reserved: 1,
        consumed: 1,
        released: 2
      })
    ).toMatchObject({ total: 4, reserved: 1, released: 2 });
    expect(
      clientSubscriptionAllowanceSchema.safeParse({
        periodId: ids.periodId,
        total: 4,
        available: 1,
        reserved: 1,
        consumed: 1,
        released: 2
      }).success
    ).toBe(false);
  });

  it("requires entitlement grants to use a non-empty half-open period", () => {
    const entitlement = {
      id: ids.eventId,
      subscriptionId: ids.subscriptionId,
      contractId: ids.contractId,
      relationshipId: ids.relationshipId,
      journalEpochId: ids.journalEpochId,
      periodId: ids.periodId,
      capability: "astro_diary",
      startsAt: "2026-08-11T12:00:00.000Z",
      endsAt: "2026-09-11T12:00:00.000Z",
      state: "active",
      version: 1
    } as const;

    expect(clientEntitlementSchema.parse(entitlement)).toEqual(entitlement);
    expect(
      clientEntitlementSchema.safeParse({ ...entitlement, endsAt: entitlement.startsAt }).success
    ).toBe(false);
    expect(
      clientEntitlementSchema.safeParse({
        ...entitlement,
        startsAt: entitlement.endsAt,
        endsAt: entitlement.startsAt
      }).success
    ).toBe(false);
  });
});
