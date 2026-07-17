import type { ManualBlockResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { releaseManualBlock } from "../api/releaseManualBlock";
import { calendarQueryKeys } from "./useCalendarRangeQuery";

export function useReleaseManualBlockMutation(): UseMutationResult<
  ManualBlockResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: releaseManualBlock,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all() })
  });
}
