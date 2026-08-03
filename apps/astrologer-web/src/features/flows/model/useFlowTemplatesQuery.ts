import { useQuery } from "@tanstack/react-query";
import { flowTemplatesQueryOptions } from "./flowsQueryOptions";

export function useFlowTemplatesQuery(locale: "ru" | "en") {
  return useQuery(flowTemplatesQueryOptions(locale));
}
