export const productStatusValues = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof productStatusValues)[number];
export type ProductStatusFilter = ProductStatus | "all";

export const productTypeValues = [
  "single",
  "pack",
  "async",
  "sub",
  "mini",
  "course",
  "custom"
] as const;
export type ProductType = (typeof productTypeValues)[number];

export const productDeliveryFormatValues = [
  "video",
  "audio",
  "chat",
  "text",
  "file",
  "channel"
] as const;
export type ProductDeliveryFormat = (typeof productDeliveryFormatValues)[number];

export const productExecutionModeValues = ["live", "async", "instant"] as const;
export type ProductExecutionMode = (typeof productExecutionModeValues)[number];

export const productPaymentModelValues = ["once", "pack", "sub", "free"] as const;
export type ProductPaymentModel = (typeof productPaymentModelValues)[number];

export const productSubscriptionPeriodValues = ["week", "month", "year"] as const;
export type ProductSubscriptionPeriod = (typeof productSubscriptionPeriodValues)[number];

export const productParticipantModeValues = ["solo", "group", "gift"] as const;
export type ProductParticipantMode = (typeof productParticipantModeValues)[number];

export const productRequiredClientDataValues = [
  "chart1",
  "cities",
  "chart2",
  "question",
  "event"
] as const;
export type ProductRequiredClientData = (typeof productRequiredClientDataValues)[number];

export const productMethodValues = [
  "natal",
  "forecast",
  "synastry",
  "child",
  "numerology",
  "matrix",
  "humandesign"
] as const;
export type ProductMethod = (typeof productMethodValues)[number];

export const productAccessGrantValues = [
  "content",
  "channel",
  "records",
  "course",
  "community",
  "journal"
] as const;
export type ProductAccessGrant = (typeof productAccessGrantValues)[number];

export const productModifierKindValues = ["fixed", "percent", "free"] as const;
export type ProductModifierKind = (typeof productModifierKindValues)[number];

export const productCurrencyValues = ["RUB"] as const;
export type ProductCurrency = (typeof productCurrencyValues)[number];

export type ProductIncludedItemInput = {
  readonly text: string;
  readonly icon: string;
  readonly order: number;
};

export type ProductIncludedItem = ProductIncludedItemInput & {
  readonly id: string;
};

export type ProductModifierInput = {
  readonly label: string;
  readonly priceMinor: number;
  readonly kind: ProductModifierKind;
  readonly isEnabled: boolean;
  readonly createsArtifact: boolean;
  readonly order: number;
};

export type ProductModifier = ProductModifierInput & {
  readonly id: string;
};

export type ProductCoreFields = {
  readonly ownerUserId: string;
  readonly type: ProductType;
  readonly status: ProductStatus;
  readonly title: string;
  readonly subtitle: string | null;
  readonly priceMinor: number;
  readonly currency: ProductCurrency;
  readonly coverMediaId: string | null;
  readonly introVideoUrl: string | null;
  readonly executionMode: ProductExecutionMode;
  readonly paymentModel: ProductPaymentModel;
  readonly durationMinutes: number | null;
  readonly durationLabel: string | null;
  readonly slaLabel: string | null;
  readonly packageSessionCount: number | null;
  readonly packageDiscountPercent: number | null;
  readonly subscriptionPeriod: ProductSubscriptionPeriod | null;
  readonly trialDays: number | null;
  readonly participantMode: ProductParticipantMode;
  readonly groupSize: number | null;
  readonly deliveryFormats: readonly ProductDeliveryFormat[];
  readonly requiredClientData: readonly ProductRequiredClientData[];
  readonly methods: readonly ProductMethod[];
  readonly accessGrants: readonly ProductAccessGrant[];
};

export type Product = ProductCoreFields & {
  readonly id: string;
  readonly includedItems: readonly ProductIncludedItem[];
  readonly modifiers: readonly ProductModifier[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ProductEditableFields = Omit<ProductCoreFields, "ownerUserId" | "status"> & {
  readonly includedItems: readonly ProductIncludedItemInput[];
  readonly modifiers: readonly ProductModifierInput[];
};

export type ProductCreateInput = ProductEditableFields & {
  readonly ownerUserId: string;
};

export type ProductUpdatePatch = Partial<ProductEditableFields>;
