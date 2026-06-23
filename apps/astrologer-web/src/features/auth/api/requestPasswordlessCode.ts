import {
  requestAstrologerPasswordlessCodeRequestSchema,
  requestAstrologerPasswordlessCodeResponseSchema,
  type RequestAstrologerPasswordlessCodeRequest,
  type RequestAstrologerPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function requestPasswordlessCode(
  request: RequestAstrologerPasswordlessCodeRequest
): Promise<RequestAstrologerPasswordlessCodeResponse> {
  const normalizedRequest = requestAstrologerPasswordlessCodeRequestSchema.parse(request);

  return requestAstrologerPasswordlessCodeResponseSchema.parse(
    await application.http.post("/identity/astrologer/passwordless/request-code", normalizedRequest)
  );
}
