import {
  calculationIdParamSchema,
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
  chartSolarReturnJobCreateRequestSchema,
  chartSynastryJobCreateRequestSchema,
  chartTransitJobCreateRequestSchema,
  requestCalculationPdfSchema,
  storedChartCalculationPayloadSchema,
  type CalculationPdfDownloadResponse,
  type CalculationPdfJobResponse,
  type CalculationPdfLocale,
  type ChartJobResponse,
  type ChartHoraryQuestionSnapshot,
  type ChartNatalJobCreateResponse,
  type ChartSettings,
  type ChartTransitMoment,
  type RequestCalculationPdf,
  type StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type CreateNatalChartJobInput = {
  readonly clientId: string;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createNatalChartJob(
  input: CreateNatalChartJobInput
): Promise<ChartNatalJobCreateResponse> {
  const body = chartNatalJobCreateRequestSchema.parse({
    clientId: input.clientId,
    settings: input.settings
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post("/charts/natal/jobs", body, { csrf: true })
  );
}

export type CreateAstrocartographyChartJobInput = {
  readonly clientId: string;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createAstrocartographyChartJob(
  input: CreateAstrocartographyChartJobInput
): Promise<ChartNatalJobCreateResponse> {
  const body = chartAstrocartographyJobCreateRequestSchema.parse({
    clientId: input.clientId,
    settings: input.settings
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post("/charts/astrocartography/jobs", body, { csrf: true })
  );
}

export type CreateTransitChartJobInput = {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly transit: ChartTransitMoment;
} & Record<string, unknown>;

export async function createTransitChartJob(
  input: CreateTransitChartJobInput
): Promise<ChartNatalJobCreateResponse> {
  const body = chartTransitJobCreateRequestSchema.parse({
    clientId: input.clientId,
    settings: input.settings,
    transit: input.transit
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post("/charts/transits/jobs", body, { csrf: true })
  );
}

export type CreateSynastryChartJobInput = {
  readonly clientId: string;
  readonly partnerClientId: string;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createSynastryChartJob(
  input: CreateSynastryChartJobInput
): Promise<ChartNatalJobCreateResponse> {
  const body = chartSynastryJobCreateRequestSchema.parse({
    clientId: input.clientId,
    partnerClientId: input.partnerClientId,
    settings: input.settings
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post("/charts/synastry/jobs", body, { csrf: true })
  );
}

export type CreateCompositeChartJobInput = {
  readonly clientId: string;
  readonly partnerClientId: string;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createCompositeChartJob(
  input: CreateCompositeChartJobInput
): Promise<ChartNatalJobCreateResponse> {
  const body = chartCompositeJobCreateRequestSchema.parse({
    clientId: input.clientId,
    partnerClientId: input.partnerClientId,
    settings: input.settings
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post("/charts/composite/jobs", body, { csrf: true })
  );
}

export type CreateSolarReturnChartJobInput = {
  readonly clientId: string;
  readonly year: number;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createSolarReturnChartJob(
  input: CreateSolarReturnChartJobInput
): Promise<ChartNatalJobCreateResponse> {
  const body = chartSolarReturnJobCreateRequestSchema.parse({
    clientId: input.clientId,
    year: input.year,
    settings: input.settings
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post("/charts/solar-return/jobs", body, { csrf: true })
  );
}

export type CreateProgressionChartJobInput = {
  readonly clientId: string;
  readonly targetDate: string;
  readonly settings: ChartSettings;
} & Record<string, unknown>;

export async function createProgressionChartJob(
  input: CreateProgressionChartJobInput
): Promise<ChartNatalJobCreateResponse> {
  const body = chartProgressionJobCreateRequestSchema.parse({
    clientId: input.clientId,
    targetDate: input.targetDate,
    settings: input.settings
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post("/charts/progressions/jobs", body, { csrf: true })
  );
}

export type CreateHoraryChartJobInput = {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly question: ChartHoraryQuestionSnapshot;
} & Record<string, unknown>;

export async function createHoraryChartJob(
  input: CreateHoraryChartJobInput
): Promise<ChartNatalJobCreateResponse> {
  const body = chartHoraryJobCreateRequestSchema.parse({
    clientId: input.clientId,
    settings: input.settings,
    question: input.question
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post("/charts/horary/jobs", body, { csrf: true })
  );
}

export async function getChartJob(jobId: string): Promise<ChartJobResponse> {
  return chartJobResponseSchema.parse(
    await application.http.get(`/charts/jobs/${jobId}`, { cache: "no-store" })
  );
}

export async function getChartCalculation(
  calculationId: string
): Promise<StoredChartCalculationPayload> {
  const params = calculationIdParamSchema.parse({ calculationId });
  const response = chartCalculationResponseSchema.parse(
    await application.http.get(`/charts/calculations/${params.calculationId}`)
  );

  return storedChartCalculationPayloadSchema.parse(response.result);
}

export async function recalculateChart(input: {
  readonly calculationId: string;
  readonly clientId: string;
  readonly settings: ChartSettings;
}): Promise<ChartNatalJobCreateResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const body = chartNatalJobCreateRequestSchema.parse({
    clientId: input.clientId,
    settings: input.settings
  });

  return chartNatalJobCreateResponseSchema.parse(
    await application.http.post(`/charts/calculations/${params.calculationId}/recalculate`, body, {
      csrf: true
    })
  );
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
