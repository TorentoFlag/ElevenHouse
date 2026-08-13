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
    ? "Подписку на Астродневник пока нельзя активировать: платежи и выдача доступа еще не подключены. Сохраните продукт как черновик."
    : "The AstroDiary subscription cannot be activated yet because billing and access fulfillment are not connected. Save the product as a draft.";
}
