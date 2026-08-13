import type {
  ProductAccessGrant,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductIncludedItemRequest,
  ProductMethod,
  ProductModifierKind,
  ProductParticipantMode,
  ProductPaymentModel,
  ProductRequiredClientData,
  ProductSubscriptionPeriod
} from "@elevenhouse/contracts";
import type { ProductCopy, ProductLocale } from "../../../../features/products/model/productCopy";
import type { ProductConstructorOption } from "../../../../features/products/model/productConstructorOptions";
import type { ProductFormDraft } from "../../../../features/products/model/productDraft";
import type { ProductConstructorController } from "./hooks/useProductConstructorController";

export type ProductConstructorModalCopy = {
  readonly title: string;
  readonly closeLabel: string;
  readonly typeLabel: string;
  readonly titleLabel: string;
  readonly titlePlaceholder: string;
  readonly subtitleLabel: string;
  readonly subtitlePlaceholder: string;
  readonly priceLabel: string;
  readonly durationSuffix: string;
  readonly formatLabel: string;
  readonly paymentModelLabel: string;
  readonly packageSessionCountLabel: string;
  readonly packageDiscountLabel: string;
  readonly subscriptionPeriodLabel: string;
  readonly trialDaysLabel: string;
  readonly participantModeLabel: string;
  readonly groupSizeLabel: string;
  readonly requiredClientDataLabel: string;
  readonly methodsLabel: string;
  readonly accessGrantsLabel: string;
  readonly includedItemsLabel: string;
  readonly includedItemTextLabel: string;
  readonly includedItemPlaceholder: string;
  readonly includedItemIconLabel: string;
  readonly addIncludedItemLabel: string;
  readonly removeIncludedItemLabel: string;
  readonly modifiersLabel: string;
  readonly modifierKindLabel: string;
  readonly modifierFixedLabel: string;
  readonly modifierPercentLabel: string;
  readonly modifierFreeLabel: string;
  readonly modifierLabelLabel: string;
  readonly modifierLabelPlaceholder: string;
  readonly modifierPriceLabel: string;
  readonly addModifierLabel: string;
  readonly removeModifierLabel: string;
  readonly saveDraftLabel: string;
  readonly savingLabel: string;
};

export type ProductConstructorModalProps = {
  readonly copy: ProductConstructorModalCopy;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly draft: ProductFormDraft;
  readonly isSaving: boolean;
  readonly isCoverUploading: boolean;
  readonly coverMediaUrl: string | null;
  readonly error: string | null;
  readonly requiresReload?: boolean;
  readonly coverUploadError: string | null;
  readonly portalTarget?: Element | null;
  readonly backdropClassName?: string;
  readonly onDraftChange: (draft: ProductFormDraft) => void;
  readonly onSave: (
    visibleIncludedItems?: readonly ProductIncludedItemRequest[]
  ) => Promise<void> | void;
  readonly onPublish: (
    visibleIncludedItems?: readonly ProductIncludedItemRequest[]
  ) => Promise<void> | void;
  readonly onCoverFileSelected: (file: File) => Promise<void> | void;
  readonly onCoverRemove: () => void;
  readonly onClose: () => void;
};

export type ProductConstructorSectionProps = {
  readonly copy: ProductConstructorModalCopy;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly draft: ProductFormDraft;
  readonly controller: ProductConstructorController;
  readonly isCoverUploading: boolean;
  readonly coverMediaUrl: string | null;
  readonly coverUploadError: string | null;
  readonly onCoverFileSelected: (file: File) => Promise<void> | void;
  readonly onCoverRemove: () => void;
};

export type ProductConstructorOptionValue =
  | ProductAccessGrant
  | ProductDeliveryFormat
  | ProductExecutionMode
  | ProductMethod
  | ProductModifierKind
  | ProductParticipantMode
  | ProductPaymentModel
  | ProductRequiredClientData
  | ProductSubscriptionPeriod;

export type CopyByValue<TValue extends string> = Record<
  TValue,
  { readonly label: string; readonly description?: string }
>;

export type OptionGroupProps<TValue extends string> = {
  readonly options: readonly ProductConstructorOption<TValue>[];
  readonly copyByValue: CopyByValue<TValue>;
  readonly selectedValue?: TValue;
  readonly selectedValues?: readonly TValue[];
  readonly onSelect?: (value: TValue) => void;
  readonly onToggle?: (value: TValue) => void;
};
