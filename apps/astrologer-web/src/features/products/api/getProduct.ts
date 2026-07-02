import { productResponseSchema, type ProductResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getProduct(productId: string): Promise<ProductResponse> {
  return productResponseSchema.parse(await application.http.get(`/products/${productId}`));
}
