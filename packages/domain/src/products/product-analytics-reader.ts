import type { ProductCurrency } from "./product-types";

export type ProductLifetimeAnalytics = {
  readonly productId: string;
  readonly salesCount: number;
  readonly grossRevenueMinor: number;
  readonly currency: ProductCurrency;
  readonly averageRating: number | null;
  readonly reviewsCount: number;
};

export type ProductCatalogLifetimeAnalyticsSummary = {
  readonly totalSalesCount: number;
  readonly grossRevenueMinor: number;
  readonly currency: ProductCurrency;
  readonly bestseller: {
    readonly productId: string;
    readonly title: string;
    readonly salesCount: number;
  } | null;
};

export type ProductAnalyticsReader = {
  readonly getLifetimeAnalytics: (input: {
    readonly ownerUserId: string;
    readonly productIds: readonly string[];
  }) => Promise<ReadonlyMap<string, ProductLifetimeAnalytics>>;
  readonly getCatalogLifetimeSummary: (input: {
    readonly ownerUserId: string;
  }) => Promise<ProductCatalogLifetimeAnalyticsSummary>;
};
