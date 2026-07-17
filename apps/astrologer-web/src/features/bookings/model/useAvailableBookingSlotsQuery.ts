import type { AvailableBookingSlotsQuery } from "@elevenhouse/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAvailableBookingSlots } from "../api/getAvailableBookingSlots";

export const availableBookingSlotsQueryKeys = {
  all: () => ["bookings", "available-slots"] as const,
  range: (query: AvailableBookingSlotsQuery) =>
    [...availableBookingSlotsQueryKeys.all(), query] as const
};

export function useAvailableBookingSlotsQuery(
  query: AvailableBookingSlotsQuery,
  enabled: boolean
) {
  return useQuery({
    queryKey: availableBookingSlotsQueryKeys.range(query),
    queryFn: () => getAvailableBookingSlots(query),
    placeholderData: keepPreviousData,
    enabled
  });
}
