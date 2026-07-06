import type {
  SubmitAstrologerVerificationRequest,
  VerificationApplicationResponse
} from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { submitAstrologerVerificationMutationOptions } from "./verificationQueryOptions";

export function useSubmitAstrologerVerificationMutation(): UseMutationResult<
  VerificationApplicationResponse,
  Error,
  SubmitAstrologerVerificationRequest
> {
  const queryClient = useQueryClient();

  return useMutation(submitAstrologerVerificationMutationOptions(queryClient));
}
