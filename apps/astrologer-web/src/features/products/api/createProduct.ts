import {
  createProductRequestSchema,
  productResponseSchema,
  type CreateProductRequest,
  type ProductResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createProduct(body: CreateProductRequest): Promise<ProductResponse> {
  const normalizedBody = createProductRequestSchema.parse(body);

  return productResponseSchema.parse(
    await application.http.post("/products", normalizedBody, { csrf: true })
  );
}
