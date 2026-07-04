export const productStatusValues = ["draft", "active", "archived"] as const;
export type ProductStatusValue = (typeof productStatusValues)[number];
export type ProductStatusFilterValue = ProductStatusValue | "all";

export const productTypeValues = [
  "single",
  "pack",
  "async",
  "sub",
  "mini",
  "course",
  "custom"
] as const;
export type ProductTypeValue = (typeof productTypeValues)[number];

export const productDeliveryFormatValues = [
  "video",
  "audio",
  "chat",
  "text",
  "file",
  "channel"
] as const;
export type ProductDeliveryFormatValue = (typeof productDeliveryFormatValues)[number];

export const productExecutionModeValues = ["live", "async", "instant"] as const;
export type ProductExecutionModeValue = (typeof productExecutionModeValues)[number];

export const productPaymentModelValues = ["once", "pack", "sub", "free"] as const;
export type ProductPaymentModelValue = (typeof productPaymentModelValues)[number];

export const productSubscriptionPeriodValues = ["week", "month", "year"] as const;
export type ProductSubscriptionPeriodValue = (typeof productSubscriptionPeriodValues)[number];

export const productParticipantModeValues = ["solo", "group", "gift"] as const;
export type ProductParticipantModeValue = (typeof productParticipantModeValues)[number];

export const productRequiredClientDataValues = [
  "chart1",
  "cities",
  "chart2",
  "question",
  "event"
] as const;
export type ProductRequiredClientDataValue = (typeof productRequiredClientDataValues)[number];

export const productMethodValues = [
  "natal",
  "forecast",
  "synastry",
  "child",
  "numerology",
  "matrix",
  "humandesign"
] as const;
export type ProductMethodValue = (typeof productMethodValues)[number];

export const productAccessGrantValues = [
  "content",
  "channel",
  "records",
  "course",
  "community",
  "journal"
] as const;
export type ProductAccessGrantValue = (typeof productAccessGrantValues)[number];

export const productModifierKindValues = ["fixed", "percent", "free"] as const;
export type ProductModifierKindValue = (typeof productModifierKindValues)[number];

export const productCurrencyValues = ["RUB"] as const;
export type ProductCurrencyValue = (typeof productCurrencyValues)[number];

export const productAnalyticsStatusValues = ["ready", "unavailable"] as const;
export type ProductAnalyticsStatusValue = (typeof productAnalyticsStatusValues)[number];

export type ProductInvariantIssue = {
  readonly path: readonly string[];
  readonly message: string;
};

export type ProductUpdateInvariantInput = {
  readonly deliveryFormats?: readonly ProductDeliveryFormatValue[];
  readonly requiredClientData?: readonly ProductRequiredClientDataValue[];
  readonly methods?: readonly ProductMethodValue[];
  readonly accessGrants?: readonly ProductAccessGrantValue[];
};

export type ProductCreateInvariantInput = ProductUpdateInvariantInput & {
  readonly paymentModel?: ProductPaymentModelValue;
  readonly packageSessionCount?: number | null;
  readonly subscriptionPeriod?: ProductSubscriptionPeriodValue | null;
  readonly participantMode?: ProductParticipantModeValue;
  readonly groupSize?: number | null;
  readonly priceMinor?: number;
};

export type ProductModifierInvariantInput = {
  readonly kind?: ProductModifierKindValue;
  readonly priceMinor?: number | null;
};

export function collectProductCreateInvariantIssues(
  value: ProductCreateInvariantInput
): ProductInvariantIssue[] {
  const issues = collectProductUpdateInvariantIssues(value);

  if (value.paymentModel === "pack" && value.packageSessionCount == null) {
    issues.push({
      path: ["packageSessionCount"],
      message: "Package products require packageSessionCount"
    });
  }

  if (value.paymentModel === "sub" && value.subscriptionPeriod == null) {
    issues.push({
      path: ["subscriptionPeriod"],
      message: "Subscription products require subscriptionPeriod"
    });
  }

  if (value.participantMode === "group" && value.groupSize == null) {
    issues.push({
      path: ["groupSize"],
      message: "Group products require groupSize"
    });
  }

  if (value.paymentModel === "free" && value.priceMinor !== 0) {
    issues.push({
      path: ["priceMinor"],
      message: "Free products must have zero price"
    });
  }

  return issues;
}

export function collectProductUpdateInvariantIssues(
  value: ProductUpdateInvariantInput
): ProductInvariantIssue[] {
  return [
    ...collectUniqueArrayIssues(
      value.deliveryFormats,
      "deliveryFormats",
      "Product delivery formats must be unique"
    ),
    ...collectUniqueArrayIssues(
      value.requiredClientData,
      "requiredClientData",
      "Product required client data must be unique"
    ),
    ...collectUniqueArrayIssues(value.methods, "methods", "Product methods must be unique"),
    ...collectUniqueArrayIssues(
      value.accessGrants,
      "accessGrants",
      "Product access grants must be unique"
    )
  ];
}

export function collectProductModifierInvariantIssues(
  value: ProductModifierInvariantInput
): ProductInvariantIssue[] {
  if (value.kind === "percent" && value.priceMinor != null && value.priceMinor > 100) {
    return [
      {
        path: ["priceMinor"],
        message: "Percent modifiers must be from 0 to 100"
      }
    ];
  }

  if (value.kind === "free" && value.priceMinor !== 0) {
    return [
      {
        path: ["priceMinor"],
        message: "Free modifiers must have zero price"
      }
    ];
  }

  return [];
}

function collectUniqueArrayIssues(
  values: readonly string[] | undefined,
  path: string,
  message: string
): ProductInvariantIssue[] {
  if (values !== undefined && new Set(values).size !== values.length) {
    return [{ path: [path], message }];
  }

  return [];
}
