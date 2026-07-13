import type { ProductTemplateResponse } from "@elevenhouse/contracts";

export const customProductTemplateCode = "custom_format";

export type ProductTemplateSelectionModel = {
  readonly templates: readonly ProductTemplateResponse[];
  readonly customTemplate: ProductTemplateResponse | null;
};

export function createProductTemplateSelectionModel(
  templates: readonly ProductTemplateResponse[]
): ProductTemplateSelectionModel {
  return {
    templates: templates.filter((template) => template.code !== customProductTemplateCode),
    customTemplate:
      templates.find((template) => template.code === customProductTemplateCode) ?? null
  };
}
