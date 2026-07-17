import {
  availabilityScheduleResponseSchema,
  type AvailabilityScheduleResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";
import { HttpError } from "../../../common/http/HttpError";

export async function getAvailabilitySchedule(): Promise<AvailabilityScheduleResponse | null> {
  try {
    return availabilityScheduleResponseSchema.parse(
      await application.http.get("/availability/schedules/default")
    );
  } catch (error) {
    if (isMissingDefaultSchedule(error)) return null;
    throw error;
  }
}

function isMissingDefaultSchedule(error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status !== 404) return false;
  if (!error.body || typeof error.body !== "object") return false;
  return "code" in error.body && error.body.code === "schedule_not_found";
}
