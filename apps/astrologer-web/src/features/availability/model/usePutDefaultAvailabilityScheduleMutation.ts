import type {
  AvailabilityScheduleResponse,
  PutDefaultAvailabilityScheduleRequest
} from "@elevenhouse/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { putDefaultAvailabilitySchedule } from "../api/putDefaultAvailabilitySchedule";
import { calendarQueryKeys } from "../../calendar/model/useCalendarRangeQuery";
import { availabilityQueryKeys } from "./useAvailabilityScheduleQuery";

export function usePutDefaultAvailabilityScheduleMutation(): UseMutationResult<
  AvailabilityScheduleResponse,
  Error,
  PutDefaultAvailabilityScheduleRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: putDefaultAvailabilitySchedule,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.all() }),
        queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all() })
      ]);
    }
  });
}
