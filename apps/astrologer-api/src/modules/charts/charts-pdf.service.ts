import { Inject, Injectable } from "@nestjs/common";
import {
  calculationIdParamSchema,
  calculationPdfJobIdParamSchema,
  calculationPdfLatestQuerySchema,
  requestCalculationPdfSchema,
  type CalculationPdfDownloadResponse,
  type CalculationPdfJobResponse,
  type CalculationPdfLatestQuery,
  type RequestCalculationPdf
} from "@elevenhouse/contracts";
import type { CalculationRecord, CalculationStore } from "@elevenhouse/domain";
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

@Injectable()
export class ChartsPdfService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly calculationStore: CalculationStore,
    private readonly calculationPdf: CalculationPdfService
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
      await this.ownedNatalChart(ownerUserId, params.calculationId);
      return this.calculationPdf.latest({
        ownerUserId,
        calculationId: params.calculationId,
        locale: parsedQuery.locale
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
        sourceLocator: { kind: "calculation_result" },
        renderContract: "chart-natal-v1",
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
    if (
      calculation.status === "archived" ||
      calculation.module !== "chart" ||
      calculation.methodCode !== "natal"
    ) {
      throw chartHttpError(
        409,
        "CHART_CALCULATION_MISMATCH",
        "Calculation is not a supported natal chart record"
      );
    }
    return calculation;
  }
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
