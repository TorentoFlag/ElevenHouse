import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { matrixReportDraftPromptV1 } from "@elevenhouse/ai";
import {
  calculationIdParamSchema,
  enqueueMatrixPdfRequestSchema,
  generateMatrixReportAiDraftRequestSchema,
  matrixBaseResultSchema,
  matrixPdfDownloadResponseSchema,
  matrixPdfJobIdParamSchema,
  matrixPdfJobResponseSchema,
  matrixReportResponseSchema,
  saveMatrixReportRequestSchema,
  type EnqueueMatrixPdfRequest,
  type GenerateMatrixReportAiDraftRequest,
  type MatrixPdfDownloadResponse,
  type MatrixPdfJobResponse,
  type MatrixReportResponse,
  type SaveMatrixReportRequest
} from "@elevenhouse/contracts";
import {
  assertMatrixReportPdfEligible,
  buildMatrixReportAiContext,
  getCalculation,
  getMatrixReport,
  isMatrixReportStale,
  listMatrixNotes,
  saveMatrixReport,
  sha256CanonicalJson,
  type CalculationRecord,
  type CalculationStore,
  type CanonicalJson,
  type MatrixBaseResult,
  type MatrixNoteStore,
  type MatrixPdfJob,
  type MatrixPdfJobStore,
  type MatrixReportDraft,
  type MatrixReportStore,
  type MediaAssetStore,
  type PrivateObjectStoragePort
} from "@elevenhouse/domain";
import { AiGenerationService } from "../ai/ai-generation.service";
import { SystemClock } from "../clock/system-clock.service";
import { requireOwnerUserId } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { MEDIA_ASSET_STORE, MEDIA_PRIVATE_OBJECT_STORAGE } from "../media/media.tokens";
import { mapMatrixError, matrixHttpError, MatrixResultIntegrityError } from "./matrix-http-errors";
import { MATRIX_NOTE_STORE } from "./matrix-notes.tokens";
import {
  MATRIX_PDF_JOB_STORE,
  MATRIX_REPORT_ID_GENERATOR,
  MATRIX_REPORT_STORE
} from "./matrix-report.tokens";
import { MatrixService } from "./matrix.service";

type MatrixMediaStorageConfig = {
  readonly privateBucket: string;
};

