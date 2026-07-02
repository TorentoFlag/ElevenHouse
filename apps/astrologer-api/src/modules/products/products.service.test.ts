import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  type Product,
  type ProductAnalyticsReader,
  type ProductCatalogLifetimeAnalyticsSummary,
  type ProductLifetimeAnalytics,
  type ProductStore,
  type ProductStoreCreateInput,
  ProductValidationError
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ProductsService } from "./products.service";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const productId = "463f34bb-38ec-4cb4-b105-2ed6de91e3cb";
const now = new Date("2026-07-02T00:00:00.000Z");

describe("ProductsService", () => {
  it("creates products for the current astrologer and returns null analytics", async () => {
    const store = createStore();
    const service = createService(store);

    const response = await service.createProduct(validCreateBody(), createAuthenticatedRequest());

    expect(response.ownerUserId).toBe(ownerUserId);
    expect(response.status).toBe("draft");
    expect(response.analytics).toEqual({
      salesCount: 0,
      grossRevenueMinor: 0,
      currency: "RUB",
      averageRating: null,
      reviewsCount: 0
    });
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        status: "draft",
        title: "Натальный разбор",
        now: "2026-07-02T00:00:00.000Z"
      })
    );
  });

  it("lists products and summary for the current astrologer", async () => {
    const store = createStore();
    const service = createService(store);

    await service.createProduct(validCreateBody(), createAuthenticatedRequest());
    await service.publishProduct(productId, createAuthenticatedRequest());

    await expect(
      service.listProducts({ status: "active", limit: "20", offset: "0" }, createAuthenticatedRequest())
    ).resolves.toMatchObject({
      total: 1,
      counts: {
        all: 1,
        active: 1,
        draft: 0,
        archived: 0
      },
      products: [expect.objectContaining({ id: productId, status: "active" })]
    });
    await expect(service.getSummary(createAuthenticatedRequest())).resolves.toEqual({
      total: 1,
      active: 1,
      draft: 0,
      archived: 0,
      totalSalesCount: 0,
      grossRevenueMinor: 0,
      currency: "RUB",
      bestseller: null
    });
  });

  it("maps invalid body and params to BadRequestException", async () => {
    const service = createService(createStore());

    await expect(service.createProduct({ title: "" }, createAuthenticatedRequest())).rejects.toThrow(
      BadRequestException
    );
    await expect(
      service.getProduct("not-a-uuid", createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createProduct(
        { ...validCreateBody(), deliveryFormats: ["video", "video"] },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(BadRequestException);
  });

  it("maps missing products to NotFoundException", async () => {
    const service = createService(
      createStore({
        findByOwnerAndId: vi.fn(async () => null),
        update: vi.fn(async () => null)
      })
    );

    await expect(service.getProduct(productId, createAuthenticatedRequest())).rejects.toThrow(
      NotFoundException
    );
    await expect(service.publishProduct(productId, createAuthenticatedRequest())).rejects.toThrow(
      NotFoundException
    );
  });

  it("maps domain validation errors to BadRequestException", async () => {
    const service = createService(
      createStore({
        update: vi.fn(async () => {
          throw new ProductValidationError("Invalid product state");
        })
      })
    );
    await service.createProduct(validCreateBody(), createAuthenticatedRequest());

    await expect(
      service.updateProduct(productId, { title: "Валидный заголовок" }, createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects requests without authenticated astrologer context", async () => {
    const service = createService(createStore());

    await expect(service.listProducts({}, { headers: {} })).rejects.toThrow(UnauthorizedException);
  });
});

function createService(store: ProductStore): ProductsService {
  return new ProductsService(store, createNullAnalyticsReader(), createClock());
}

function createClock(): SystemClock {
  return {
    now: () => now
  };
}

function createNullAnalyticsReader(): ProductAnalyticsReader {
  return {
    getLifetimeAnalytics: vi.fn(async (input) => {
      const analytics = new Map<string, ProductLifetimeAnalytics>(
        input.productIds.map((id: string) => [
          id,
          {
            productId: id,
            salesCount: 0,
            grossRevenueMinor: 0,
            currency: "RUB" as const,
            averageRating: null,
            reviewsCount: 0
          }
        ])
      );
      return analytics;
    }),
    getCatalogLifetimeSummary: vi.fn(async (): Promise<ProductCatalogLifetimeAnalyticsSummary> => ({
      totalSalesCount: 0,
      grossRevenueMinor: 0,
      currency: "RUB",
      bestseller: null
    }))
  };
}

function createStore(overrides: Partial<ProductStore> = {}): ProductStore {
  const products: Product[] = [];

  return {
    listByOwner: vi.fn(async (query) => {
      const owned = products.filter((product) => product.ownerUserId === query.ownerUserId);
      const filtered =
        query.status === "all"
          ? owned
          : owned.filter((product) => product.status === query.status);

      return {
        products: filtered.slice(query.offset, query.offset + query.limit),
        total: filtered.length,
        counts: {
          all: owned.length,
          active: owned.filter((product) => product.status === "active").length,
          draft: owned.filter((product) => product.status === "draft").length,
          archived: owned.filter((product) => product.status === "archived").length
        }
      };
    }),
    findByOwnerAndId: vi.fn(async (input) =>
      products.find(
        (product) => product.ownerUserId === input.ownerUserId && product.id === input.productId
      ) ?? null
    ),
    create: vi.fn(async (input) => {
      const product = toProduct(productId, input);
      products.unshift(product);
      return product;
    }),
    update: vi.fn(async (input) => {
      const index = products.findIndex(
        (product) => product.ownerUserId === input.ownerUserId && product.id === input.productId
      );
      if (index === -1) return null;

      const current = products[index] ?? raise("Expected product index to resolve");
      const next: Product = {
        ...current,
        ...input.patch,
        updatedAt: input.now
      };
      products[index] = next;
      return next;
    }),
    duplicate: vi.fn(async (input) => {
      const product = toProduct("a47d6537-720b-47e4-a1ef-ed7ba82bb2f0", input);
      products.unshift(product);
      return product;
    }),
    ...overrides
  };
}

function toProduct(id: string, input: ProductStoreCreateInput): Product {
  return {
    id,
    ownerUserId: input.ownerUserId,
    type: input.type,
    status: input.status,
    title: input.title,
    subtitle: input.subtitle,
    priceMinor: input.priceMinor,
    currency: input.currency,
    coverMediaId: input.coverMediaId,
    introVideoUrl: input.introVideoUrl,
    executionMode: input.executionMode,
    paymentModel: input.paymentModel,
    durationMinutes: input.durationMinutes,
    durationLabel: input.durationLabel,
    slaLabel: input.slaLabel,
    packageSessionCount: input.packageSessionCount,
    packageDiscountPercent: input.packageDiscountPercent,
    subscriptionPeriod: input.subscriptionPeriod,
    trialDays: input.trialDays,
    participantMode: input.participantMode,
    groupSize: input.groupSize,
    deliveryFormats: input.deliveryFormats,
    requiredClientData: input.requiredClientData,
    methods: input.methods,
    accessGrants: input.accessGrants,
    includedItems: input.includedItems.map((item, index) => ({
      id: `11111111-1111-4111-8111-11111111111${index}`,
      ...item
    })),
    modifiers: input.modifiers.map((modifier, index) => ({
      id: `22222222-2222-4222-8222-22222222222${index}`,
      ...modifier
    })),
    createdAt: input.now,
    updatedAt: input.now
  };
}

function validCreateBody(): Record<string, unknown> {
  return {
    type: "single",
    title: "Натальный разбор",
    subtitle: "Полный разбор",
    priceMinor: 490000,
    currency: "RUB",
    coverMediaId: "cover-1",
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
  };
}

function createAuthenticatedRequest(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: ownerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}

function raise(message: string): never {
  throw new Error(message);
}
