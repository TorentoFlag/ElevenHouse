import {
  astrologerProfileResponseSchema,
  upsertAstrologerProfileRequestSchema,
  type AstrologerProfileResponse,
  type UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function upsertCurrentAstrologerProfile(
  body: UpsertAstrologerProfileRequest
): Promise<AstrologerProfileResponse> {
  const normalizedBody = upsertAstrologerProfileRequestSchema.parse(body);

  return astrologerProfileResponseSchema.parse(
    await application.http.put("/astrologer-profile/me", normalizedBody, { csrf: true })
  );
}
