import type {
  AstroCalendarGenerationRequest,
  AstroCalendarRangeResponse
} from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { astroCalendarGenerationMutationOptions } from "./astroCalendarQueries";

export function useCreateAstroCalendarGenerationMutation(): UseMutationResult<
  AstroCalendarRangeResponse,
  Error,
  AstroCalendarGenerationRequest
> {
  const queryClient = useQueryClient();

  return useMutation(astroCalendarGenerationMutationOptions(queryClient));
}
