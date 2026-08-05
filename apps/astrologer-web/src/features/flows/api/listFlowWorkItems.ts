import {
  listFlowWorkItemsQuerySchema,
  listFlowWorkItemsResponseSchema,
  type ListFlowWorkItemsQuery,
  type ListFlowWorkItemsResponse
} from "@elevenhouse/contracts";

import { application } from "../../../Application";

export async function listFlowWorkItems(
  query: ListFlowWorkItemsQuery
): Promise<ListFlowWorkItemsResponse> {
  const parsedQuery = listFlowWorkItemsQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    status: parsedQuery.status,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return listFlowWorkItemsResponseSchema.parse(
    await application.http.get(`/flow-work-items?${searchParams.toString()}`, {
      cache: "no-store"
    })
  );
}
