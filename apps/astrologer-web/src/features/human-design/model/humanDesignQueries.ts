import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import type {
  HumanDesignPreviewRequest,
  HumanDesignTransitQuery,
  PersistHumanDesignCalculationRequest
} from "@elevenhouse/contracts";
import { listCalculations } from "../../calculations/api/calculationsApi";
import {
  createHumanDesignCalculation,
  getHumanDesignTransit,
  previewHumanDesign,
  recalculateHumanDesignCalculation
} from "../api/humanDesignApi";

export const humanDesignQueryKeys = {
  all: () => ["human-design"] as const,
  preview: () => ["human-design", "preview"] as const,
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
