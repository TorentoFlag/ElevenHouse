import {
  submitAstrologerVerificationRequestSchema,
  verificationApplicationResponseSchema,
  type SubmitAstrologerVerificationRequest,
  type VerificationApplicationResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function submitAstrologerVerificationApplication(
  body: SubmitAstrologerVerificationRequest
): Promise<VerificationApplicationResponse> {
  const normalizedBody = submitAstrologerVerificationRequestSchema.parse(body);

  return verificationApplicationResponseSchema.parse(
    await application.http.post("/verification/applications", normalizedBody, { csrf: true })
  );
}
