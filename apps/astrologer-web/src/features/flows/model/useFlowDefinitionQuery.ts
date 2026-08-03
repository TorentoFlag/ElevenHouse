import { useQuery } from "@tanstack/react-query";
import { flowDefinitionQueryOptions } from "./flowsQueryOptions";

export function useFlowDefinitionQuery(flowId: string | null) {
  return useQuery(flowDefinitionQueryOptions(flowId));
}
