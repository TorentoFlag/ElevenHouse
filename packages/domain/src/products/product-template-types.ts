import type { ProductCreateInput, ProductType } from "./product-types";
import type {
  ProductTemplateLocaleValue,
  ProductTemplateStatusValue
} from "@elevenhouse/validation/products";

export type ProductTemplateStatus = ProductTemplateStatusValue;
export type ProductTemplateLocale = ProductTemplateLocaleValue;

type ProductTemplateOptionalField =
  | "subtitle"
  | "coverMediaId"
  | "introVideoUrl"
  | "durationMinutes"
  | "durationLabel"
  | "slaLabel"
  | "packageSessionCount"
  | "packageDiscountPercent"
  | "subscriptionPeriod"
  | "trialDays"
  | "groupSize"
  | "astroDiaryConfig";

export type ProductTemplatePayload = Omit<
  ProductCreateInput,
  "ownerUserId" | ProductTemplateOptionalField
> & {
  readonly [Field in ProductTemplateOptionalField]?: Exclude<ProductCreateInput[Field], null>;
};

export type ProductTemplate = {
  readonly id: string;
  readonly code: string;
  readonly locale: ProductTemplateLocale;
  readonly type: ProductType;
  readonly status: ProductTemplateStatus;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly payload: ProductTemplatePayload;
  readonly createdAt: string;
  readonly updatedAt: string;
};