@Injectable()
export class MatrixReportService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly calculationStore: CalculationStore,
    @Inject(MATRIX_REPORT_STORE) private readonly reportStore: MatrixReportStore,
    @Inject(MATRIX_NOTE_STORE) private readonly noteStore: MatrixNoteStore,
    @Inject(MATRIX_PDF_JOB_STORE) private readonly pdfJobStore: MatrixPdfJobStore,
    @Inject(MEDIA_ASSET_STORE) private readonly mediaStore: MediaAssetStore,
    private readonly aiGeneration: AiGenerationService,
    private readonly matrixService: MatrixService,
    @Inject(MEDIA_PRIVATE_OBJECT_STORAGE)
    private readonly privateStorage: PrivateObjectStoragePort,
    private readonly configService: ConfigService,
    private readonly clock: SystemClock,
    @Inject(MATRIX_REPORT_ID_GENERATOR) private readonly idGenerator: () => string
  ) {}

  async get(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<MatrixReportResponse> {
    const params = parseContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      const report = await getMatrixReport({
        store: this.reportStore,
        ownerUserId,
        calculationId: calculation.id
      });
      return matrixReportResponseSchema.parse({
        report: report ? toReportResponse(report, calculation.resultChecksum) : null,
        currentResultChecksum: calculation.resultChecksum
      });
    });
  }

  async save(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixReportResponse> {
    const params = parseContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsed = parseContract<SaveMatrixReportRequest>(saveMatrixReportRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      const report = await saveMatrixReport({
        store: this.reportStore,
        ownerUserId,
        calculationId: calculation.id,
        source: "manual",
        status: parsed.status,
        locale: parsed.locale,
        content: parsed.content,
        expectedResultChecksum: parsed.expectedResultChecksum,
        currentResultChecksum: calculation.resultChecksum,
        idGenerator: this.idGenerator,
        now: this.clock.now()
      });
      return matrixReportResponseSchema.parse({
        report: toReportResponse(report, calculation.resultChecksum),
        currentResultChecksum: calculation.resultChecksum
      });
    });
  }

  async generateAiDraft(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixReportResponse> {
    const params = parseContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsed = parseContract<GenerateMatrixReportAiDraftRequest>(
      generateMatrixReportAiDraftRequestSchema,
      body
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      requireCurrentChecksum(calculation, parsed.expectedResultChecksum);
      if (parsed.projectionYear !== null && calculation.mode !== "individual") {
        throw matrixHttpError(
          409,
          "MATRIX_CALCULATION_MISMATCH",
          "Annual projection is available only for an individual Matrix"
        );
      }
      const result = validatedSavedResult(calculation);
      const notes = await listMatrixNotes({
        store: this.noteStore,
        ownerUserId,
        calculationId: calculation.id
      });
      const projection =
        parsed.projectionYear === null
          ? null
          : (
              await this.matrixService.projection(
                calculation.id,
                { year: parsed.projectionYear },
                request
              )
            ).projection;
      const context = buildMatrixReportAiContext({
        locale: parsed.locale,
        result,
        resultChecksum: calculation.resultChecksum,
        notes,
        selectedNoteIds: parsed.noteIds,
        projection
      });
      const generated = await this.aiGeneration.generate({
        prompt: matrixReportDraftPromptV1,
        input: matrixReportDraftPromptV1.inputSchema.parse(context),
        ownerUserId,
        feature: "matrix.reportDraft"
      });
      const report = await saveMatrixReport({
        store: this.reportStore,
        ownerUserId,
        calculationId: calculation.id,
        source: "ai",
        status: "draft",
        locale: parsed.locale,
        content: generated.output,
        expectedResultChecksum: parsed.expectedResultChecksum,
        currentResultChecksum: calculation.resultChecksum,
        modelId: generated.model,
        promptVersion: `${matrixReportDraftPromptV1.id}@${matrixReportDraftPromptV1.version}`,
        idGenerator: this.idGenerator,
        now: this.clock.now()
      });
      return matrixReportResponseSchema.parse({
        report: toReportResponse(report, calculation.resultChecksum),
        currentResultChecksum: calculation.resultChecksum
      });
    });
  }

  async latestPdf(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<MatrixPdfJobResponse> {
    const params = parseContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      const job = await this.pdfJobStore.findLatestByCalculation({
        ownerUserId,
        calculationId: calculation.id
      });
      return matrixPdfJobResponseSchema.parse({
        job: job ? toPdfJobResponse(job) : null,
        currentResultChecksum: calculation.resultChecksum
      });
    });
  }

  async enqueuePdf(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixPdfJobResponse> {
    const params = parseContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsed = parseContract<EnqueueMatrixPdfRequest>(enqueueMatrixPdfRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      requireCurrentChecksum(calculation, parsed.expectedResultChecksum);
      const report = assertMatrixReportPdfEligible({
        report: await getMatrixReport({
          store: this.reportStore,
          ownerUserId,
          calculationId: calculation.id
        }),
        currentResultChecksum: calculation.resultChecksum
      });
      const jobId = this.idGenerator();
      const mediaAssetId = this.idGenerator();
      const artifactId = this.idGenerator();
      const outboxEventId = this.idGenerator();
      const storage = this.configService.getOrThrow<MatrixMediaStorageConfig>(
        "astrologerApi.mediaStorage"
      );
      const job = await this.pdfJobStore.enqueue({
        id: jobId,
        mediaAssetId,
        artifactId,
        outboxEventId,
        ownerUserId,
        calculationId: calculation.id,
        reportId: report.id,
        reportRevision: report.revision,
        resultChecksum: calculation.resultChecksum,
        locale: report.locale,
        privateStorageBucket: storage.privateBucket,
        storageKey: `${ownerUserId}/matrix_report_pdf/${jobId}/report.pdf`,
        originalFileName: report.locale === "ru" ? "Матрица судьбы.pdf" : "Destiny Matrix.pdf",
        now: this.clock.now().toISOString()
      });
      if (!job) {
        throw matrixHttpError(409, "MATRIX_RESULT_CHANGED", "Matrix result or report changed");
      }
      return matrixPdfJobResponseSchema.parse({
        job: toPdfJobResponse(job),
        currentResultChecksum: calculation.resultChecksum
      });
    });
  }

  async downloadPdf(
    calculationId: string,
    jobId: string,
    request: AstrologerSessionRequest
  ): Promise<MatrixPdfDownloadResponse> {
    const params = parseContract<{ calculationId: string; jobId: string }>(
      matrixPdfJobIdParamSchema,
      { calculationId, jobId }
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      await this.ownedMatrix(ownerUserId, params.calculationId);
      const job = await this.pdfJobStore.findById({
        ownerUserId,
        calculationId: params.calculationId,
        jobId: params.jobId
      });
      if (!job) throw matrixHttpError(404, "MATRIX_PDF_NOT_FOUND", "Matrix PDF was not found");
      if (job.status !== "ready") {
        throw matrixHttpError(409, "MATRIX_PDF_NOT_READY", "Matrix PDF is not ready");
      }
      const asset = await this.mediaStore.findByOwnerAndId({
        ownerUserId,
        mediaId: job.mediaAssetId
      });
      if (
        !asset ||
        asset.status !== "ready" ||
        asset.purpose !== "matrix_report_pdf" ||
        asset.visibility !== "private"
      ) {
        throw matrixHttpError(404, "MATRIX_PDF_NOT_FOUND", "Matrix PDF was not found");
      }
      return matrixPdfDownloadResponseSchema.parse(
        await this.privateStorage.createPresignedDownload({
          storageBucket: asset.storageBucket,
          storageKey: asset.storageKey,
          fileName: asset.originalFileName
        })
      );
    });
  }

  private async ownedMatrix(
    ownerUserId: string,
    calculationId: string
  ): Promise<CalculationRecord> {
    const calculation = await getCalculation({
      store: this.calculationStore,
      ownerUserId,
      calculationId
    });
    if (calculation.module !== "matrix" || calculation.methodCode !== "ladini_22") {
      throw matrixHttpError(
        409,
        "MATRIX_CALCULATION_MISMATCH",
        "Calculation is not a supported Matrix record"
      );
    }
    return calculation;
  }
}

