import {
  createProductFromTemplateParamsSchema,
  createProductFromTemplateRequestSchema,
  productResponseSchema,
  type CreateProductFromTemplateParams,
  type CreateProductFromTemplateRequest,
  type ProductResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type CreateProductFromTemplateInput = CreateProductFromTemplateParams &
  CreateProductFromTemplateRequest;

export async function createProductFromTemplate(
  input: CreateProductFromTemplateInput
): Promise<ProductResponse> {
  const params = createProductFromTemplateParamsSchema.parse({
    templateCode: input.templateCode
  });
  const body = createProductFromTemplateRequestSchema.parse({ locale: input.locale });

  return productResponseSchema.parse(
    await application.http.post(`/products/templates/${params.templateCode}/drafts`, body, {
      csrf: true
    })
  );
}
