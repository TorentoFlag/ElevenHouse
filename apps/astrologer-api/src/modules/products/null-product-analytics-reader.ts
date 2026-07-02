import type { ProductAnalyticsReader, ProductLifetimeAnalytics } from "@elevenhouse/domain";

export class NullProductAnalyticsReader implements ProductAnalyticsReader {
  async getLifetimeAnalytics(input: {
    readonly productIds: readonly string[];
  }): Promise<ReadonlyMap<string, ProductLifetimeAnalytics>> {
    return new Map(
      input.productIds.map((productId) => [
        productId,
        {
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
}