function validatedSavedResult(record: CalculationRecord): MatrixBaseResult {
  const parsed = matrixBaseResultSchema.safeParse(record.resultData);
  if (
    !parsed.success ||
    sha256CanonicalJson(parsed.data as unknown as CanonicalJson) !== record.resultChecksum ||
    parsed.data.mode !== record.mode ||
    parsed.data.methodCode !== record.methodCode
  ) {
    throw new MatrixResultIntegrityError();
  }
  return parsed.data;
}

function requireCurrentChecksum(calculation: CalculationRecord, expected: string): void {
  if (calculation.resultChecksum !== expected) {
    throw matrixHttpError(409, "MATRIX_RESULT_CHANGED", "Matrix result changed; reload and retry");
  }
}

function toReportResponse(report: MatrixReportDraft, currentResultChecksum: string) {
  return {
    id: report.id,
    calculationId: report.calculationId,
    source: report.source,
    status: report.status,
    locale: report.locale,
    content: report.content,
    plainText: report.plainText,
    resultChecksum: report.resultChecksum,
    stale: isMatrixReportStale({ report, currentResultChecksum }),
    revision: report.revision,
    modelId: report.modelId,
    promptVersion: report.promptVersion,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt
  };
}

function toPdfJobResponse(job: MatrixPdfJob) {
  return {
    id: job.id,
    calculationId: job.calculationId,
    reportId: job.reportId,
    reportRevision: job.reportRevision,
    resultChecksum: job.resultChecksum,
    locale: job.locale,
    status: job.status,
    artifactId: job.artifactId,
    mediaAssetId: job.mediaAssetId,
    failureReason: job.failureReason,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

function parseContract<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  value: unknown
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw matrixHttpError(400, "MATRIX_VALIDATION_FAILED", "Invalid Matrix report request");
  }
  return result.data as T;
}
