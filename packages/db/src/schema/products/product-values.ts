export const productStatusValues = ["draft", "active", "archived"] as const;

export const productTypeValues = [
  "single",
  "pack",
  "async",
  "sub",
  "mini",
  "course",
  "custom"
] as const;

export const productDeliveryFormatValues = [
  "video",
  "audio",
  "chat",
  "text",
  "file",
  "channel"
] as const;

export const productExecutionModeValues = ["live", "async", "instant"] as const;

export const productPaymentModelValues = ["once", "pack", "sub", "free"] as const;

export const productSubscriptionPeriodValues = ["week", "month", "year"] as const;

export const productParticipantModeValues = ["solo", "group", "gift"] as const;

export const productRequiredClientDataValues = [
  "chart1",
  "cities",
  "chart2",
  "question",
  "event"
] as const;

export const productMethodValues = [
  "natal",
  "forecast",
  "synastry",
  "child",
  "numerology",
  "matrix",
  "humandesign"
] as const;

export const productAccessGrantValues = [
  "content",
  "channel",
  "records",
  "course",
  "community",
  "journal"
] as const;

export const productModifierKindValues = ["fixed", "percent", "free"] as const;

export const productCurrencyValues = ["RUB"] as const;

export function formatSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
