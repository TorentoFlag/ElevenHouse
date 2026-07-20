import {
  calculationIdParamSchema,
  chartCalculationResponseSchema,
  chartJobResponseSchema,
  chartNatalJobCreateRequestSchema,
  chartNatalJobCreateResponseSchema,
  storedChartCalculationPayloadSchema,
  type ChartJobResponse,
  type ChartNatalJobCreateResponse,
  type ChartSettings,
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

export async function getChartJob(jobId: string): Promise<ChartJobResponse> {
  return chartJobResponseSchema.parse(await application.http.get(`/charts/jobs/${jobId}`));
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
