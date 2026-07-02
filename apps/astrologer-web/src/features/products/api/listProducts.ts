import {
  listProductsQuerySchema,
  listProductsResponseSchema,
  type ListProductsQuery,
  type ListProductsResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listProducts(query: ListProductsQuery): Promise<ListProductsResponse> {
  const parsedQuery = listProductsQuerySchema.parse(query);
  const searchParams = new URLSearchParams({
    status: parsedQuery.status,
    limit: String(parsedQuery.limit),
    offset: String(parsedQuery.offset)
  });

  return listProductsResponseSchema.parse(
    await application.http.get(`/products?${searchParams.toString()}`)
  );
}
