import type { AstroCalendarRangeResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { astroCalendarRetryMutationOptions } from "./astroCalendarQueries";

export function useRetryAstroCalendarGenerationMutation(): UseMutationResult<
  AstroCalendarRangeResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation(astroCalendarRetryMutationOptions(queryClient));
}
