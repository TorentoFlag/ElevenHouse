import {
  listFlowDefinitionsQuerySchema,
  listFlowDefinitionsResponseSchema,
  type ListFlowDefinitionsQueryInput,
  type ListFlowDefinitionsResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listFlows(
  query: ListFlowDefinitionsQueryInput
): Promise<ListFlowDefinitionsResponse> {
  const parsedQuery = listFlowDefinitionsQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    state: parsedQuery.state,
    enrollmentState: parsedQuery.enrollmentState,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return listFlowDefinitionsResponseSchema.parse(
    await application.http.get(`/flows?${searchParams.toString()}`, { cache: "no-store" })
  );
}
