import {
  calculationIdParamSchema,
  calculationRecordResponseSchema,
  createChartAiDraftRequestSchema,
  calculationPdfDownloadResponseSchema,
  calculationPdfJobIdParamSchema,
  calculationPdfJobResponseSchema,
  calculationPdfLatestQuerySchema,
  chartCalculationResponseSchema,
  chartAstrocartographyJobCreateRequestSchema,
  chartCompositeJobCreateRequestSchema,
  chartHoraryJobCreateRequestSchema,
  chartJobResponseSchema,
  chartNatalJobCreateRequestSchema,
  chartNatalJobCreateResponseSchema,
  chartProgressionJobCreateRequestSchema,
  chartRecalculateRequestSchema,
  chartResultSchema,
  reproducibleChartResultSchema,
  chartSolarReturnJobCreateRequestSchema,
  chartSynastryJobCreateRequestSchema,
  chartTransitJobCreateRequestSchema,
  requestCalculationPdfSchema,
  type CalculationPdfDownloadResponse,
  type CalculationRecordResponse,
  type CreateChartAiDraftRequest,
  type CalculationPdfJobResponse,
  type CalculationPdfLocale,
  type ChartCalculationMethod,
  type ChartInterpretationMode,
  type ChartCalculationResponse,
  type ChartResult,
  type ChartJobResponse,
  type ChartHoraryQuestionSnapshot,
  type ChartNatalJobCreateResponse,
  type ChartRelationshipPartner,
  type ChartRecalculateRequest,
  type ReproducibleChartResult,
  type ChartSettings,
  type ChartTransitMoment,
  type RequestCalculationPdf
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type ChartJobSubmissionResponse =
  | Extract<ChartNatalJobCreateResponse, { readonly status: "calculating" }>
  | {
      readonly status: "succeeded";
      readonly calculationId: string;
      readonly result: ReproducibleChartResult;
    };

export type CreateNatalChartJobInput = {
  readonly clientId: string;
  readonly interpretationMode: Extract<ChartInterpretationMode, "adult_natal" | "child">;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createNatalChartJob(
  input: CreateNatalChartJobInput
): Promise<ChartJobSubmissionResponse> {
  const body = chartNatalJobCreateRequestSchema.parse({
    clientId: input.clientId,
    interpretationMode: input.interpretationMode,
    settings: input.settings
  });

  return parseChartJobSubmissionResponse(
    await application.http.post("/charts/natal/jobs", body, { csrf: true }),
    { expectedMethod: "natal" }
  );
}

export type CreateAstrocartographyChartJobInput = {
  readonly clientId: string;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createAstrocartographyChartJob(
  input: CreateAstrocartographyChartJobInput
): Promise<ChartJobSubmissionResponse> {
  const body = chartAstrocartographyJobCreateRequestSchema.parse({
    clientId: input.clientId,
    settings: input.settings
  });

  return parseChartJobSubmissionResponse(
    await application.http.post("/charts/astrocartography/jobs", body, { csrf: true }),
    { expectedMethod: "astrocartography" }
  );
}

export type CreateTransitChartJobInput = {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly transit: ChartTransitMoment;
} & Record<string, unknown>;

export async function createTransitChartJob(
  input: CreateTransitChartJobInput
): Promise<ChartJobSubmissionResponse> {
  const body = chartTransitJobCreateRequestSchema.parse({
    clientId: input.clientId,
    settings: input.settings,
    transit: input.transit
  });

  return parseChartJobSubmissionResponse(
    await application.http.post("/charts/transits/jobs", body, { csrf: true }),
    { expectedMethod: "transit" }
  );
}

export type CreateSynastryChartJobInput = {
  readonly clientId: string;
  readonly partnerClientId?: string;
  readonly partner?: ChartRelationshipPartner;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createSynastryChartJob(
  input: CreateSynastryChartJobInput
): Promise<ChartJobSubmissionResponse> {
  const body = chartSynastryJobCreateRequestSchema.parse({
    clientId: input.clientId,
    ...(input.partner ? { partner: input.partner } : { partnerClientId: input.partnerClientId }),
    settings: input.settings
  });

  return parseChartJobSubmissionResponse(
    await application.http.post("/charts/synastry/jobs", body, { csrf: true }),
    { expectedMethod: "synastry" }
  );
}

export type CreateCompositeChartJobInput = {
  readonly clientId: string;
  readonly partnerClientId?: string;
  readonly partner?: ChartRelationshipPartner;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createCompositeChartJob(
  input: CreateCompositeChartJobInput
): Promise<ChartJobSubmissionResponse> {
  const body = chartCompositeJobCreateRequestSchema.parse({
    clientId: input.clientId,
    ...(input.partner ? { partner: input.partner } : { partnerClientId: input.partnerClientId }),
    settings: input.settings
  });

  return parseChartJobSubmissionResponse(
    await application.http.post("/charts/composite/jobs", body, { csrf: true }),
    { expectedMethod: "composite" }
  );
}

export type CreateSolarReturnChartJobInput = {
  readonly clientId: string;
  readonly year: number;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createSolarReturnChartJob(
  input: CreateSolarReturnChartJobInput
): Promise<ChartJobSubmissionResponse> {
  const body = chartSolarReturnJobCreateRequestSchema.parse({
    clientId: input.clientId,
    year: input.year,
    settings: input.settings
  });

  return parseChartJobSubmissionResponse(
    await application.http.post("/charts/solar-return/jobs", body, { csrf: true }),
    { expectedMethod: "solar_return" }
  );
}

export type CreateProgressionChartJobInput = {
  readonly clientId: string;
  readonly targetDate: string;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createProgressionChartJob(
  input: CreateProgressionChartJobInput
): Promise<ChartJobSubmissionResponse> {
  const body = chartProgressionJobCreateRequestSchema.parse({
    clientId: input.clientId,
    targetDate: input.targetDate,
    settings: input.settings
  });

  return parseChartJobSubmissionResponse(
    await application.http.post("/charts/progressions/jobs", body, { csrf: true }),
    { expectedMethod: "progression" }
  );
}

export type CreateHoraryChartJobInput = {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly question: ChartHoraryQuestionSnapshot;
} & Record<string, unknown>;

export async function createHoraryChartJob(
  input: CreateHoraryChartJobInput
): Promise<ChartJobSubmissionResponse> {
  const body = chartHoraryJobCreateRequestSchema.parse({
    clientId: input.clientId,
    settings: input.settings,
    question: input.question
  });

  return parseChartJobSubmissionResponse(
    await application.http.post("/charts/horary/jobs", body, { csrf: true }),
    { expectedMethod: "horary" }
  );
}

export async function getChartJob(jobId: string): Promise<ChartJobResponse> {
  return chartJobResponseSchema.parse(
    await application.http.get(`/charts/jobs/${jobId}`, { cache: "no-store" })
  );
}

export async function getChartCalculation(calculationId: string): Promise<ChartCalculationRead> {
  const params = calculationIdParamSchema.parse({ calculationId });
  const response = chartCalculationResponseSchema.parse(
    await application.http.get(`/charts/calculations/${params.calculationId}`)
  );
  if (response.calculationId !== params.calculationId) {
    throw new Error("CHART_CALCULATION_ID_MISMATCH");
  }

  return {
    ...response,
    result: chartResultSchema.parse(response.result)
  };
}

export type ChartCalculationRead = Omit<ChartCalculationResponse, "result"> & {
  readonly result: ChartResult;
};

export async function recalculateChart(input: {
  readonly calculationId: string;
  readonly expectedResultChecksum: string;
  readonly expectedMethod: ChartCalculationMethod;
  readonly settings?: ChartSettings;
}): Promise<ChartJobSubmissionResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body: ChartRecalculateRequest = chartRecalculateRequestSchema.parse({
    expectedResultChecksum: input.expectedResultChecksum,
    settings: input.settings
  });

  return parseChartJobSubmissionResponse(
    await application.http.post(`/charts/calculations/${params.calculationId}/recalculate`, body, {
      csrf: true
    }),
    { expectedMethod: input.expectedMethod, expectedCalculationId: params.calculationId }
  );
}

export async function createChartAiDraft(input: {
  readonly calculationId: string;
  readonly idempotencyKey: string;
  readonly body: CreateChartAiDraftRequest;
}): Promise<CalculationRecordResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = createChartAiDraftRequestSchema.parse(input.body);
  const idempotencyKey = normalizeChartAiDraftIdempotencyKey(input.idempotencyKey);

  return calculationRecordResponseSchema.parse(
    await application.http.post(`/charts/calculations/${params.calculationId}/ai-draft`, body, {
      csrf: true,
      headers: { "idempotency-key": idempotencyKey }
    })
  );
}

export function createChartAiDraftIdempotencyKey(
  createRequestId: () => string = () => crypto.randomUUID()
): string {
  return normalizeChartAiDraftIdempotencyKey(`charts:ai-draft:${createRequestId()}`);
}

function normalizeChartAiDraftIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(normalized)) {
    throw new Error("CHART_AI_DRAFT_IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

export async function getLatestChartPdf(input: {
  readonly calculationId: string;
  readonly locale: CalculationPdfLocale;
}): Promise<CalculationPdfJobResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const query = calculationPdfLatestQuerySchema.parse({ locale: input.locale });

  return calculationPdfJobResponseSchema.parse(
    await application.http.get(
      `/charts/calculations/${params.calculationId}/report/pdf?locale=${query.locale}`
    )
  );
}

export async function enqueueChartPdf(input: {
  readonly calculationId: string;
  readonly body: RequestCalculationPdf;
}): Promise<CalculationPdfJobResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = requestCalculationPdfSchema.parse(input.body);

  return calculationPdfJobResponseSchema.parse(
    await application.http.post(`/charts/calculations/${params.calculationId}/report/pdf`, body, {
      csrf: true
    })
  );
}

export async function downloadChartPdf(input: {
  readonly calculationId: string;
  readonly jobId: string;
}): Promise<CalculationPdfDownloadResponse> {
  const params = calculationPdfJobIdParamSchema.parse(input);

  return calculationPdfDownloadResponseSchema.parse(
    await application.http.get(
      `/charts/calculations/${params.calculationId}/report/pdf/${params.jobId}/download`
    )
  );
}

function parseChartJobSubmissionResponse(
  value: unknown,
  expectation: {
    readonly expectedMethod: ChartCalculationMethod;
    readonly expectedCalculationId?: string;
  }
): ChartJobSubmissionResponse {
  const response = chartNatalJobCreateResponseSchema.parse(value);
  if (response.status === "calculating") return response;
  if (
    expectation.expectedCalculationId !== undefined &&
    response.calculationId !== expectation.expectedCalculationId
  ) {
    throw new Error("CHART_SUBMISSION_CALCULATION_ID_MISMATCH");
  }
  const result = reproducibleChartResultSchema.parse(response.result);
  if (result.method !== expectation.expectedMethod) {
    throw new Error("CHART_SUBMISSION_METHOD_MISMATCH");
  }
  return {
    ...response,
    result
  };
}
