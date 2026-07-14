import {
  calculationIdParamSchema,
  createMatrixNoteRequestSchema,
  enqueueMatrixPdfRequestSchema,
  generateMatrixReportAiDraftRequestSchema,
  matrixCalculationResponseSchema,
  matrixInterpretationQuerySchema,
  matrixInterpretationResponseSchema,
  matrixNoteIdParamSchema,
  matrixNoteResponseSchema,
  matrixNotesResponseSchema,
  matrixPdfDownloadResponseSchema,
  matrixPdfJobIdParamSchema,
  matrixPdfJobResponseSchema,
  matrixPreviewResponseSchema,
  matrixProjectionQuerySchema,
  matrixProjectionResponseSchema,
  matrixReportResponseSchema,
  persistMatrixCalculationRequestSchema,
  previewMatrixRequestSchema,
  saveMatrixReportRequestSchema,
  updateMatrixNoteRequestSchema,
  type CreateMatrixNoteRequest,
  type EnqueueMatrixPdfRequest,
  type GenerateMatrixReportAiDraftRequest,
  type MatrixCalculationResponse,
  type MatrixInterpretationQuery,
  type MatrixInterpretationResponse,
  type MatrixNoteResponse,
  type MatrixNotesResponse,
  type MatrixPdfDownloadResponse,
  type MatrixPdfJobResponse,
  type MatrixPreviewResponse,
  type MatrixProjectionResponse,
  type MatrixReportResponse,
  type PersistMatrixCalculationRequest,
  type PreviewMatrixRequest,
  type SaveMatrixReportRequest,
  type UpdateMatrixNoteRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function previewMatrix(input: PreviewMatrixRequest): Promise<MatrixPreviewResponse> {
  return matrixPreviewResponseSchema.parse(
    await application.http.post("/matrix/preview", previewMatrixRequestSchema.parse(input))
  );
}

export async function createMatrixCalculation(
  input: PersistMatrixCalculationRequest
): Promise<MatrixCalculationResponse> {
  return matrixCalculationResponseSchema.parse(
    await application.http.post(
      "/matrix/calculations",
      persistMatrixCalculationRequestSchema.parse(input),
      { csrf: true }
    )
  );
}

export async function getMatrixProjection(input: {
  readonly calculationId: string;
  readonly year: number;
}): Promise<MatrixProjectionResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  const query = matrixProjectionQuerySchema.parse({ year: input.year });
  return matrixProjectionResponseSchema.parse(
    await application.http.get(
      `/matrix/calculations/${params.calculationId}/projection?year=${query.year}`
    )
  );
}

export async function getMatrixNotes(calculationId: string): Promise<MatrixNotesResponse> {
  const params = calculationIdParamSchema.parse({ calculationId });
  return matrixNotesResponseSchema.parse(
    await application.http.get(`/matrix/calculations/${params.calculationId}/notes`)
  );
}

export async function createMatrixNote(input: {
  readonly calculationId: string;
  readonly body: CreateMatrixNoteRequest;
}): Promise<MatrixNoteResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  return matrixNoteResponseSchema.parse(
    await application.http.post(
      `/matrix/calculations/${params.calculationId}/notes`,
      createMatrixNoteRequestSchema.parse(input.body),
      { csrf: true }
    )
  );
}

export async function updateMatrixNote(input: {
  readonly calculationId: string;
  readonly noteId: string;
  readonly body: UpdateMatrixNoteRequest;
}): Promise<MatrixNoteResponse> {
  const params = matrixNoteIdParamSchema.parse({
    calculationId: input.calculationId,
    noteId: input.noteId
  });
  return matrixNoteResponseSchema.parse(
    await application.http.put(
      `/matrix/calculations/${params.calculationId}/notes/${params.noteId}`,
      updateMatrixNoteRequestSchema.parse(input.body),
      { csrf: true }
    )
  );
}

export async function deleteMatrixNote(input: {
  readonly calculationId: string;
  readonly noteId: string;
}): Promise<void> {
  const params = matrixNoteIdParamSchema.parse(input);
  await application.http.delete(
    `/matrix/calculations/${params.calculationId}/notes/${params.noteId}`,
    { csrf: true }
  );
}

export async function getMatrixInterpretation(
  input: MatrixInterpretationQuery
): Promise<MatrixInterpretationResponse> {
  const query = matrixInterpretationQuerySchema.parse(input);
  const params = new URLSearchParams({
    locale: query.locale,
    arcana: String(query.arcana),
    context: query.context
  });
  return matrixInterpretationResponseSchema.parse(
    await application.http.get(`/matrix/interpretations?${params.toString()}`)
  );
}

export async function getMatrixReport(calculationId: string): Promise<MatrixReportResponse> {
  const params = calculationIdParamSchema.parse({ calculationId });
  return matrixReportResponseSchema.parse(
    await application.http.get(`/matrix/calculations/${params.calculationId}/report`)
  );
}

export async function saveMatrixReport(input: {
  readonly calculationId: string;
  readonly body: SaveMatrixReportRequest;
}): Promise<MatrixReportResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  return matrixReportResponseSchema.parse(
    await application.http.put(
      `/matrix/calculations/${params.calculationId}/report`,
      saveMatrixReportRequestSchema.parse(input.body),
      { csrf: true }
    )
  );
}

export async function generateMatrixReportAiDraft(input: {
  readonly calculationId: string;
  readonly body: GenerateMatrixReportAiDraftRequest;
}): Promise<MatrixReportResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  return matrixReportResponseSchema.parse(
    await application.http.post(
      `/matrix/calculations/${params.calculationId}/report/ai-draft`,
      generateMatrixReportAiDraftRequestSchema.parse(input.body),
      { csrf: true }
    )
  );
}

export async function getLatestMatrixPdf(calculationId: string): Promise<MatrixPdfJobResponse> {
  const params = calculationIdParamSchema.parse({ calculationId });
  return matrixPdfJobResponseSchema.parse(
    await application.http.get(`/matrix/calculations/${params.calculationId}/report/pdf`)
  );
}

export async function enqueueMatrixPdf(input: {
  readonly calculationId: string;
  readonly body: EnqueueMatrixPdfRequest;
}): Promise<MatrixPdfJobResponse> {
  const params = calculationIdParamSchema.parse({ calculationId: input.calculationId });
  return matrixPdfJobResponseSchema.parse(
    await application.http.post(
      `/matrix/calculations/${params.calculationId}/report/pdf`,
      enqueueMatrixPdfRequestSchema.parse(input.body),
      { csrf: true }
    )
  );
}

export async function downloadMatrixPdf(input: {
  readonly calculationId: string;
  readonly jobId: string;
}): Promise<MatrixPdfDownloadResponse> {
  const params = matrixPdfJobIdParamSchema.parse(input);
  return matrixPdfDownloadResponseSchema.parse(
    await application.http.get(
      `/matrix/calculations/${params.calculationId}/report/pdf/${params.jobId}/download`
    )
  );
}
