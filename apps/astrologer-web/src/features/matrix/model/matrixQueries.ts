import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import type {
  CreateMatrixNoteRequest,
  EnqueueMatrixPdfRequest,
  GenerateMatrixReportAiDraftRequest,
  MatrixInterpretationQuery,
  PersistMatrixCalculationRequest,
  PreviewMatrixRequest,
  SaveMatrixReportRequest,
  UpdateMatrixNoteRequest
} from "@elevenhouse/contracts";
import { listCalculations } from "../../calculations/api/calculationsApi";
import {
  createMatrixCalculation,
  createMatrixNote,
  deleteMatrixNote,
  downloadMatrixPdf,
  enqueueMatrixPdf,
  generateMatrixReportAiDraft,
  getLatestMatrixPdf,
  getMatrixInterpretation,
  getMatrixNotes,
  getMatrixProjection,
  getMatrixReport,
  previewMatrix,
  saveMatrixReport,
  updateMatrixNote
} from "../api/matrixApi";

export const matrixQueryKeys = {
  calculations: () => ["calculations"] as const,
  calculationList: () => ["calculations", "list", "matrix"] as const,
  notes: (calculationId: string) => ["matrix", "notes", calculationId] as const,
  interpretation: (query: MatrixInterpretationQuery) =>
    ["matrix", "interpretation", query] as const,
  report: (calculationId: string) => ["matrix", "report", calculationId] as const,
  pdf: (calculationId: string) => ["matrix", "pdf", calculationId] as const
};

export function matrixCalculationListQueryOptions() {
  const query = { module: "matrix", status: "all", limit: 50, offset: 0 } as const;
  return {
    queryKey: matrixQueryKeys.calculationList(),
    queryFn: () => listCalculations(query),
    placeholderData: keepPreviousData
  };
}

export function matrixNotesQueryOptions(calculationId: string) {
  return {
    queryKey: matrixQueryKeys.notes(calculationId),
    queryFn: () => getMatrixNotes(calculationId),
    enabled: Boolean(calculationId)
  };
}

export function matrixInterpretationQueryOptions(query: MatrixInterpretationQuery, enabled = true) {
  return {
    queryKey: matrixQueryKeys.interpretation(query),
    queryFn: () => getMatrixInterpretation(query),
    staleTime: 60 * 60 * 1000,
    enabled
  };
}

export function matrixReportQueryOptions(calculationId: string) {
  return {
    queryKey: matrixQueryKeys.report(calculationId),
    queryFn: () => getMatrixReport(calculationId),
    enabled: Boolean(calculationId)
  };
}

export function matrixPdfQueryOptions(calculationId: string) {
  return {
    queryKey: matrixQueryKeys.pdf(calculationId),
    queryFn: () => getLatestMatrixPdf(calculationId),
    enabled: Boolean(calculationId),
    refetchInterval: (query: { state: { data?: { job: { status: string } | null } } }) => {
      const status = query.state.data?.job?.status;
      return status === "queued" || status === "processing" ? 1500 : false;
    }
  };
}

export const previewMatrixMutationOptions = () => ({
  mutationFn: (body: PreviewMatrixRequest) => previewMatrix(body)
});

export function createMatrixMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (body: PersistMatrixCalculationRequest) => createMatrixCalculation(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: matrixQueryKeys.calculations() })
  };
}

export const matrixProjectionMutationOptions = () => ({ mutationFn: getMatrixProjection });

export function createMatrixNoteMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (input: { calculationId: string; body: CreateMatrixNoteRequest }) =>
      createMatrixNote(input),
    onSuccess: (_data: unknown, input: { calculationId: string }) =>
      queryClient.invalidateQueries({ queryKey: matrixQueryKeys.notes(input.calculationId) })
  };
}

export function updateMatrixNoteMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (input: { calculationId: string; noteId: string; body: UpdateMatrixNoteRequest }) =>
      updateMatrixNote(input),
    onSuccess: (_data: unknown, input: { calculationId: string }) =>
      queryClient.invalidateQueries({ queryKey: matrixQueryKeys.notes(input.calculationId) })
  };
}

export function deleteMatrixNoteMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: deleteMatrixNote,
    onSuccess: (_data: unknown, input: { calculationId: string }) =>
      queryClient.invalidateQueries({ queryKey: matrixQueryKeys.notes(input.calculationId) })
  };
}

export function saveMatrixReportMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (input: { calculationId: string; body: SaveMatrixReportRequest }) =>
      saveMatrixReport(input),
    onSuccess: (_data: unknown, input: { calculationId: string }) =>
      queryClient.invalidateQueries({ queryKey: matrixQueryKeys.report(input.calculationId) })
  };
}

export function generateMatrixReportMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (input: { calculationId: string; body: GenerateMatrixReportAiDraftRequest }) =>
      generateMatrixReportAiDraft(input),
    onSuccess: (_data: unknown, input: { calculationId: string }) =>
      queryClient.invalidateQueries({ queryKey: matrixQueryKeys.report(input.calculationId) })
  };
}

export function enqueueMatrixPdfMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (input: { calculationId: string; body: EnqueueMatrixPdfRequest }) =>
      enqueueMatrixPdf(input),
    onSuccess: (_data: unknown, input: { calculationId: string }) =>
      queryClient.invalidateQueries({ queryKey: matrixQueryKeys.pdf(input.calculationId) })
  };
}

export const downloadMatrixPdfMutationOptions = () => ({ mutationFn: downloadMatrixPdf });
