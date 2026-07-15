import type {
  CalculationPdfLocale,
  CreateNumerologyAiDraftRequest,
  CreateNumerologyCalculationRequest,
  ListCalculationsQuery,
  PreviewNumerologyRequest,
  RecalculateNumerologyCalculationRequest,
  RequestCalculationPdf
} from "@elevenhouse/contracts";
import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  getCalculation,
  linkCalculationClient,
  listCalculations,
  publishCalculation,
  saveCalculationInterpretation
} from "../../calculations/api/calculationsApi";
import {
  createNumerologyAiDraft,
  createNumerologyCalculation,
  downloadNumerologyPdf,
  enqueueNumerologyPdf,
  getLatestNumerologyPdf,
  previewNumerology,
  recalculateNumerologyCalculation
} from "../api/numerologyApi";

export const numerologyPdfQueryKeys = {
  detail: (calculationId: string, locale: CalculationPdfLocale, resultChecksum: string) =>
    ["numerology", "pdf", calculationId, locale, resultChecksum] as const
};

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

export function numerologyPdfQueryOptions(input: {
  readonly calculationId: string;
  readonly locale: CalculationPdfLocale;
  readonly resultChecksum: string;
}) {
  return {
    queryKey: numerologyPdfQueryKeys.detail(
      input.calculationId,
      input.locale,
      input.resultChecksum
    ),
    queryFn: () =>
      getLatestNumerologyPdf({ calculationId: input.calculationId, locale: input.locale }),
    enabled: Boolean(input.calculationId && input.resultChecksum),
    refetchInterval: (query: { state: { data?: { job: { status: string } | null } } }) => {
      const status = query.state.data?.job?.status;
      return status === "queued" || status === "processing" ? 1500 : false;
    }
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

export function createNumerologyAiDraftMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: {
      readonly calculationId: string;
      readonly body: CreateNumerologyAiDraftRequest;
    }) => createNumerologyAiDraft(input),
    onSuccess: () => invalidateCalculations(queryClient)
  };
}

export function enqueueNumerologyPdfMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: { readonly calculationId: string; readonly body: RequestCalculationPdf }) =>
      enqueueNumerologyPdf(input),
    onSuccess: (
      _data: unknown,
      input: {
        readonly calculationId: string;
        readonly body: RequestCalculationPdf;
      }
    ) =>
      queryClient.invalidateQueries({
        queryKey: numerologyPdfQueryKeys.detail(
          input.calculationId,
          input.body.locale,
          input.body.expectedResultChecksum
        )
      })
  };
}

export const downloadNumerologyPdfMutationOptions = () => ({
  mutationFn: downloadNumerologyPdf
});

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

export function archiveNumerologyMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (calculationId: string) => archiveCalculation(calculationId),
    onSuccess: () => invalidateCalculations(queryClient)
  };
}

function invalidateCalculations(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return queryClient.invalidateQueries({ queryKey: calculationsQueryKeys.all() });
}
