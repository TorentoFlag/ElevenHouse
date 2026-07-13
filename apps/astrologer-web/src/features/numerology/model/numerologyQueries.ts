import type {
  CreateNumerologyCalculationRequest,
  ListCalculationsQuery,
  RecalculateNumerologyCalculationRequest,
  PreviewNumerologyRequest
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import {
  approveCalculationInterpretation,
  getCalculation,
  linkCalculationClient,
  listCalculations,
  publishCalculation,
  saveCalculationInterpretation
} from "../../calculations/api/calculationsApi";
import {
  createNumerologyCalculation,
  previewNumerology,
  recalculateNumerologyCalculation
} from "../api/numerologyApi";

export const calculationsQueryKeys = {
  all: () => ["calculations"] as const,
  list: (query: ListCalculationsQuery) => ["calculations", "list", query] as const,
  detail: (calculationId: string) => ["calculations", "detail", calculationId] as const
};

export function numerologyCalculationListQueryOptions() {
  const query = { module: "numerology", status: "all", limit: 50, offset: 0 } as const;

  return {
    queryKey: calculationsQueryKeys.list(query),
    queryFn: () => listCalculations(query),
    placeholderData: keepPreviousData
  };
}

export function calculationDetailQueryOptions(calculationId: string) {
  return {
    queryKey: calculationsQueryKeys.detail(calculationId),
    queryFn: () => getCalculation(calculationId),
    enabled: Boolean(calculationId)
  };
}

export function createNumerologyMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (body: CreateNumerologyCalculationRequest) => createNumerologyCalculation(body),
    onSuccess: () => invalidateCalculations(queryClient)
  };
}

export function previewNumerologyMutationOptions() {
  return { mutationFn: (body: PreviewNumerologyRequest) => previewNumerology(body) };
}

export function recalculateNumerologyMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: {
      readonly calculationId: string;
      readonly body: RecalculateNumerologyCalculationRequest;
    }) => recalculateNumerologyCalculation(input),
    onSuccess: () => invalidateCalculations(queryClient)
  };
}

export function linkCalculationClientMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: linkCalculationClient,
    onSuccess: () => invalidateCalculations(queryClient)
  };
}

export function saveCalculationInterpretationMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: saveCalculationInterpretation,
    onSuccess: () => invalidateCalculations(queryClient)
  };
}

export function approveCalculationInterpretationMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: approveCalculationInterpretation,
    onSuccess: () => invalidateCalculations(queryClient)
  };
}

export function publishCalculationMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: publishCalculation,
    onSuccess: () => invalidateCalculations(queryClient)
  };
}

function invalidateCalculations(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return queryClient.invalidateQueries({ queryKey: calculationsQueryKeys.all() });
}
