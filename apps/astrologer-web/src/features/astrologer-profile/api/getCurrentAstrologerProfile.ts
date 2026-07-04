import {
  getAstrologerProfileResponseSchema,
  type GetAstrologerProfileResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getCurrentAstrologerProfile(): Promise<GetAstrologerProfileResponse> {
  return getAstrologerProfileResponseSchema.parse(
    await application.http.get("/astrologer-profile/me")
  );
}
