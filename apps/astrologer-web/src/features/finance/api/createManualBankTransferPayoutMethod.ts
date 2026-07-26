import {
  createManualBankTransferPayoutMethodSchema,
  payoutMethodResponseSchema,
  type CreateManualBankTransferPayoutMethod,
  type PayoutMethodResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createManualBankTransferPayoutMethod(
  request: CreateManualBankTransferPayoutMethod
): Promise<PayoutMethodResponse> {
  const body = createManualBankTransferPayoutMethodSchema.parse(request);
  return payoutMethodResponseSchema.parse(
    await application.http.post("/finance/payout-methods/manual-bank-transfer", body, {
      csrf: true,
      headers: { "idempotency-key": body.idempotencyKey }
    })
  );
}
