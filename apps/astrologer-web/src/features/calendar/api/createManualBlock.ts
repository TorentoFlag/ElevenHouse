import {
  createManualBlockRequestSchema,
  manualBlockResponseSchema,
  type CreateManualBlockRequest,
  type ManualBlockResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type CreateManualBlockInput = {
  readonly body: CreateManualBlockRequest;
  readonly idempotencyKey: string;
};

export async function createManualBlock(
  input: CreateManualBlockInput
): Promise<ManualBlockResponse> {
  const body = createManualBlockRequestSchema.parse(input.body);

  return manualBlockResponseSchema.parse(
    await application.http.post("/calendar/blocks", body, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
