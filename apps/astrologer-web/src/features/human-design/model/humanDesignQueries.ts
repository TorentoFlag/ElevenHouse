import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import type {
  CalculationPdfLocale,
  CreateHumanDesignAiDraftRequest,
  HumanDesignPreviewRequest,
  HumanDesignTransitQuery,
  PersistHumanDesignCalculationRequest,
  SaveCalculationInterpretationRequest,
  RequestCalculationPdf
} from "@elevenhouse/contracts";
import {
  approveCalculationInterpretation,
  listCalculations,
  saveCalculationInterpretation
} from "../../calculations/api/calculationsApi";
import {
  createHumanDesignAiDraft,
  createHumanDesignCalculation,
  downloadHumanDesignPdf,
  enqueueHumanDesignPdf,
  getLatestHumanDesignPdf,
  getHumanDesignTransit,
  previewHumanDesign,
  recalculateHumanDesignCalculation
} from "../api/humanDesignApi";

export const humanDesignQueryKeys = {
  all: () => ["human-design"] as const,
  preview: () => ["human-design", "preview"] as const,
  pdf: (calculationId: string, locale: CalculationPdfLocale, resultChecksum: string) =>
    ["human-design", "pdf", calculationId, locale, resultChecksum] as const,
  transit: (calculationId: string, instant: string | null) =>
    ["human-design", "transit", calculationId, instant] as const,
  calculationList: () => ["calculations", "list", "human_design"] as const
};

export function humanDesignCalculationListQueryOptions() {
  const query = { module: "human_design", status: "all", limit: 50, offset: 0 } as const;
  return {
    queryKey: humanDesignQueryKeys.calculationList(),
    queryFn: () => listCalculations(query),
    placeholderData: keepPreviousData
  };
}

export const previewHumanDesignMutationOptions = () => ({
  mutationFn: (body: HumanDesignPreviewRequest) => previewHumanDesign(body)
});

export function humanDesignPdfQueryOptions(input: {
  readonly calculationId: string;
  readonly locale: CalculationPdfLocale;
  readonly resultChecksum: string;
}) {
  return {
    queryKey: humanDesignQueryKeys.pdf(input.calculationId, input.locale, input.resultChecksum),
    queryFn: () =>
      getLatestHumanDesignPdf({ calculationId: input.calculationId, locale: input.locale }),
    enabled: Boolean(input.calculationId && input.resultChecksum),
    refetchInterval: (query: { state: { data?: { job: { status: string } | null } } }) => {
      const status = query.state.data?.job?.status;
      return status === "queued" || status === "processing" ? 1500 : false;
    }
  };
}

export const createHumanDesignCalculationMutationOptions = (
  queryClient: Pick<QueryClient, "invalidateQueries">
) => ({
  mutationFn: (body: PersistHumanDesignCalculationRequest) => createHumanDesignCalculation(body),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculations"] })
});

export const recalculateHumanDesignCalculationMutationOptions = (
  queryClient: Pick<QueryClient, "invalidateQueries">
) => ({
  mutationFn: (input: { readonly calculationId: string }) =>
    recalculateHumanDesignCalculation(input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculations"] })
});

export const getHumanDesignTransitMutationOptions = () => ({
  mutationFn: (input: {
    readonly calculationId: string;
    readonly query?: HumanDesignTransitQuery;
  }) => getHumanDesignTransit(input)
});

export const createHumanDesignAiDraftMutationOptions = (
  queryClient: Pick<QueryClient, "invalidateQueries">
) => ({
  mutationFn: (input: {
    readonly calculationId: string;
    readonly body: CreateHumanDesignAiDraftRequest;
  }) => createHumanDesignAiDraft(input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculations"] })
});

export const saveHumanDesignInterpretationMutationOptions = (
  queryClient: Pick<QueryClient, "invalidateQueries">
) => ({
  mutationFn: (input: {
    readonly calculationId: string;
    readonly idempotencyKey: string;
    readonly body: SaveCalculationInterpretationRequest;
  }) => saveCalculationInterpretation(input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculations"] })
});

export const approveHumanDesignInterpretationMutationOptions = (
  queryClient: Pick<QueryClient, "invalidateQueries">
) => ({
  mutationFn: (input: { readonly calculationId: string; readonly interpretationId: string }) =>
    approveCalculationInterpretation(input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calculations"] })
});

export const enqueueHumanDesignPdfMutationOptions = (
  queryClient: Pick<QueryClient, "invalidateQueries">
) => ({
  mutationFn: (input: { readonly calculationId: string; readonly body: RequestCalculationPdf }) =>
    enqueueHumanDesignPdf(input),
  onSuccess: (
    _data: unknown,
    input: {
      readonly calculationId: string;
      readonly body: RequestCalculationPdf;
    }
  ) =>
    queryClient.invalidateQueries({
      queryKey: humanDesignQueryKeys.pdf(
        input.calculationId,
        input.body.locale,
        input.body.expectedResultChecksum
      )
    })
});

export const downloadHumanDesignPdfMutationOptions = () => ({
  mutationFn: downloadHumanDesignPdf
});
