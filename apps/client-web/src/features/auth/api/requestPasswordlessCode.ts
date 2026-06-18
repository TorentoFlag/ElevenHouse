import {
  requestPasswordlessCodeRequestSchema,
  requestPasswordlessCodeResponseSchema,
  type RequestPasswordlessCodeRequest,
  type RequestPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function requestPasswordlessCode(
  request: RequestPasswordlessCodeRequest
): Promise<RequestPasswordlessCodeResponse> {
  const normalizedRequest = requestPasswordlessCodeRequestSchema.parse(request);

  return requestPasswordlessCodeResponseSchema.parse(
    await application.http.post("/identity/passwordless/request-code", normalizedRequest)
  );
}
