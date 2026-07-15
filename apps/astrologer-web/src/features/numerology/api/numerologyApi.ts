import {
  calculationIdParamSchema,
  calculationPdfDownloadResponseSchema,
  calculationPdfJobIdParamSchema,
  calculationPdfJobResponseSchema,
  calculationPdfLatestQuerySchema,
  createNumerologyAiDraftRequestSchema,
  createNumerologyCalculationRequestSchema,
  numerologyPreviewResponseSchema,
  previewNumerologyRequestSchema,
  numerologyCalculationResponseSchema,
  recalculateNumerologyCalculationRequestSchema,
  requestCalculationPdfSchema,
  type CalculationPdfDownloadResponse,
  type CalculationPdfJobResponse,
  type CalculationPdfLocale,
  type CreateNumerologyAiDraftRequest,
  type CreateNumerologyCalculationRequest,
  type NumerologyCalculationResponse,
  type NumerologyPreviewResponse,
  type PreviewNumerologyRequest,
  type RecalculateNumerologyCalculationRequest,
  type RequestCalculationPdf
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function previewNumerology(
  input: PreviewNumerologyRequest
): Promise<NumerologyPreviewResponse> {
  const body = previewNumerologyRequestSchema.parse(input);
  return numerologyPreviewResponseSchema.parse(
    await application.http.post("/numerology/preview", body)
  );
}

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
    await application.http.post(
      `/numerology/calculations/${input.calculationId}/recalculate`,
      body,
      {
        csrf: true
      }
    )
  );
}

export async function createNumerologyAiDraft(input: {
  readonly calculationId: string;
  readonly body: CreateNumerologyAiDraftRequest;
}): Promise<NumerologyCalculationResponse> {
  const body = createNumerologyAiDraftRequestSchema.parse(input.body);

  return numerologyCalculationResponseSchema.parse(
    await application.http.post(`/numerology/calculations/${input.calculationId}/ai-draft`, body, {
      csrf: true
    })
  );
}

export async function getLatestNumerologyPdf(input: {
  readonly calculationId: string;
  readonly locale: CalculationPdfLocale;
}): Promise<CalculationPdfJobResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const query = calculationPdfLatestQuerySchema.parse({ locale: input.locale });
  const search = new URLSearchParams(query);

  return calculationPdfJobResponseSchema.parse(
    await application.http.get(
      `/numerology/calculations/${params.calculationId}/report/pdf?${search.toString()}`
    )
  );
}

export async function enqueueNumerologyPdf(input: {
  readonly calculationId: string;
  readonly body: RequestCalculationPdf;
}): Promise<CalculationPdfJobResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = requestCalculationPdfSchema.parse(input.body);

  return calculationPdfJobResponseSchema.parse(
    await application.http.post(
      `/numerology/calculations/${params.calculationId}/report/pdf`,
      body,
      { csrf: true }
    )
  );
}

export async function downloadNumerologyPdf(input: {
  readonly calculationId: string;
  readonly jobId: string;
}): Promise<CalculationPdfDownloadResponse> {
  const params = calculationPdfJobIdParamSchema.parse(input);

  return calculationPdfDownloadResponseSchema.parse(
    await application.http.get(
      `/numerology/calculations/${params.calculationId}/report/pdf/${params.jobId}/download`
    )
  );
}
