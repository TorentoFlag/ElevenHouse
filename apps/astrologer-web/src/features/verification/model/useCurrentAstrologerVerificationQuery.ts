import { useQuery } from "@tanstack/react-query";
import { currentAstrologerVerificationQueryOptions } from "./verificationQueryOptions";

export function useCurrentAstrologerVerificationQuery() {
  return useQuery(currentAstrologerVerificationQueryOptions());
}
