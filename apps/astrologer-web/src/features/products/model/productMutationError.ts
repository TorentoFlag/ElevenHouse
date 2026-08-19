import { productMutationRejectionSchema, type ProductTemplateLocale } from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";

export function isProductRevisionConflict(error: unknown): boolean {
  if (!(error instanceof HttpError)) {
    return false;
  }

  const rejection = productMutationRejectionSchema.safeParse(error.body);
  return rejection.success && rejection.data.code === "PRODUCT_REVISION_CONFLICT";
}

export function describeProductMutationError(
  error: unknown,
  locale: ProductTemplateLocale,
  genericError: string
): string {
  if (!(error instanceof HttpError)) {
    return genericError;
  }

  const rejection = productMutationRejectionSchema.safeParse(error.body);
  if (!rejection.success) {
    return genericError;
  }

  if (rejection.data.code === "PRODUCT_REVISION_CONFLICT") {
    return locale === "ru"
      ? `Продукт изменился в другой вкладке: текущая редакция ${rejection.data.currentRevision}. Обновите страницу перед повторной правкой.`
      : `The product changed in another tab. Current revision: ${rejection.data.currentRevision}. Reload the page before editing again.`;
  }

  return locale === "ru"
    ? "Проверьте настройки Астродневника: нужен канонический продукт с разовой оплатой и полной конфигурацией платного периода."
    : "Check the AstroDiary settings: it must be the canonical one-time paid-period product with complete paid-period configuration.";
}
