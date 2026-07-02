import type {
  CreateProductRequest,
  ListProductsResponse,
  ProductResponse,
  ProductSummaryResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { archiveProduct } from "./archiveProduct";
import { createProduct } from "./createProduct";
import { duplicateProduct } from "./duplicateProduct";
import { getProduct } from "./getProduct";
import { getProductSummary } from "./getProductSummary";
import { listProducts } from "./listProducts";
import { moveProductToDraft } from "./moveProductToDraft";
import { publishProduct } from "./publishProduct";
import { updateProduct } from "./updateProduct";

const productId = "11111111-1111-4111-8111-111111111111";

const createProductRequest = {
  type: "single",
  title: " Натальный разбор ",
  subtitle: " Полный разбор карты ",
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: "cover-1",
  introVideoUrl: "https://video.example/intro",
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: "60 мин",
  participantMode: "solo",
  deliveryFormats: ["video"],
  requiredClientData: ["chart1"],
  methods: ["natal"],
  accessGrants: [],
  includedItems: [{ text: "Полный разбор карты", icon: "check", order: 10 }],
  modifiers: []
} satisfies CreateProductRequest;

const productResponse = {
  id: productId,
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  status: "draft",
  type: "single",
  title: "Натальный разбор",
  subtitle: "Полный разбор карты",
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: "cover-1",
  introVideoUrl: "https://video.example/intro",
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

const listProductsResponse = {
  products: [productResponse],
  total: 1,
  counts: {
    all: 1,
    active: 0,
    draft: 1,
    archived: 0
  }
} satisfies ListProductsResponse;

const productSummaryResponse = {
  total: 1,
  active: 0,
  draft: 1,
  archived: 0,
  totalSalesCount: 0,
  grossRevenueMinor: 0,
  currency: "RUB",
  bestseller: null
} satisfies ProductSummaryResponse;

describe("products API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads products with serialized filters through the shared response contract", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(listProductsResponse);

    await expect(listProducts({ status: "draft", limit: 20, offset: 40 })).resolves.toEqual(
      listProductsResponse
    );

    expect(get).toHaveBeenCalledWith("/products?status=draft&limit=20&offset=40");
  });

  it("loads product summary and product details through shared response contracts", async () => {
    const get = vi
      .spyOn(application.http, "get")
      .mockResolvedValueOnce(productSummaryResponse)
      .mockResolvedValueOnce(productResponse);

    await expect(getProductSummary()).resolves.toEqual(productSummaryResponse);
    await expect(getProduct(productId)).resolves.toEqual(productResponse);

    expect(get).toHaveBeenNthCalledWith(1, "/products/summary");
    expect(get).toHaveBeenNthCalledWith(2, `/products/${productId}`);
  });

  it("rejects product API responses that do not match shared contracts", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({ products: [{ id: "not-a-uuid" }] });

    await expect(listProducts({ status: "all", limit: 50, offset: 0 })).rejects.toThrow();
  });

  it("creates and updates products through protected contract-backed requests", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(productResponse);
    const put = vi.spyOn(application.http, "put").mockResolvedValue({
      ...productResponse,
      subtitle: null,
      durationMinutes: null
    });

    await expect(createProduct(createProductRequest)).resolves.toEqual(productResponse);
    await expect(
      updateProduct({
        productId,
        body: {
          subtitle: null,
          durationMinutes: null
        }
      })
    ).resolves.toMatchObject({
      id: productId,
      subtitle: null,
      durationMinutes: null
    });

    expect(post).toHaveBeenCalledWith(
      "/products",
      {
        ...createProductRequest,
        title: "Натальный разбор",
        subtitle: "Полный разбор карты"
      },
      { csrf: true }
    );
    expect(put).toHaveBeenCalledWith(
      `/products/${productId}`,
      {
        subtitle: null,
        durationMinutes: null
      },
      { csrf: true }
    );
  });

  it("runs product lifecycle actions through protected endpoints", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(productResponse);

    await publishProduct(productId);
    await moveProductToDraft(productId);
    await archiveProduct(productId);
    await duplicateProduct(productId);

    expect(post).toHaveBeenNthCalledWith(1, `/products/${productId}/publish`, undefined, {
      csrf: true
    });
    expect(post).toHaveBeenNthCalledWith(2, `/products/${productId}/move-to-draft`, undefined, {
      csrf: true
    });
    expect(post).toHaveBeenNthCalledWith(3, `/products/${productId}/archive`, undefined, {
      csrf: true
    });
    expect(post).toHaveBeenNthCalledWith(4, `/products/${productId}/duplicate`, undefined, {
      csrf: true
    });
  });
});
