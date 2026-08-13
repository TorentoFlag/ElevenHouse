import {
  productResponseSchema,
  productStatusTransitionRequestSchema,
  type ProductResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";
import type { ProductStatusTransitionInput } from "./publishProduct";

export async function archiveProduct(
  input: ProductStatusTransitionInput
): Promise<ProductResponse> {
  const body = productStatusTransitionRequestSchema.parse({
    expectedRevision: input.expectedRevision
  });

  return productResponseSchema.parse(
    await application.http.post(`/products/${input.productId}/archive`, body, { csrf: true })
  );
}
