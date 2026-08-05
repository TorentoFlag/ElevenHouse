import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import {
  createTariffSubscriptionAttemptRegistry,
  tariffEntitlementsQueryOptions,
  platformTariffsQueryKeys,
  startAstrologerTariffSubscriptionMutationOptions,
  tariffCatalogQueryOptions
} from "./platformTariffsQueryOptions";

describe("platform tariff query options", () => {
  it("uses one catalog key and invalidates it after a successful tariff selection", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } satisfies Pick<QueryClient, "invalidateQueries">;

    expect(platformTariffsQueryKeys.all()).toEqual(["platformTariffs"]);
    expect(tariffCatalogQueryOptions().queryKey).toEqual(["platformTariffs", "catalog"]);
    expect(tariffEntitlementsQueryOptions().queryKey).toEqual([
      "platformTariffs",
      "entitlements"
    ]);

    await startAstrologerTariffSubscriptionMutationOptions(queryClient).onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["platformTariffs"] });
  });

  it("reuses the same idempotency key for one unresolved tariff-selection command", () => {
    const requestIds = ["request-1", "request-2"];
    const registry = createTariffSubscriptionAttemptRegistry(() => requestIds.shift()!);
    const selection = { tariffSeriesId: "pro", version: 1, billingCycle: "month" } as const;

    const first = registry.acquire(selection);
    expect(registry.acquire(selection)).toBe(first);
    expect(first).toBe("tariffs:subscription:request-1");

    registry.acknowledge(selection, first);
    expect(registry.acquire(selection)).toBe("tariffs:subscription:request-2");
  });
});
