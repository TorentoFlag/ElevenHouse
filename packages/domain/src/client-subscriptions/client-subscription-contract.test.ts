import { describe, expect, it } from "vitest";
import { sealClientSubscriptionContract } from "./client-subscription-contract";
import type {
  ClientSubscriptionOrderSnapshot,
  ClientSubscriptionProductSnapshot,
  ClientSubscriptionRelationshipSnapshot
} from "./client-subscription-types";

const order: ClientSubscriptionOrderSnapshot = {
  orderId: "11111111-1111-4111-8111-111111111111",
  productId: "22222222-2222-4222-8222-222222222222",
  productRevision: 3,
  relationshipId: "33333333-3333-4333-8333-333333333333",
  astrologerUserId: "44444444-4444-4444-8444-444444444444",
  clientUserId: "55555555-5555-4555-8555-555555555555",
  priceMinor: 4_900,
  currency: "RUB",
  cadence: "month",
  billingEconomics: {
    orderId: "11111111-1111-4111-8111-111111111111",
    astrologerUserId: "44444444-4444-4444-8444-444444444444",
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
  }
};

const product: ClientSubscriptionProductSnapshot = {
  productId: order.productId,
  revision: order.productRevision,
  ownerUserId: order.astrologerUserId,
  status: "active",
  type: "sub",
  paymentModel: "sub",
  executionMode: "async",
  participantMode: "solo",
  priceMinor: order.priceMinor,
  currency: order.currency,
  cadence: order.cadence,
  trialDays: null,
  groupSize: null,
  packageSessionCount: null,
  accessGrants: ["journal"],
  deliveryFormats: ["chat", "audio", "file"],
  requiredClientData: [],
  methods: [],
  modifiers: [],
  astroDiaryConfig: {
    reflectionCyclesPerPeriod: 4,
    responseSlaWorkingDays: 2,
    clientResponseWindowCalendarDays: 5,
    workingWeekdays: [5, 1, 3, 2, 4],
    serviceTimezone: "Europe/Moscow"
  }
};

const relationship: ClientSubscriptionRelationshipSnapshot = {
  relationshipId: order.relationshipId,
  astrologerUserId: order.astrologerUserId,
  clientUserId: order.clientUserId,
  status: "active"
};

describe("sealClientSubscriptionContract", () => {
  it("seals normalized immutable terms with a deterministic digest", () => {
    const input = {
      contractId: "66666666-6666-4666-8666-666666666666",
      order,
      product,
      relationship,
      createdAt: "2026-08-11T12:00:00.000Z"
    } as const;

    const left = sealClientSubscriptionContract(input);
    const right = sealClientSubscriptionContract({
      ...input,
      product: {
        ...product,
        astroDiaryConfig: {
          ...product.astroDiaryConfig,
          workingWeekdays: [1, 2, 3, 4, 5]
        }
      }
    });

    expect(left).toEqual(right);
    expect(left).toMatchObject({
      outcome: "sealed",
      contract: {
        productRevision: 3,
        priceMinor: 4_900,
        currency: "RUB",
        billingEconomics: {
          orderId: order.orderId,
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
        astroDiaryConfig: { workingWeekdays: [1, 2, 3, 4, 5] },
        canonicalDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      }
    });
  });

  it("normalizes equivalent createdAt offsets before sealing and hashing", () => {
    const canonical = sealClientSubscriptionContract({
      contractId: "66666666-6666-4666-8666-666666666666",
      order,
      product,
      relationship,
      createdAt: "2026-01-01T00:00:00Z"
    });
    const offset = sealClientSubscriptionContract({
      contractId: "66666666-6666-4666-8666-666666666666",
      order,
      product,
      relationship,
      createdAt: "2026-01-01T03:00:00+03:00"
    });

    expect(offset).toEqual(canonical);
    expect(offset).toMatchObject({
      outcome: "sealed",
      contract: { createdAt: "2026-01-01T00:00:00Z" }
    });
  });

  it("normalizes UUID lexical case before sealing and hashing", () => {
    const canonical = sealClientSubscriptionContract({
      contractId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      order,
      product,
      relationship,
      createdAt: "2026-01-01T00:00:00Z"
    });
    const uppercase = sealClientSubscriptionContract({
      contractId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      order,
      product,
      relationship,
      createdAt: "2026-01-01T00:00:00Z"
    });
    expect(uppercase).toEqual(canonical);
  });

  it("returns a typed rejection for an invalid createdAt instant", () => {
    expect(
      sealClientSubscriptionContract({
        contractId: "66666666-6666-4666-8666-666666666666",
        order,
        product,
        relationship,
        createdAt: "not-an-instant"
      })
    ).toEqual({ outcome: "rejected", code: "invalid_astro_diary_shape" });
  });

  it.each([
    ["actors", { order: { ...order, clientUserId: "77777777-7777-4777-8777-777777777777" } }],
    ["product revision", { order: { ...order, productRevision: 4 } }],
    ["positive amount", { product: { ...product, priceMinor: 0 } }],
    ["product type", { product: { ...product, type: "async" as const } }],
    ["trial", { product: { ...product, trialDays: 7 } }],
    ["currency", { order: { ...order, currency: "USD" as "RUB" } }],
    [
      "billing economics order",
      {
        order: {
          ...order,
          billingEconomics: { ...order.billingEconomics, orderId: product.productId }
        }
      }
    ],
    [
      "billing economics amount",
      {
        order: {
          ...order,
          billingEconomics: {
            ...order.billingEconomics,
            gross: { amountMinor: 5_000, currency: "RUB" as const }
          }
        }
      }
    ],
    ["cadence", { product: { ...product, cadence: "year" as const } }],
    [
      "config",
      {
        order: {
          ...order,
          astroDiaryConfig: { ...order.astroDiaryConfig, responseSlaWorkingDays: 3 }
        }
      }
    ],
    ["grant", { product: { ...product, accessGrants: [] } }],
    ["delivery", { product: { ...product, deliveryFormats: ["chat", "file"] } }],
    ["client data", { product: { ...product, requiredClientData: ["birth_data"] } }],
    ["method", { product: { ...product, methods: ["natal"] } }],
    ["modifier", { product: { ...product, modifiers: [{ id: "modifier" }] } }]
  ])("rejects a %s mismatch or non-canonical shape", (_label, patch) => {
    const malformed = patch as unknown as {
      readonly order?: ClientSubscriptionOrderSnapshot;
      readonly product?: ClientSubscriptionProductSnapshot;
    };
    expect(
      sealClientSubscriptionContract({
        contractId: "66666666-6666-4666-8666-666666666666",
        order: malformed.order ?? order,
        product: malformed.product ?? product,
        relationship,
        createdAt: "2026-08-11T12:00:00.000Z"
      })
    ).toMatchObject({ outcome: "rejected" });
  });

  it("requires an active canonical relationship snapshot", () => {
    expect(
      sealClientSubscriptionContract({
        contractId: "66666666-6666-4666-8666-666666666666",
        order,
        product,
        relationship: { ...relationship, status: "archived" },
        createdAt: "2026-08-11T12:00:00.000Z"
      })
    ).toEqual({ outcome: "rejected", code: "inactive_relationship" });
  });
});
