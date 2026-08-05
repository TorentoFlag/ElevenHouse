import type { StartAstrologerTariffSubscriptionInput } from "../api/platformTariffsApi";
import {
  getAstrologerTariffCatalog,
  getAstrologerTariffEntitlements,
  startAstrologerTariffSubscription
} from "../api/platformTariffsApi";
import type { QueryClient } from "@tanstack/react-query";

export const platformTariffsQueryKeys = {
  all: () => ["platformTariffs"] as const,
  catalog: () => ["platformTariffs", "catalog"] as const,
  entitlements: () => ["platformTariffs", "entitlements"] as const
};

export function tariffCatalogQueryOptions() {
  return {
    queryKey: platformTariffsQueryKeys.catalog(),
    queryFn: () => getAstrologerTariffCatalog()
  };
}

export function tariffEntitlementsQueryOptions() {
  return {
    queryKey: platformTariffsQueryKeys.entitlements(),
    queryFn: () => getAstrologerTariffEntitlements()
  };
}

export function startAstrologerTariffSubscriptionMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: StartAstrologerTariffSubscriptionInput) =>
      startAstrologerTariffSubscription(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformTariffsQueryKeys.all() })
  };
}

export function createTariffSubscriptionAttemptRegistry(
  createRequestId: () => string = () => crypto.randomUUID()
) {
  const attempts = new Map<string, string>();

  return {
    acquire(selection: StartAstrologerTariffSubscriptionInput["body"]): string {
      const key = selectionKey(selection);
      const existing = attempts.get(key);
      if (existing) return existing;

      const idempotencyKey = `tariffs:subscription:${createRequestId()}`;
      attempts.set(key, idempotencyKey);
      return idempotencyKey;
    },
    acknowledge(
      selection: StartAstrologerTariffSubscriptionInput["body"],
      idempotencyKey: string
    ): void {
      const key = selectionKey(selection);
      if (attempts.get(key) === idempotencyKey) attempts.delete(key);
    }
  };
}

function selectionKey(selection: StartAstrologerTariffSubscriptionInput["body"]): string {
  return `${selection.tariffSeriesId}:${selection.version}:${selection.billingCycle}`;
}
