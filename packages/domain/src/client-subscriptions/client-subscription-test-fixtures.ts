import { sealClientSubscriptionContract } from "./client-subscription-contract";
import { createPendingClientSubscription } from "./client-subscription-lifecycle";
import type {
  ClientSubscription,
  ClientSubscriptionOrderSnapshot,
  ClientSubscriptionProductSnapshot,
  ClientSubscriptionRelationshipSnapshot
} from "./client-subscription-types";
import type {
  ClientSubscriptionCreationAuthority,
  ClientSubscriptionCreationDecision
} from "./ports/client-subscription-creation-unit-of-work";

export const runtimeId = (value: number): string =>
  `10000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

export function activeSubscription(): ClientSubscription {
  return {
    id: runtimeId(1),
    journalEpochId: runtimeId(2),
    state: "active",
    version: 2,
    cancellationEffectiveAt: null,
    renewalStoppedAt: null,
    renewalRequest: null,
    endedPeriodIds: [],
    appliedFinanceEvidenceIds: [runtimeId(3)],
    contract: {
      id: runtimeId(4),
      orderId: runtimeId(5),
      productId: runtimeId(6),
      productRevision: 1,
      relationshipId: runtimeId(7),
      astrologerUserId: runtimeId(8),
      clientUserId: runtimeId(9),
      priceMinor: 4_900,
      currency: "RUB",
      cadence: "month",
      billingEconomics: {
        orderId: runtimeId(5),
        astrologerUserId: runtimeId(8),
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
      createdAt: "2026-01-01T00:00:00Z"
    },
    paidPeriods: [
      {
        id: runtimeId(10),
        sequence: 1,
        startsAt: "2026-01-31T07:30:00Z",
        endsAt: "2026-02-28T07:30:00Z",
        anchor: {
          capturedAt: "2026-01-31T07:30:00Z",
          serviceTimezone: "Europe/Moscow",
          originSequence: 1,
          localDateTime: "2026-01-31T10:30:00"
        },
        resolvedStartLocal: "2026-01-31T10:30:00",
        resolvedStartOffset: "+03:00",
        resolvedEndLocal: "2026-02-28T10:30:00",
        resolvedEndOffset: "+03:00"
      }
    ]
  };
}

export function creationDecision(
  authority: ClientSubscriptionCreationAuthority,
  subscriptionId: string
): ClientSubscriptionCreationDecision {
  const sealed = sealClientSubscriptionContract({
    contractId: runtimeId(4),
    order: authority.order,
    product: authority.product,
    relationship: authority.relationship,
    createdAt: "2026-01-01T00:00:00Z"
  });
  if (sealed.outcome === "rejected") return sealed;
  return {
    outcome: "created",
    contract: sealed.contract,
    subscription: createPendingClientSubscription({
      subscriptionId,
      journalEpochId: runtimeId(2),
      contract: sealed.contract
    })
  };
}

export function creationAuthority(
  overrides: {
    readonly order?: Partial<ClientSubscriptionOrderSnapshot>;
    readonly product?: Partial<ClientSubscriptionProductSnapshot>;
    readonly relationship?: Partial<ClientSubscriptionRelationshipSnapshot>;
  } = {}
): ClientSubscriptionCreationAuthority {
  const config = {
    reflectionCyclesPerPeriod: 4,
    responseSlaWorkingDays: 2,
    clientResponseWindowCalendarDays: 5,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow"
  } as const;
  const orderId = overrides.order?.orderId ?? runtimeId(5);
  const astrologerUserId = overrides.order?.astrologerUserId ?? runtimeId(8);
  const priceMinor = overrides.order?.priceMinor ?? 4_900;
  const order: ClientSubscriptionOrderSnapshot = {
    orderId: runtimeId(5),
    productId: runtimeId(6),
    productRevision: 1,
    relationshipId: runtimeId(7),
    astrologerUserId: runtimeId(8),
    clientUserId: runtimeId(9),
    priceMinor: 4_900,
    currency: "RUB",
    cadence: "month",
    billingEconomics: {
      orderId,
      astrologerUserId,
      planId: "start",
      planVersionId: "start-v3",
      gross: { amountMinor: priceMinor, currency: "RUB" },
      commission: { amountMinor: Math.floor((priceMinor * 400 + 5_000) / 10_000), currency: "RUB" },
      payable: {
        amountMinor: priceMinor - Math.floor((priceMinor * 400 + 5_000) / 10_000),
        currency: "RUB"
      },
      commissionBps: 400,
      allocationRevision: "bps_half_up_v1"
    },
    accessGrants: ["journal"],
    deliveryFormats: ["chat", "audio", "file"],
    requiredClientData: [],
    methods: [],
    modifiers: [],
    astroDiaryConfig: config,
    ...overrides.order
  };
  return {
    order,
    product: {
      productId: runtimeId(6),
      revision: 1,
      ownerUserId: runtimeId(8),
      status: "active",
      type: "sub",
      paymentModel: "sub",
      executionMode: "async",
      participantMode: "solo",
      priceMinor: 4_900,
      currency: "RUB",
      cadence: "month",
      trialDays: null,
      groupSize: null,
      packageSessionCount: null,
      accessGrants: ["journal"],
      deliveryFormats: ["chat", "audio", "file"],
      requiredClientData: [],
      methods: [],
      modifiers: [],
      astroDiaryConfig: config,
      ...overrides.product
    },
    relationship: {
      relationshipId: runtimeId(7),
      astrologerUserId: runtimeId(8),
      clientUserId: runtimeId(9),
      status: "active",
      ...overrides.relationship
    }
  };
}
