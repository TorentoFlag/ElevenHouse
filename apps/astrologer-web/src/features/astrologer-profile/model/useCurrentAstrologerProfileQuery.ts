import { useQuery } from "@tanstack/react-query";
import { currentAstrologerProfileQueryOptions } from "./astrologerProfileQueryOptions";

export function useCurrentAstrologerProfileQuery() {
  return useQuery(currentAstrologerProfileQueryOptions());
}
