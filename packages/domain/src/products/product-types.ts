import {
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
  productTypeValues,
  type ProductAccessGrantValue,
  type ProductCurrencyValue,
  type ProductDeliveryFormatValue,
  type ProductExecutionModeValue,
  type ProductMethodValue,
  type ProductModifierKindValue,
  type ProductParticipantModeValue,
  type ProductPaymentModelValue,
  type ProductRequiredClientDataValue,
  type ProductStatusValue,
  type ProductSubscriptionPeriodValue,
  type ProductTypeValue
} from "@elevenhouse/validation/products";

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
};

export type ProductStatus = ProductStatusValue;
export type ProductStatusFilter = ProductStatus | "all";

export type ProductType = ProductTypeValue;
export type ProductDeliveryFormat = ProductDeliveryFormatValue;
export type ProductExecutionMode = ProductExecutionModeValue;
export type ProductPaymentModel = ProductPaymentModelValue;
export type ProductSubscriptionPeriod = ProductSubscriptionPeriodValue;
export type ProductParticipantMode = ProductParticipantModeValue;
export type ProductRequiredClientData = ProductRequiredClientDataValue;
export type ProductMethod = ProductMethodValue;
export type ProductAccessGrant = ProductAccessGrantValue;
export type ProductModifierKind = ProductModifierKindValue;
export type ProductCurrency = ProductCurrencyValue;

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
