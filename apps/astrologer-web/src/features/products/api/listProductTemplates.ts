import {
  listProductTemplatesQuerySchema,
  listProductTemplatesResponseSchema,
  type ListProductTemplatesQuery,
  type ListProductTemplatesResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listProductTemplates(
  query: ListProductTemplatesQuery
): Promise<ListProductTemplatesResponse> {
  const parsedQuery = listProductTemplatesQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    locale: parsedQuery.locale
  });

  return listProductTemplatesResponseSchema.parse(
    await application.http.get(`/products/templates?${searchParams.toString()}`)
  );
}
