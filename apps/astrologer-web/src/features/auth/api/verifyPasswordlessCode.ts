import {
  verifyAstrologerPasswordlessCodeRequestSchema,
  verifyAstrologerPasswordlessCodeResponseSchema,
  type VerifyAstrologerPasswordlessCodeRequest,
  type VerifyAstrologerPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function verifyPasswordlessCode(
  request: VerifyAstrologerPasswordlessCodeRequest
): Promise<VerifyAstrologerPasswordlessCodeResponse> {
  const normalizedRequest = verifyAstrologerPasswordlessCodeRequestSchema.parse(request);

  return verifyAstrologerPasswordlessCodeResponseSchema.parse(
    await application.http.post("/identity/astrologer/passwordless/verify-code", normalizedRequest)
  );
}
