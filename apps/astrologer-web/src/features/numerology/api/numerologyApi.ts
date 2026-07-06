import {
  createNumerologyAiDraftRequestSchema,
  createNumerologyCalculationRequestSchema,
  numerologyCalculationResponseSchema,
  recalculateNumerologyCalculationRequestSchema,
  type CreateNumerologyAiDraftRequest,
  type CreateNumerologyCalculationRequest,
  type NumerologyCalculationResponse,
  type RecalculateNumerologyCalculationRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createNumerologyCalculation(
  input: CreateNumerologyCalculationRequest
): Promise<NumerologyCalculationResponse> {
  const body = createNumerologyCalculationRequestSchema.parse(input);

  return numerologyCalculationResponseSchema.parse(
    await application.http.post("/numerology/calculations", body, { csrf: true })
  );
}

export async function recalculateNumerologyCalculation(input: {
  readonly calculationId: string;
  readonly body: RecalculateNumerologyCalculationRequest;
}): Promise<NumerologyCalculationResponse> {
  const body = recalculateNumerologyCalculationRequestSchema.parse(input.body);

  return numerologyCalculationResponseSchema.parse(
    await application.http.post(`/numerology/calculations/${input.calculationId}/recalculate`, body, {
      csrf: true
    })
  );
}

export async function createNumerologyAiDraft(input: {
  readonly calculationId: string;
  readonly body: CreateNumerologyAiDraftRequest;
}): Promise<never> {
  const body = createNumerologyAiDraftRequestSchema.parse(input.body);

  return application.http.post(`/numerology/calculations/${input.calculationId}/ai-draft`, body, {
    csrf: true
  });
}
