import { useQuery } from "@tanstack/react-query";
import { tariffEntitlementsQueryOptions } from "./platformTariffsQueryOptions";

/** The app shell consumes only the server's entitlement projection. */
export function useAstrologerTariffEntitlementsQuery() {
  return useQuery(tariffEntitlementsQueryOptions());
}
