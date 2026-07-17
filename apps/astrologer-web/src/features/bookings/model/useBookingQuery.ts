import { useQuery } from "@tanstack/react-query";
import { getBooking } from "../api/getBooking";

export const bookingQueryKeys = {
  detail: (bookingId: string) => ["bookings", "detail", bookingId] as const
};

export function useBookingQuery(bookingId: string) {
  return useQuery({
    queryKey: bookingQueryKeys.detail(bookingId),
    queryFn: () => getBooking(bookingId),
    enabled: Boolean(bookingId)
  });
}
