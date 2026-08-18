import { describe, expect, it, vi } from "vitest";

import { resolvePaidProductFulfillment } from "./paid-product-fulfillment-registry";
import type { ProductStore } from "./product-store";
import type { Product } from "./product-types";
import { publishProduct } from "./product-use-cases";

const exactAstroDiaryProduct = Object.freeze({
  type: "async",
  paymentModel: "once",
  executionMode: "async",
  participantMode: "solo",
  subscriptionPeriod: "month",
  trialDays: null,
  durationMinutes: null,
  packageSessionCount: null,
  groupSize: null,
  deliveryFormats: ["chat", "audio", "file"],
  requiredClientData: [],
  methods: [],
  accessGrants: ["journal"],
  modifiers: [],
  astroDiaryConfig: {
    reflectionCyclesPerPeriod: 4,
    responseSlaWorkingDays: 2,
    clientResponseWindowCalendarDays: 5,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow"
  }
} as const);

describe("AstroDiary paid-product fulfillment", () => {
  it("publishes only the canonical AstroDiary journal product", async () => {
    const product = astroDiaryProductForPublish();

    await expect(
      publishProduct({
        store: productStoreFor(product),
        ownerUserId: product.ownerUserId,
        productId: product.id,
        expectedRevision: product.revision,
        now: new Date("2026-01-02T00:00:00.000Z")
      })
    ).resolves.toMatchObject({ status: "active", revision: 2 });
  });

  it("keeps a non-canonical journal product blocked from publication", async () => {
    const product = {
      ...astroDiaryProductForPublish(),
      deliveryFormats: ["chat"] as const
    };

    await expect(
      publishProduct({
        store: productStoreFor(product),
        ownerUserId: product.ownerUserId,
        productId: product.id,
        expectedRevision: product.revision,
        now: new Date("2026-01-02T00:00:00.000Z")
      })
    ).rejects.toMatchObject({ code: "PRODUCT_FULFILLMENT_NOT_READY" });
  });

  it("registers the exact sealed AstroDiary one-time paid-period shape under its native key", async () => {
    const getDependencyStatus = vi.fn().mockResolvedValue("registered");

    await expect(
      resolvePaidProductFulfillment({
        product: exactAstroDiaryProduct,
        reader: { getDependencyStatus }
      })
    ).resolves.toMatchObject({
      supported: true,
      registryKey: "async.once.async.solo",
      registryRevision: 1
    });
    expect(getDependencyStatus).toHaveBeenCalledTimes(2);
  });

  it("does not accept the old recurring subscription shape as canonical AstroDiary", async () => {
    const getDependencyStatus = vi.fn().mockResolvedValue("registered");

    await expect(
      resolvePaidProductFulfillment({
        product: { ...exactAstroDiaryProduct, type: "sub", paymentModel: "sub" },
        reader: { getDependencyStatus }
      })
    ).resolves.toEqual({
      supported: false,
      code: "client_subscription_fulfillment_unsupported"
    });
    expect(getDependencyStatus).not.toHaveBeenCalled();
  });

  it.each([
    { name: "journal grant", patch: { accessGrants: [] } },
    { name: "Diary configuration", patch: { astroDiaryConfig: null } }
  ])("rejects a paid-period product without its exact $name", async ({ patch }) => {
    const getDependencyStatus = vi.fn().mockResolvedValue("registered");

    await expect(
      resolvePaidProductFulfillment({
        product: { ...exactAstroDiaryProduct, ...patch },
        reader: { getDependencyStatus }
      })
    ).resolves.toEqual({
      supported: false,
      code: "asynchronous_fulfillment_unsupported"
    });
    expect(getDependencyStatus).not.toHaveBeenCalled();
  });
});

function astroDiaryProductForPublish(): Product {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    ownerUserId: "10000000-0000-4000-8000-000000000002",
    status: "draft",
    revision: 1,
    title: "AstroDiary",
    subtitle: null,
    priceMinor: 4_900,
    currency: "RUB",
    coverMediaId: null,
    introVideoUrl: null,
    durationLabel: null,
    slaLabel: null,
    packageDiscountPercent: null,
    includedItems: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...exactAstroDiaryProduct
  };
}

function productStoreFor(product: Product): ProductStore {
  return {
    listByOwner: async () => ({
      products: [product],
      total: 1,
      counts: { all: 1, active: 0, draft: 1, archived: 0 }
    }),
    findByOwnerAndId: async () => product,
    create: async () => product,
    update: async ({ patch, now }) => ({
      outcome: "updated",
      product: {
        ...product,
        status: patch.status ?? product.status,
        revision: product.revision + 1,
        updatedAt: now
      }
    }),
    duplicate: async () => ({ outcome: "duplicated", product })
  };
}
