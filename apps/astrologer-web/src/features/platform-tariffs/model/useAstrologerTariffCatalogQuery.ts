import { useQuery } from "@tanstack/react-query";
import { tariffCatalogQueryOptions } from "./platformTariffsQueryOptions";

export function useAstrologerTariffCatalogQuery() {
  return useQuery(tariffCatalogQueryOptions());
}
