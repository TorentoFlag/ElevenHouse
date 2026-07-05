import { getCurrentBillingOverview } from "../api/getCurrentBillingOverview";

export const platformBillingQueryKeys = {
  all: () => ["platformBilling"] as const,
  current: () => ["platformBilling", "current"] as const
};

export function currentBillingOverviewQueryOptions() {
  return {
    queryKey: platformBillingQueryKeys.current(),
    queryFn: () => getCurrentBillingOverview()
  };
}
