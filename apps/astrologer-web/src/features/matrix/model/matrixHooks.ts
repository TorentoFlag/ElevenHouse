import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MatrixInterpretationQuery } from "@elevenhouse/contracts";
import {
  createMatrixMutationOptions,
  createMatrixNoteMutationOptions,
  deleteMatrixNoteMutationOptions,
  downloadMatrixPdfMutationOptions,
  enqueueMatrixPdfMutationOptions,
  generateMatrixReportMutationOptions,
  matrixCalculationListQueryOptions,
  matrixInterpretationQueryOptions,
  matrixNotesQueryOptions,
  matrixPdfQueryOptions,
  matrixProjectionMutationOptions,
  matrixReportQueryOptions,
  previewMatrixMutationOptions,
  saveMatrixReportMutationOptions,
  updateMatrixNoteMutationOptions
} from "./matrixQueries";

export const useMatrixCalculationListQuery = () => useQuery(matrixCalculationListQueryOptions());
export const usePreviewMatrixMutation = () => useMutation(previewMatrixMutationOptions());
export const useMatrixProjectionMutation = () => useMutation(matrixProjectionMutationOptions());
export const useDownloadMatrixPdfMutation = () => useMutation(downloadMatrixPdfMutationOptions());

export function useCreateMatrixMutation() {
  return useMutation(createMatrixMutationOptions(useQueryClient()));
}
export function useMatrixNotesQuery(calculationId: string) {
  return useQuery(matrixNotesQueryOptions(calculationId));
}
export function useMatrixInterpretationQuery(query: MatrixInterpretationQuery, enabled = true) {
  return useQuery(matrixInterpretationQueryOptions(query, enabled));
}
export function useMatrixReportQuery(calculationId: string) {
  return useQuery(matrixReportQueryOptions(calculationId));
}
export function useMatrixPdfQuery(calculationId: string) {
  return useQuery(matrixPdfQueryOptions(calculationId));
}
export function useCreateMatrixNoteMutation() {
  return useMutation(createMatrixNoteMutationOptions(useQueryClient()));
}
export function useUpdateMatrixNoteMutation() {
  return useMutation(updateMatrixNoteMutationOptions(useQueryClient()));
}
export function useDeleteMatrixNoteMutation() {
  return useMutation(deleteMatrixNoteMutationOptions(useQueryClient()));
}
export function useSaveMatrixReportMutation() {
  return useMutation(saveMatrixReportMutationOptions(useQueryClient()));
}
export function useGenerateMatrixReportMutation() {
  return useMutation(generateMatrixReportMutationOptions(useQueryClient()));
}
export function useEnqueueMatrixPdfMutation() {
  return useMutation(enqueueMatrixPdfMutationOptions(useQueryClient()));
}
