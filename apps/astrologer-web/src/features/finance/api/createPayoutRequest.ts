import {
  createPayoutRequestSchema,
  payoutRequestResponseSchema,
  type CreatePayoutRequest,
  type PayoutRequestResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createPayoutRequest(
  request: CreatePayoutRequest
): Promise<PayoutRequestResponse> {
  const body = createPayoutRequestSchema.parse(request);
  return payoutRequestResponseSchema.parse(
    await application.http.post("/finance/payout-requests", body, {
      csrf: true,
      headers: { "idempotency-key": body.idempotencyKey }
    })
  );
}
