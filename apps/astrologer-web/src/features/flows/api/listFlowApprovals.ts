import {
  listFlowApprovalsQuerySchema,
  listFlowApprovalsResponseSchema,
  type ListFlowApprovalsQuery,
  type ListFlowApprovalsResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listFlowApprovals(
  query: ListFlowApprovalsQuery
): Promise<ListFlowApprovalsResponse> {
  const parsedQuery = listFlowApprovalsQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    status: parsedQuery.status,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return listFlowApprovalsResponseSchema.parse(
    await application.http.get(`/flow-approvals?${searchParams.toString()}`)
  );
}
