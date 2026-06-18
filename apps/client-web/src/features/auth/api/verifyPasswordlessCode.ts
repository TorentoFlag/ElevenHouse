import {
  verifyPasswordlessCodeRequestSchema,
  verifyPasswordlessCodeResponseSchema,
  type VerifyPasswordlessCodeRequest,
  type VerifyPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function verifyPasswordlessCode(
  request: VerifyPasswordlessCodeRequest
): Promise<VerifyPasswordlessCodeResponse> {
  const normalizedRequest = verifyPasswordlessCodeRequestSchema.parse(request);

  return verifyPasswordlessCodeResponseSchema.parse(
    await application.http.post("/identity/passwordless/verify-code", normalizedRequest)
  );
}
