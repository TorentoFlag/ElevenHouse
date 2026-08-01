import {
  listFlowRunsQuerySchema,
  listFlowRunsResponseSchema,
  type ListFlowRunsQuery,
  type ListFlowRunsResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type ListFlowRunsInput = {
  readonly flowId: string;
  readonly query: ListFlowRunsQuery;
};

export async function listFlowRuns(input: ListFlowRunsInput): Promise<ListFlowRunsResponse> {
  const parsedQuery = listFlowRunsQuerySchema.parse(input.query);
  const searchParams = new URLSearchParams({
    status: parsedQuery.status,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return listFlowRunsResponseSchema.parse(
    await application.http.get(`/flows/${input.flowId}/runs?${searchParams.toString()}`)
  );
}
