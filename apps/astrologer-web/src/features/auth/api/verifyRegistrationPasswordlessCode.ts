import {
  verifyAstrologerRegistrationPasswordlessCodeRequestSchema,
  verifyAstrologerRegistrationPasswordlessCodeResponseSchema,
  type VerifyAstrologerRegistrationPasswordlessCodeRequest,
  type VerifyAstrologerRegistrationPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function verifyRegistrationPasswordlessCode(
  request: VerifyAstrologerRegistrationPasswordlessCodeRequest
): Promise<VerifyAstrologerRegistrationPasswordlessCodeResponse> {
  const normalizedRequest = verifyAstrologerRegistrationPasswordlessCodeRequestSchema.parse(request);

  return verifyAstrologerRegistrationPasswordlessCodeResponseSchema.parse(
    await application.http.post(
      "/identity/astrologer/registration/passwordless/verify-code",
      normalizedRequest
    )
  );
}
