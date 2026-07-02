import {
  productResponseSchema,
  updateProductRequestSchema,
  type ProductResponse,
  type UpdateProductRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type UpdateProductInput = {
  readonly productId: string;
  readonly body: UpdateProductRequest;
};

export async function updateProduct(input: UpdateProductInput): Promise<ProductResponse> {
  const normalizedBody = updateProductRequestSchema.parse(input.body);

  return productResponseSchema.parse(
    await application.http.put(`/products/${input.productId}`, normalizedBody, { csrf: true })
  );
}
