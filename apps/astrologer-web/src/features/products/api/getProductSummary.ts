import {
  productSummaryResponseSchema,
  type ProductSummaryResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getProductSummary(): Promise<ProductSummaryResponse> {
  return productSummaryResponseSchema.parse(await application.http.get("/products/summary"));
}
