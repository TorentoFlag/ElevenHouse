import {
  duplicateProductRequestSchema,
  productResponseSchema,
  type DuplicateProductRequest,
  type ProductResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type DuplicateProductInput = {
  readonly productId: string;
  readonly body: DuplicateProductRequest;
};

export async function duplicateProduct(input: DuplicateProductInput): Promise<ProductResponse> {
  const normalizedBody = duplicateProductRequestSchema.parse(input.body);

  return productResponseSchema.parse(
    await application.http.post(`/products/${input.productId}/duplicate`, normalizedBody, {
      csrf: true
    })
  );
}
