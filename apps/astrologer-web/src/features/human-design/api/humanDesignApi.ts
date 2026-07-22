import {
  humanDesignCalculationResponseSchema,
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  persistHumanDesignCalculationRequestSchema,
  type HumanDesignCalculationResponse,
  type HumanDesignPreviewRequest,
  type HumanDesignPreviewResponse,
  type PersistHumanDesignCalculationRequest
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
