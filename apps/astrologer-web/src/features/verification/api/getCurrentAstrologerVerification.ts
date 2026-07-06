import {
  getAstrologerVerificationResponseSchema,
  type GetAstrologerVerificationResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getCurrentAstrologerVerification(): Promise<GetAstrologerVerificationResponse> {
  return getAstrologerVerificationResponseSchema.parse(
    await application.http.get("/verification/me")
  );
}
