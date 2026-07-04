import type { ProductResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { persistProductDraft } from "./productCreateFlowPersistence";
import { createDefaultProductDraft } from "./productDraft";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  type: "single",
  status: "draft",
  title: "Натальный разбор",
  subtitle: null,
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: null,
  introVideoUrl: null,
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: "60 мин",
  slaLabel: null,
  packageSessionCount: null,
  packageDiscountPercent: null,
  subscriptionPeriod: null,
  trialDays: null,
  participantMode: "solo",
  groupSize: null,
  deliveryFormats: ["video"],
  requiredClientData: ["chart1"],
  methods: ["natal"],
  accessGrants: [],
  includedItems: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      text: "Полный разбор карты",
      icon: "check",
      order: 10
    }
  ],
  modifiers: [],
  analytics: {
    salesCount: 0,
    grossRevenueMinor: 0,
    currency: "RUB",
    averageRating: null,
    reviewsCount: 0
  },
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z"
} satisfies ProductResponse;

describe("persistProductDraft", () => {
  it("creates a draft and publishes the created product when publish is requested", async () => {
    const createProduct = vi.fn(async () => product);
    const publishProduct = vi.fn(async () => ({ ...product, status: "active" as const }));

    await expect(
      persistProductDraft({
        draft: { ...createDefaultProductDraft("single"), title: product.title },
        editingProductId: null,
        publish: true,
        createProduct,
        updateProduct: vi.fn(),
        publishProduct
      })
    ).resolves.toEqual({ status: "saved" });

    expect(createProduct).toHaveBeenCalledOnce();
    expect(publishProduct).toHaveBeenCalledWith(product.id);
  });

  it("returns the persisted product when create succeeds but publish fails", async () => {
    const createProduct = vi.fn(async () => product);
    const publishProduct = vi.fn(async () => {
      throw new Error("Publish failed");
    });

    await expect(
      persistProductDraft({
        draft: { ...createDefaultProductDraft("single"), title: product.title },
        editingProductId: null,
        publish: true,
        createProduct,
        updateProduct: vi.fn(),
        publishProduct
      })
    ).resolves.toEqual({
      status: "failed",
      persistedProduct: product
    });

    expect(createProduct).toHaveBeenCalledOnce();
    expect(publishProduct).toHaveBeenCalledWith(product.id);
  });

  it("updates the existing product instead of creating another one", async () => {
    const updateProduct = vi.fn(async () => product);

    await persistProductDraft({
      draft: { ...createDefaultProductDraft("single"), title: product.title },
      editingProductId: product.id,
      publish: false,
      createProduct: vi.fn(),
      updateProduct,
      publishProduct: vi.fn()
    });

    expect(updateProduct).toHaveBeenCalledWith({
      productId: product.id,
      body: expect.objectContaining({ title: product.title })
    });
  });
});
