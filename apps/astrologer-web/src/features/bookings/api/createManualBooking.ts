import {
  createManualBookingRequestSchema,
  manualBookingResponseSchema,
  type CreateManualBookingRequest,
  type ManualBookingResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type CreateManualBookingInput = {
  readonly body: CreateManualBookingRequest;
  readonly idempotencyKey: string;
};

export async function createManualBooking(
  input: CreateManualBookingInput
): Promise<ManualBookingResponse> {
  const body = createManualBookingRequestSchema.parse(input.body);

  return manualBookingResponseSchema.parse(
    await application.http.post("/bookings/manual", body, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
