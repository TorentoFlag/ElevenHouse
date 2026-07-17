import {
  availabilityScheduleResponseSchema,
  putDefaultAvailabilityScheduleRequestSchema,
  type AvailabilityScheduleResponse,
  type PutDefaultAvailabilityScheduleRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function putDefaultAvailabilitySchedule(
  input: PutDefaultAvailabilityScheduleRequest
): Promise<AvailabilityScheduleResponse> {
  const body = putDefaultAvailabilityScheduleRequestSchema.parse(input);

  return availabilityScheduleResponseSchema.parse(
    await application.http.put("/availability/schedules/default", body, { csrf: true })
  );
}
