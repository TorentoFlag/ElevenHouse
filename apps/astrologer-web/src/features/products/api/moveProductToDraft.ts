import {
  productResponseSchema,
  productStatusTransitionRequestSchema,
  type ProductResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";
import type { ProductStatusTransitionInput } from "./publishProduct";

export async function moveProductToDraft(
  input: ProductStatusTransitionInput
): Promise<ProductResponse> {
  const body = productStatusTransitionRequestSchema.parse({
    expectedRevision: input.expectedRevision
  });

  return productResponseSchema.parse(
    await application.http.post(`/products/${input.productId}/move-to-draft`, body, {
      csrf: true
    })
  );
}
