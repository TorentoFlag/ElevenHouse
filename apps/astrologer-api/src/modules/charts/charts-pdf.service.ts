import { Inject, Injectable } from "@nestjs/common";
import {
  calculationIdParamSchema,
  calculationPdfJobIdParamSchema,
  calculationPdfLatestQuerySchema,
  chartResultSchema,
  requestCalculationPdfSchema,
  type CalculationPdfDownloadResponse,
  type CalculationPdfJobResponse,
  type CalculationPdfLatestQuery,
  type RequestCalculationPdf
} from "@elevenhouse/contracts";
import {
  assertStoredChartCalculationIntegrity,
  CalculationInterpretationModeUnavailableError,
  resolveChartInterpretationMode,
  selectCurrentApprovedCalculationInterpretation,
  type CalculationPdfSourceLocator,
  type CalculationRecord,
  type CalculationStore
} from "@elevenhouse/domain";
import { requireOwnerUserId } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import {
  CalculationPdfNotFoundError,
  CalculationPdfNotReadyError,
  CalculationPdfResultChangedError
} from "../calculations/pdf/calculation-pdf.errors";
import { CalculationPdfService } from "../calculations/pdf/calculation-pdf.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { chartHttpError } from "./chart-http-errors";
import { ChartExecutionProfileProvider } from "./chart-execution-profile.provider";

@Injectable()
export class ChartsPdfService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly calculationStore: CalculationStore,
    private readonly calculationPdf: CalculationPdfService,
    private readonly executionProfile: ChartExecutionProfileProvider
  ) {}

  async latest(
    calculationId: string,
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<CalculationPdfJobResponse> {
    const params = parseCalculationId(calculationId);
    const parsedQuery = parseLatestQuery(query);
    const ownerUserId = requireOwnerUserId(request);
    return mapChartPdfErrors(async () => {
      const calculation = await this.ownedNatalChart(ownerUserId, params.calculationId);
      return this.calculationPdf.latest({
        ownerUserId,
        calculationId: params.calculationId,
        locale: parsedQuery.locale,
        sourceLocator: chartPdfSourceLocator(calculation),
        renderContract: "chart-natal-v3"
      });
    });
  }

  async enqueue(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<CalculationPdfJobResponse> {
    const params = parseCalculationId(calculationId);
    const parsedBody = parseRequest(body);
    const ownerUserId = requireOwnerUserId(request);
    return mapChartPdfErrors(async () => {
      const calculation = await this.ownedNatalChart(ownerUserId, params.calculationId);
      return this.calculationPdf.request({
        ownerUserId,
        calculationId: calculation.id,
        expectedResultChecksum: parsedBody.expectedResultChecksum,
        locale: parsedBody.locale,
        sourceLocator: chartPdfSourceLocator(calculation),
        renderContract: "chart-natal-v3",
        originalFileName: parsedBody.locale === "ru" ? "Натальная карта.pdf" : "Natal chart.pdf"
      });
    });
  }

  async download(
    calculationId: string,
    jobId: string,
    request: AstrologerSessionRequest
  ): Promise<CalculationPdfDownloadResponse> {
    const parsed = calculationPdfJobIdParamSchema.safeParse({ calculationId, jobId });
    if (!parsed.success) {
      throw chartHttpError(400, "CHART_VALIDATION_FAILED", "Invalid chart PDF request");
    }
    const ownerUserId = requireOwnerUserId(request);
    return mapChartPdfErrors(async () => {
      await this.ownedNatalChart(ownerUserId, parsed.data.calculationId);
      return this.calculationPdf.download({
        ownerUserId,
        calculationId: parsed.data.calculationId,
        jobId: parsed.data.jobId
      });
    });
  }

  private async ownedNatalChart(
    ownerUserId: string,
    calculationId: string
  ): Promise<CalculationRecord> {
    const calculation = await this.calculationStore.findByOwnerAndId({
      ownerUserId,
      calculationId
    });
    if (!calculation) {
      throw chartHttpError(404, "CHART_CALCULATION_NOT_FOUND", "Chart calculation was not found");
    }
    if (calculation.status === "archived") {
      throw chartHttpError(409, "CHART_CALCULATION_ARCHIVED", "Chart calculation is archived");
    }
    if (calculation.module !== "chart" || calculation.methodCode !== "natal") {
      throw chartHttpError(
        409,
        "CHART_CALCULATION_MISMATCH",
        "Calculation is not a supported natal chart record"
      );
    }
    if (resolveChartInterpretationMode(calculation, "natal") === "legacy_unclassified") {
      throw new CalculationInterpretationModeUnavailableError(
        "Chart PDF is unavailable for this interpretation mode"
      );
    }
    const readable = chartResultSchema.safeParse(calculation.resultData);
    if (readable.success && readable.data.schemaVersion === "chart-result.v1") {
      throw chartHttpError(
        409,
        "CHART_RECALCULATION_REQUIRED",
        "Legacy chart calculation must be recalculated before PDF rendering"
      );
    }
    if (!readable.success || readable.data.method !== "natal") {
      throw chartHttpError(
        409,
        "CHART_CALCULATION_MISMATCH",
        "Stored chart calculation result is invalid"
      );
    }
    try {
      const result = assertStoredChartCalculationIntegrity({
        calculation,
        expectedExecutionProfile: this.executionProfile.getProfile()
      });
      if (result.schemaVersion !== "chart-result.v2" || result.method !== "natal") {
        throw new Error("CHART_PDF_V2_NATAL_REQUIRED");
      }
    } catch {
      throw chartHttpError(
        409,
        "CHART_STORED_RESULT_INTEGRITY_INVALID",
        "Stored chart result failed integrity validation"
      );
    }
    return calculation;
  }
}

function chartPdfSourceLocator(calculation: CalculationRecord): CalculationPdfSourceLocator {
  const interpretation = selectCurrentApprovedCalculationInterpretation(
    calculation.interpretations
  );
  return {
    kind: "approved_interpretation",
    interpretationId: interpretation?.id ?? null
  };
}

function parseCalculationId(calculationId: string): { readonly calculationId: string } {
  const parsed = calculationIdParamSchema.safeParse({ calculationId });
  if (!parsed.success) {
    throw chartHttpError(400, "CHART_VALIDATION_FAILED", "Invalid chart PDF request");
  }
  return parsed.data;
}

function parseLatestQuery(query: unknown): CalculationPdfLatestQuery {
  const parsed = calculationPdfLatestQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw chartHttpError(400, "CHART_VALIDATION_FAILED", "Invalid chart PDF query");
  }
  return parsed.data;
}

function parseRequest(body: unknown): RequestCalculationPdf {
  const parsed = requestCalculationPdfSchema.safeParse(body);
  if (!parsed.success) {
    throw chartHttpError(400, "CHART_VALIDATION_FAILED", "Invalid chart PDF request");
  }
  return parsed.data;
}

async function mapChartPdfErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CalculationInterpretationModeUnavailableError) {
      throw chartHttpError(409, error.code, error.message);
    }
    if (error instanceof CalculationPdfResultChangedError) {
      throw chartHttpError(409, "CHART_RESULT_CHANGED", error.message);
    }
    if (error instanceof CalculationPdfNotReadyError) {
      throw chartHttpError(409, "CHART_PDF_NOT_READY", error.message);
    }
    if (error instanceof CalculationPdfNotFoundError) {
      throw chartHttpError(404, "CHART_PDF_NOT_FOUND", error.message);
    }
    throw error;
  }
}
