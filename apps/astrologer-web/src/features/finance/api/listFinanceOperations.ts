import {
  ledgerOperationListQuerySchema,
  ledgerOperationListResponseSchema,
  type LedgerOperationListQuery,
  type LedgerOperationListResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listFinanceOperations(
  query: LedgerOperationListQuery = {}
): Promise<LedgerOperationListResponse> {
  const parsedQuery = ledgerOperationListQuerySchema.parse(query);
  const search = new URLSearchParams();
  if (parsedQuery.cursor) search.set("cursor", parsedQuery.cursor);
  if (parsedQuery.limit) search.set("limit", String(parsedQuery.limit));
  if (parsedQuery.operationType) search.set("operationType", parsedQuery.operationType);
  if (parsedQuery.balanceBucket) search.set("balanceBucket", parsedQuery.balanceBucket);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";

  return ledgerOperationListResponseSchema.parse(
    await application.http.get(`/finance/operations${suffix}`)
  );
}
