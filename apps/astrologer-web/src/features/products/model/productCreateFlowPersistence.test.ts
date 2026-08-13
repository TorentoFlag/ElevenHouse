import type { CreateProductRequest, ProductResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { persistProductDraft } from "./productCreateFlowPersistence";
import { createDefaultProductDraft } from "./productDraft";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  revision: 7,
  type: "single",
  status: "draft",
  title: "Натальный разбор",
  subtitle: null,
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: null,
  coverMedia: null,
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
  astroDiaryConfig: null,
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
    const createProduct = vi.fn(async (): Promise<ProductResponse> => product);
    const publishProduct = vi.fn(async () => ({ ...product, status: "active" as const }));

    await expect(
      persistProductDraft({
        draft: { ...createDefaultProductDraft("single"), title: product.title },
        editingProduct: null,
        publish: true,
        createProduct,
        updateProduct: vi.fn(),
        publishProduct
      })
    ).resolves.toEqual({ status: "saved" });

    expect(createProduct).toHaveBeenCalledOnce();
    expect(publishProduct).toHaveBeenCalledWith({
      productId: product.id,
      expectedRevision: product.revision
    });
  });

  it("returns the persisted product when create succeeds but publish fails", async () => {
    const createProduct = vi.fn(async () => product);
    const publishFailure = new Error("Publish failed");
    const publishProduct = vi.fn(async () => {
      throw publishFailure;
    });

    await expect(
      persistProductDraft({
        draft: { ...createDefaultProductDraft("single"), title: product.title },
        editingProduct: null,
        publish: true,
        createProduct,
        updateProduct: vi.fn(),
        publishProduct
      })
    ).resolves.toEqual({
      status: "failed",
      persistedProduct: product,
      error: publishFailure
    });

    expect(createProduct).toHaveBeenCalledOnce();
    expect(publishProduct).toHaveBeenCalledWith({
      productId: product.id,
      expectedRevision: product.revision
    });
  });

  it("returns the original error when persistence fails before a product exists", async () => {
    const persistenceFailure = new Error("Create failed");
    const createProduct = vi.fn(async (): Promise<ProductResponse> => {
      throw persistenceFailure;
    });

    await expect(
      persistProductDraft({
        draft: { ...createDefaultProductDraft("single"), title: product.title },
        editingProduct: null,
        publish: false,
        createProduct,
        updateProduct: vi.fn(),
        publishProduct: vi.fn()
      })
    ).resolves.toEqual({
      status: "failed",
      error: persistenceFailure
    });
  });

  it("updates the existing product instead of creating another one", async () => {
    const updateProduct = vi.fn(async () => product);

    await persistProductDraft({
      draft: { ...createDefaultProductDraft("single"), title: product.title },
      editingProduct: { id: product.id, revision: 6 },
      publish: false,
      createProduct: vi.fn(),
      updateProduct,
      publishProduct: vi.fn()
    });

    expect(updateProduct).toHaveBeenCalledWith({
      productId: product.id,
      body: expect.objectContaining({ expectedRevision: 6, title: product.title })
    });
  });

  it("persists the visible preview composition instead of draft-only included items", async () => {
    const createProduct = vi.fn(async () => product);
    const visibleIncludedItems = [
      { text: "Видео · 60 мин", icon: "video", order: 1 },
      { text: "Полный разбор карты", icon: "check", order: 10 }
    ];

    await persistProductDraft({
      draft: {
        ...createDefaultProductDraft("single"),
        title: product.title,
        includedItems: [{ text: "Полный разбор карты", icon: "check", order: 10 }]
      },
      visibleIncludedItems,
      editingProduct: null,
      publish: false,
      createProduct,
      updateProduct: vi.fn(),
      publishProduct: vi.fn()
    });

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        includedItems: visibleIncludedItems
      })
    );
  });

  it("normalizes hidden type-specific fields before creating a guided product", async () => {
    let body: CreateProductRequest | undefined;
    const createProduct = vi.fn(async (requestBody: CreateProductRequest) => {
      body = requestBody;
      return product;
    });

    await persistProductDraft({
      draft: {
        ...createDefaultProductDraft("single"),
        title: product.title,
        paymentModel: "sub",
        subscriptionPeriod: "month",
        trialDays: 14
      },
      editingProduct: null,
      publish: false,
      createProduct,
      updateProduct: vi.fn(),
      publishProduct: vi.fn()
    });

    expect(body).toMatchObject({
      type: "single",
      paymentModel: "once",
      executionMode: "live",
      subscriptionPeriod: undefined,
      trialDays: undefined
    });
  });
});
