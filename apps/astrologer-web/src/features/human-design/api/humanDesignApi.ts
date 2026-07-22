import {
  humanDesignCalculationResponseSchema,
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  persistHumanDesignCalculationRequestSchema,
  recalculateHumanDesignCalculationRequestSchema,
  calculationIdParamSchema,
  type HumanDesignCalculationResponse,
  type HumanDesignPreviewRequest,
  type HumanDesignPreviewResponse,
  type PersistHumanDesignCalculationRequest,
  type RecalculateHumanDesignCalculationRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function previewHumanDesign(
  input: HumanDesignPreviewRequest
): Promise<HumanDesignPreviewResponse> {
  const body = humanDesignPreviewRequestSchema.parse(input);

  return humanDesignPreviewResponseSchema.parse(
    await application.http.post("/human-design/preview", body)
  );
}

export async function createHumanDesignCalculation(
  input: PersistHumanDesignCalculationRequest
): Promise<HumanDesignCalculationResponse> {
  const body = persistHumanDesignCalculationRequestSchema.parse(input);

  return humanDesignCalculationResponseSchema.parse(
    await application.http.post("/human-design/calculations", body, { csrf: true })
  );
}

export async function recalculateHumanDesignCalculation(input: {
  readonly calculationId: string;
  readonly body?: RecalculateHumanDesignCalculationRequest;
}): Promise<HumanDesignCalculationResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = recalculateHumanDesignCalculationRequestSchema.parse(input.body ?? {});

  return humanDesignCalculationResponseSchema.parse(
    await application.http.post(
      `/human-design/calculations/${params.calculationId}/recalculate`,
      body,
      { csrf: true }
    )
  );
}
