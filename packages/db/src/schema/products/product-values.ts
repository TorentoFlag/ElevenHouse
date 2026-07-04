export {
  productAccessGrantValues,
  productCurrencyValues,
  productDeliveryFormatValues,
  productExecutionModeValues,
  productMethodValues,
  productModifierKindValues,
  productParticipantModeValues,
  productPaymentModelValues,
  productRequiredClientDataValues,
  productStatusValues,
  productSubscriptionPeriodValues,
  productTypeValues
} from "@elevenhouse/validation/products";

export function formatSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
