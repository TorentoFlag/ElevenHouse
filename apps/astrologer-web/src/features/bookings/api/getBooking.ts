import { bookingParamsSchema, bookingResponseSchema } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getBooking(bookingId: string) {
  const params = bookingParamsSchema.parse({ bookingId });

  return bookingResponseSchema.parse(await application.http.get(`/bookings/${params.bookingId}`));
}
