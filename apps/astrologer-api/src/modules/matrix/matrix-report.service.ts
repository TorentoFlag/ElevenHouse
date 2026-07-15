import { Inject, Injectable } from "@nestjs/common";
import { matrixReportDraftPromptV1 } from "@elevenhouse/ai";
import {
  calculationIdParamSchema,
  generateMatrixReportAiDraftRequestSchema,
  matrixBaseResultSchema,
  matrixReportResponseSchema,
  saveMatrixReportRequestSchema,
  type GenerateMatrixReportAiDraftRequest,
  type MatrixReportResponse,
  type SaveMatrixReportRequest
} from "@elevenhouse/contracts";
import {
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
  type MatrixReportDraft,
  type MatrixReportStore
} from "@elevenhouse/domain";
import { AiGenerationService } from "../ai/ai-generation.service";
import { SystemClock } from "../clock/system-clock.service";
import { requireOwnerUserId } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { mapMatrixError, matrixHttpError, MatrixResultIntegrityError } from "./matrix-http-errors";
import { MATRIX_NOTE_STORE } from "./matrix-notes.tokens";
import { MATRIX_REPORT_ID_GENERATOR, MATRIX_REPORT_STORE } from "./matrix-report.tokens";
import { MatrixService } from "./matrix.service";

@Injectable()
export class MatrixReportService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly calculationStore: CalculationStore,
    @Inject(MATRIX_REPORT_STORE) private readonly reportStore: MatrixReportStore,
    @Inject(MATRIX_NOTE_STORE) private readonly noteStore: MatrixNoteStore,
    private readonly aiGeneration: AiGenerationService,
    private readonly matrixService: MatrixService,
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
