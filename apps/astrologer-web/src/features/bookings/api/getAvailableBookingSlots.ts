import {
  availableBookingSlotsQuerySchema,
  availableBookingSlotsResponseSchema,
  type AvailableBookingSlotsQuery,
  type AvailableBookingSlotsResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getAvailableBookingSlots(
  query: AvailableBookingSlotsQuery
): Promise<AvailableBookingSlotsResponse> {
  const parsed = availableBookingSlotsQuerySchema.parse(query);
  const search = new URLSearchParams({
    productId: parsed.productId,
    start: parsed.start,
    end: parsed.end
  });

  return availableBookingSlotsResponseSchema.parse(
    await application.http.get(`/bookings/available-slots?${search.toString()}`)
  );
}
