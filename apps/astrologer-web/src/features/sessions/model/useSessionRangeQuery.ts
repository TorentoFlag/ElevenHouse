import { useQuery } from "@tanstack/react-query";
import { sessionApi } from "../api/sessionApi";

export function useSessionRangeQuery(rangeStartAt: string, rangeEndAt: string) {
  return useQuery({
    queryKey: ["sessions", "range", rangeStartAt, rangeEndAt],
    queryFn: () => sessionApi.list({ rangeStartAt, rangeEndAt })
  });
}
