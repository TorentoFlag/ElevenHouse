import type { ProductTemplate, ProductTemplateLocale } from "./product-template-types";

export type ProductTemplateStore = {
  readonly listActiveByLocale: (input: {
    readonly locale: ProductTemplateLocale;
  }) => Promise<readonly ProductTemplate[]>;
  readonly findActiveByCodeAndLocale: (input: {
    readonly code: string;
    readonly locale: ProductTemplateLocale;
  }) => Promise<ProductTemplate | null>;
};
