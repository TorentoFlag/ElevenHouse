import { useQuery } from "@tanstack/react-query";
import { getClientCabinetOverview } from "../../client-profile/api/clientProfileApi";
import { astroDiaryQueryKeys } from "./astroDiaryQueries";

export function useClientAstroDiaryRelationshipQuery() {
  return useQuery({
    queryKey: astroDiaryQueryKeys.relationship(),
    queryFn: getClientCabinetOverview
  });
}
