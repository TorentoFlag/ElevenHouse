import {
  humanDesignCalculationResponseSchema,
  humanDesignPreviewRequestSchema,
  humanDesignPreviewResponseSchema,
  humanDesignTransitQuerySchema,
  humanDesignTransitResponseSchema,
  persistHumanDesignCalculationRequestSchema,
  recalculateHumanDesignCalculationRequestSchema,
  calculationIdParamSchema,
  calculationPdfDownloadResponseSchema,
  calculationPdfJobIdParamSchema,
  calculationPdfJobResponseSchema,
  calculationPdfLatestQuerySchema,
  createHumanDesignAiDraftRequestSchema,
  requestCalculationPdfSchema,
  type CalculationPdfDownloadResponse,
  type CalculationPdfJobResponse,
  type CalculationPdfLocale,
  type CreateHumanDesignAiDraftRequest,
  type HumanDesignCalculationResponse,
  type HumanDesignPreviewRequest,
  type HumanDesignPreviewResponse,
  type HumanDesignTransitQuery,
  type HumanDesignTransitResponse,
  type PersistHumanDesignCalculationRequest,
  type RecalculateHumanDesignCalculationRequest,
  type RequestCalculationPdf
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

export async function getHumanDesignTransit(input: {
  readonly calculationId: string;
  readonly query?: HumanDesignTransitQuery;
}): Promise<HumanDesignTransitResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const query = humanDesignTransitQuerySchema.parse(input.query ?? {});
  const search = new URLSearchParams();

  if (query.instant) {
    search.set("instant", query.instant);
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : "";

  return humanDesignTransitResponseSchema.parse(
    await application.http.get(
      `/human-design/calculations/${params.calculationId}/transits${suffix}`
    )
  );
}

export async function createHumanDesignAiDraft(input: {
  readonly calculationId: string;
  readonly body: CreateHumanDesignAiDraftRequest;
}): Promise<HumanDesignCalculationResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = createHumanDesignAiDraftRequestSchema.parse(input.body);

  return humanDesignCalculationResponseSchema.parse(
    await application.http.post(
      `/human-design/calculations/${params.calculationId}/ai-draft`,
      body,
      { csrf: true }
    )
  );
}

export async function getLatestHumanDesignPdf(input: {
  readonly calculationId: string;
  readonly locale: CalculationPdfLocale;
}): Promise<CalculationPdfJobResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const query = calculationPdfLatestQuerySchema.parse({ locale: input.locale });
  const search = new URLSearchParams(query);

  return calculationPdfJobResponseSchema.parse(
    await application.http.get(
      `/human-design/calculations/${params.calculationId}/report/pdf?${search.toString()}`
    )
  );
}

export async function enqueueHumanDesignPdf(input: {
  readonly calculationId: string;
  readonly body: RequestCalculationPdf;
}): Promise<CalculationPdfJobResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = requestCalculationPdfSchema.parse(input.body);

  return calculationPdfJobResponseSchema.parse(
    await application.http.post(
      `/human-design/calculations/${params.calculationId}/report/pdf`,
      body,
      { csrf: true }
    )
  );
}

export async function downloadHumanDesignPdf(input: {
  readonly calculationId: string;
  readonly jobId: string;
}): Promise<CalculationPdfDownloadResponse> {
  const params = calculationPdfJobIdParamSchema.parse(input);

  return calculationPdfDownloadResponseSchema.parse(
    await application.http.get(
      `/human-design/calculations/${params.calculationId}/report/pdf/${params.jobId}/download`
    )
  );
}
