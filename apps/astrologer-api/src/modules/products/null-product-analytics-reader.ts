import type {
  ProductAnalyticsReader,
  ProductCatalogLifetimeAnalyticsSummary,
  ProductLifetimeAnalytics
} from "@elevenhouse/domain";

export class NullProductAnalyticsReader implements ProductAnalyticsReader {
  async getLifetimeAnalytics(input: {
    readonly productIds: readonly string[];
  }): Promise<ReadonlyMap<string, ProductLifetimeAnalytics>> {
    return new Map(
      input.productIds.map((productId) => [
        productId,
        {
          status: "unavailable",
          productId,
          salesCount: 0,
          grossRevenueMinor: 0,
          currency: "RUB",
          averageRating: null,
          reviewsCount: 0
        }
      ])
    );
  }

  async getCatalogLifetimeSummary(): Promise<ProductCatalogLifetimeAnalyticsSummary> {
    return {
      analyticsStatus: "unavailable",
      totalSalesCount: 0,
      grossRevenueMinor: 0,
      currency: "RUB",
      bestseller: null
    };
  }
}
