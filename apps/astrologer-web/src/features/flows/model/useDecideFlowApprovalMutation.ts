import type { DecideFlowApprovalResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { type DecideFlowApprovalInput } from "../api/decideFlowApproval";
import { decideFlowApprovalMutationOptions } from "./flowsQueryOptions";

export function useDecideFlowApprovalMutation(): UseMutationResult<
  DecideFlowApprovalResponse,
  Error,
  DecideFlowApprovalInput
> {
  const queryClient = useQueryClient();

  return useMutation(decideFlowApprovalMutationOptions(queryClient));
}
