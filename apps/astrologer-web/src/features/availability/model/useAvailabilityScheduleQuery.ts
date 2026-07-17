import { useQuery } from "@tanstack/react-query";
import { getAvailabilitySchedule } from "../api/getAvailabilitySchedule";

export const availabilityQueryKeys = {
  all: () => ["availability"] as const,
  defaultSchedule: () => ["availability", "schedules", "default"] as const
};

export function useAvailabilityScheduleQuery(enabled = true) {
  return useQuery({
    queryKey: availabilityQueryKeys.defaultSchedule(),
    queryFn: getAvailabilitySchedule,
    enabled
  });
}
