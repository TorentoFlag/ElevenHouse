import {
  verifyRegistrationPasswordlessCodeRequestSchema,
  verifyRegistrationPasswordlessCodeResponseSchema,
  type VerifyRegistrationPasswordlessCodeRequest,
  type VerifyRegistrationPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function verifyRegistrationPasswordlessCode(
  request: VerifyRegistrationPasswordlessCodeRequest
): Promise<VerifyRegistrationPasswordlessCodeResponse> {
  const normalizedRequest = verifyRegistrationPasswordlessCodeRequestSchema.parse(request);

  return verifyRegistrationPasswordlessCodeResponseSchema.parse(
    await application.http.post(
      "/identity/registration/passwordless/verify-code",
      normalizedRequest
    )
  );
}
