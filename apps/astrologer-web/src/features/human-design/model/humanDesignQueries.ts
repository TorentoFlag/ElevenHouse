import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import type {
  HumanDesignPreviewRequest,
  PersistHumanDesignCalculationRequest
} from "@elevenhouse/contracts";
import { listCalculations } from "../../calculations/api/calculationsApi";
import { createHumanDesignCalculation, previewHumanDesign } from "../api/humanDesignApi";

export const humanDesignQueryKeys = {
  all: () => ["human-design"] as const,
  preview: () => ["human-design", "preview"] as const,
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
