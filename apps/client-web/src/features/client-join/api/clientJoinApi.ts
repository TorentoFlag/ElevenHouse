import {
  createClientJoinIntentRequestSchema,
  createClientJoinIntentResponseSchema,
  type CreateClientJoinIntentResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createClientJoinIntent(input: {
  readonly publicHandle: string;
}): Promise<CreateClientJoinIntentResponse> {
  const request = createClientJoinIntentRequestSchema.parse(input);

  return createClientJoinIntentResponseSchema.parse(
    await application.http.post("/client-join-intents", request)
  );
}
