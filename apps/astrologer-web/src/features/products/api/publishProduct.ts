import {
  productResponseSchema,
  productStatusTransitionRequestSchema,
  type ProductResponse,
  type ProductStatusTransitionRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type ProductStatusTransitionInput = ProductStatusTransitionRequest & {
  readonly productId: string;
};

export async function publishProduct(
  input: ProductStatusTransitionInput
): Promise<ProductResponse> {
  const body = productStatusTransitionRequestSchema.parse({
    expectedRevision: input.expectedRevision
  });

  return productResponseSchema.parse(
    await application.http.post(`/products/${input.productId}/publish`, body, { csrf: true })
  );
}
