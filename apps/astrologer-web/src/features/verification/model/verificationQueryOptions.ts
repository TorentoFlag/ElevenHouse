import type { QueryClient } from "@tanstack/react-query";
import type { SubmitAstrologerVerificationRequest } from "@elevenhouse/contracts";
import { getCurrentAstrologerVerification } from "../api/getCurrentAstrologerVerification";
import { submitAstrologerVerificationApplication } from "../api/submitAstrologerVerificationApplication";

export const verificationQueryKeys = {
  all: () => ["verification"] as const,
  current: () => ["verification", "current"] as const
};

export function currentAstrologerVerificationQueryOptions() {
  return {
    queryKey: verificationQueryKeys.current(),
    queryFn: () => getCurrentAstrologerVerification()
  };
}

export function submitAstrologerVerificationMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (body: SubmitAstrologerVerificationRequest) =>
      submitAstrologerVerificationApplication(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: verificationQueryKeys.all() })
  };
}
