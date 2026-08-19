import type { ProductCurrency, ProductResponse } from "@elevenhouse/contracts";
import type { ProductCopy, ProductLocale } from "./productCopy";

export type FormattedProductPrice = {
  readonly amount: string;
  readonly suffix: string;
};

export type ProductCardSummary = {
  readonly typeLabel: string;
  readonly statusLabel: string;
  readonly statusTone: ProductResponse["status"];
  readonly price: FormattedProductPrice;
  readonly metaLine: string;
  readonly salesLabel: string;
  readonly salesCount: string;
  readonly revenueLabel: string;
  readonly ratingLabel: string | null;
};

export function formatMoneyMinor(
  amountMinor: number,
  currency: ProductCurrency,
  locale: ProductLocale
): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  })
    .format(amountMinor / 100)
    .replace(/\u00a0/g, " ");
}

export function formatProductPrice(
  product: Pick<ProductResponse, "currency" | "paymentModel" | "priceMinor" | "subscriptionPeriod">,
  copy: ProductCopy,
  locale: ProductLocale
): FormattedProductPrice {
  const subscriptionSuffix =
    product.paymentModel === "sub" && product.subscriptionPeriod
      ? `/${copy.subscriptionPeriods[product.subscriptionPeriod].short}`
      : "";

  return {
    amount: formatMoneyMinor(product.priceMinor, product.currency, locale),
    suffix: subscriptionSuffix
  };
}

export function createProductCardSummary(
  product: ProductResponse,
  copy: ProductCopy,
  locale: ProductLocale
): ProductCardSummary {
  const analyticsUnavailable = product.analytics.status === "unavailable";

  return {
    typeLabel: getProductCardTypeLabel(product, copy),
    statusLabel: copy.statuses[product.status].label,
    statusTone: copy.statuses[product.status].tone,
    price: formatProductPrice(product, copy, locale),
    metaLine: createProductMetaLine(product, copy),
    salesLabel: copy.card.salesLabel,
    salesCount: analyticsUnavailable ? "—" : String(product.analytics.salesCount),
    revenueLabel: analyticsUnavailable
      ? "—"
      : formatMoneyMinor(product.analytics.grossRevenueMinor, product.analytics.currency, locale),
    ratingLabel:
      analyticsUnavailable || product.analytics.averageRating === null
        ? null
        : String(product.analytics.averageRating)
  };
}

export function createDuplicateProductTitle(title: string, copy: ProductCopy): string {
  return `${title.trim()} (${copy.card.duplicateTitleSuffix})`.trim();
}

function createProductMetaLine(product: ProductResponse, copy: ProductCopy): string {
  const formatLine = product.deliveryFormats
    .map((deliveryFormat) => copy.deliveryFormats[deliveryFormat].label)
    .join(" + ");
  const durationLine =
    product.durationLabel ??
    (product.durationMinutes === null ? null : `${product.durationMinutes} мин`) ??
    product.slaLabel;

  return [formatLine, durationLine].filter(Boolean).join(" · ");
}

function getProductCardTypeLabel(product: ProductResponse, copy: ProductCopy): string {
  if (
    product.astroDiaryConfig !== null &&
    product.accessGrants.length === 1 &&
    product.accessGrants[0] === "journal"
  ) {
    return copy.accessGrants.journal.label;
  }

  return copy.types[product.type].label;
}
