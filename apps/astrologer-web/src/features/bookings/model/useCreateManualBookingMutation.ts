import type { ManualBookingResponse } from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  createManualBooking,
  type CreateManualBookingInput
} from "../api/createManualBooking";
import { calendarQueryKeys } from "../../calendar/model/useCalendarRangeQuery";
import { availableBookingSlotsQueryKeys } from "./useAvailableBookingSlotsQuery";

export function useCreateManualBookingMutation(): UseMutationResult<
  ManualBookingResponse,
  Error,
  CreateManualBookingInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createManualBooking,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all() }),
        queryClient.invalidateQueries({ queryKey: availableBookingSlotsQueryKeys.all() })
      ]);
    }
  });
}
