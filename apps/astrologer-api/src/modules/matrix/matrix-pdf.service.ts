import { Inject, Injectable } from "@nestjs/common";
import {
  calculationIdParamSchema,
  enqueueMatrixPdfRequestSchema,
  matrixPdfJobIdParamSchema,
  matrixPdfJobResponseSchema,
  type EnqueueMatrixPdfRequest,
  type MatrixPdfDownloadResponse,
  type MatrixPdfJobResponse
} from "@elevenhouse/contracts";
import {
  assertMatrixReportPdfEligible,
  type CalculationPdfJob,
  type CalculationRecord,
  type CalculationStore,
  type MatrixReportStore
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
import { matrixHttpError } from "./matrix-http-errors";
import { MATRIX_REPORT_STORE } from "./matrix-report.tokens";

@Injectable()
export class MatrixPdfService {
  constructor(
    @Inject(CALCULATION_STORE)
    private readonly calculationStore: CalculationStore,
    @Inject(MATRIX_REPORT_STORE)
    private readonly reportStore: MatrixReportStore,
    private readonly calculationPdf: CalculationPdfService
  ) {}

  async latest(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<MatrixPdfJobResponse> {
    const params = parseCalculationId(calculationId);
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixPdfErrors(async () => {
      await this.ownedMatrix(ownerUserId, params.calculationId);
      const report = await this.reportStore.findByCalculation({
        ownerUserId,
        calculationId: params.calculationId
      });
      const { calculation, job } = await this.calculationPdf.latestJob({
        ownerUserId,
        calculationId: params.calculationId,
        locale: report?.locale ?? "ru"
      });
      return matrixPdfJobResponseSchema.parse({
        job: job ? toMatrixPdfJob(job) : null,
        currentResultChecksum: calculation.resultChecksum
      });
    });
  }

  async enqueue(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixPdfJobResponse> {
    const params = parseCalculationId(calculationId);
    const parsed = parseEnqueue(body);
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixPdfErrors(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      const report = assertMatrixReportPdfEligible({
        report: await this.reportStore.findByCalculation({
          ownerUserId,
          calculationId: calculation.id
        }),
        currentResultChecksum: calculation.resultChecksum
      });
      const response = await this.calculationPdf.request({
        ownerUserId,
        calculationId: calculation.id,
        expectedResultChecksum: parsed.expectedResultChecksum,
        locale: report.locale,
        sourceLocator: {
          kind: "matrix_report",
          reportId: report.id,
          reportRevision: report.revision,
          reportResultChecksum: report.resultChecksum
        },
        renderContract: "matrix-ladini-22",
        originalFileName: report.locale === "ru" ? "Матрица судьбы.pdf" : "Destiny Matrix.pdf"
      });
      return matrixPdfJobResponseSchema.parse({
        job: response.job
          ? {
              ...response.job,
              reportId: report.id,
              reportRevision: report.revision
            }
          : null,
        currentResultChecksum: response.currentResultChecksum
      });
    });
  }

  async download(
    calculationId: string,
    jobId: string,
    request: AstrologerSessionRequest
  ): Promise<MatrixPdfDownloadResponse> {
    const parsed = matrixPdfJobIdParamSchema.safeParse({ calculationId, jobId });
    if (!parsed.success) {
      throw matrixHttpError(400, "MATRIX_VALIDATION_FAILED", "Invalid Matrix PDF request");
    }
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixPdfErrors(async () => {
      await this.ownedMatrix(ownerUserId, parsed.data.calculationId);
      return this.calculationPdf.download({
        ownerUserId,
        calculationId: parsed.data.calculationId,
        jobId: parsed.data.jobId
      });
    });
  }

  private async ownedMatrix(
    ownerUserId: string,
    calculationId: string
  ): Promise<CalculationRecord> {
    const calculation = await this.calculationStore.findByOwnerAndId({
      ownerUserId,
      calculationId
    });
    if (!calculation) {
      throw matrixHttpError(404, "CALCULATION_NOT_FOUND", "Calculation not found");
    }
    if (
      calculation.status === "archived" ||
      calculation.module !== "matrix" ||
      calculation.methodCode !== "ladini_22"
    ) {
      throw matrixHttpError(
        409,
        "MATRIX_CALCULATION_MISMATCH",
        "Calculation is not a supported Matrix record"
      );
    }
    return calculation;
  }
}

function toMatrixPdfJob(job: CalculationPdfJob) {
  if (job.sourceLocator.kind !== "matrix_report") {
    throw matrixHttpError(500, "MATRIX_CALCULATION_MISMATCH", "Matrix PDF source is invalid");
  }
  return {
    id: job.id,
    calculationId: job.calculationId,
    reportId: job.sourceLocator.reportId,
    reportRevision: job.sourceLocator.reportRevision,
    resultChecksum: job.resultChecksum,
    locale: job.locale,
    status: job.status,
    artifactId: job.artifactId,
    mediaAssetId: job.mediaAssetId,
    failureReason: job.status === "failed" ? "PDF generation failed. Please try again." : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

function parseCalculationId(calculationId: string): { readonly calculationId: string } {
  const parsed = calculationIdParamSchema.safeParse({ calculationId });
  if (!parsed.success) {
    throw matrixHttpError(400, "MATRIX_VALIDATION_FAILED", "Invalid Matrix PDF request");
  }
  return parsed.data;
}

function parseEnqueue(body: unknown): EnqueueMatrixPdfRequest {
  const parsed = enqueueMatrixPdfRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw matrixHttpError(400, "MATRIX_VALIDATION_FAILED", "Invalid Matrix PDF request");
  }
  return parsed.data;
}

async function mapMatrixPdfErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CalculationPdfResultChangedError) {
      throw matrixHttpError(409, "MATRIX_RESULT_CHANGED", error.message);
    }
    if (error instanceof CalculationPdfNotReadyError) {
      throw matrixHttpError(409, "MATRIX_PDF_NOT_READY", error.message);
    }
    if (error instanceof CalculationPdfNotFoundError) {
      throw matrixHttpError(404, "MATRIX_PDF_NOT_FOUND", error.message);
    }
    throw error;
  }
}
