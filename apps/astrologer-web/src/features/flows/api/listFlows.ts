import {
  listFlowsQuerySchema,
  listFlowsResponseSchema,
  type ListFlowsQuery,
  type ListFlowsResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listFlows(query: ListFlowsQuery): Promise<ListFlowsResponse> {
  const parsedQuery = listFlowsQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    status: parsedQuery.status,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return listFlowsResponseSchema.parse(
    await application.http.get(`/flows?${searchParams.toString()}`)
  );
}
