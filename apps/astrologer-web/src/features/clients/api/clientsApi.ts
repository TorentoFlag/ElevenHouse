import {
  astrologerClientListQuerySchema,
  astrologerClientListResponseSchema,
  type AstrologerClientListQuery,
  type AstrologerClientListResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listAstrologerClients(
  query: Partial<AstrologerClientListQuery> = {}
): Promise<AstrologerClientListResponse> {
  const parsedQuery = astrologerClientListQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    query: parsedQuery.query,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return astrologerClientListResponseSchema.parse(
    await application.http.get(`/clients?${searchParams.toString()}`)
  );
}
