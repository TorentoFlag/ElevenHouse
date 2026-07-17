import type { ManualBlockResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  createManualBlock,
  type CreateManualBlockInput
} from "../api/createManualBlock";
import { calendarQueryKeys } from "./useCalendarRangeQuery";

export function useCreateManualBlockMutation(): UseMutationResult<
  ManualBlockResponse,
  Error,
  CreateManualBlockInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createManualBlock,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all() })
  });
}
