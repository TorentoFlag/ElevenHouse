import { useQuery } from "@tanstack/react-query";
import { flowTemplatesQueryOptions } from "./flowsQueryOptions";

export function useFlowTemplatesQuery() {
  return useQuery(flowTemplatesQueryOptions());
}
