import type {
  ProductAccessGrant,
  ProductDeliveryFormat,
  ProductIncludedItemRequest,
  ProductMethod,
  ProductModifierRequest
} from "@elevenhouse/contracts";
import { productAstroDiaryConfigSchema } from "@elevenhouse/contracts/products";
import type { IconName } from "@elevenhouse/design-system/icons/Icon";
import {
  getAccessGrantIconName,
  getDeliveryFormatIconName,
  getMethodIconName,
  getProductPreviewIconName,
  resolveProductIconName
} from "./productIcons";
import type { ProductIconName } from "./productConstructorOptions";
import type { ProductCopy, ProductLocale } from "./productCopy";
import type { ProductFormDraft } from "./productDraft";
import { formatMoneyMinor } from "./productFormatting";

type ProductPreviewCopy = {
  readonly bookLabel: string;
  readonly subscribeLabel: string;
  readonly getLabel: string;
  readonly personalConsultationLabel: string;
  readonly durationSuffix: string;
};

type IncludedItemsCopy = {
  readonly durationSuffix: string;
  readonly includedItemTagFormat: string;
  readonly includedItemTagRecording: string;
  readonly includedItemTagPayment: string;
  readonly includedItemTagAccess: string;
  readonly includedItemTagMethod: string;
  readonly sessionRecordingLabel: string;
  readonly audioRecordingLabel: string;
  readonly packageIncludedLabel: (sessionCount: number, discountPercent: number) => string;
  readonly trialIncludedLabel: (trialDays: number) => string;
  readonly methodIncludedLabels: Record<ProductMethod, string>;
};

type ClientCabinetCopy = {
  readonly watchLabel: string;
  readonly listenLabel: string;
  readonly openLabel: string;
  readonly readLabel: string;
  readonly downloadLabel: string;
  readonly enterLabel: string;
  readonly astrologerNotesLabel: string;
};

type ModifierSuffixCopy = {
  readonly modifierIncludedSuffixLabel: string;
};

type ProductConstructorViewModelCopy = ProductPreviewCopy &
  IncludedItemsCopy &
  ClientCabinetCopy &
  ModifierSuffixCopy;

type DurationSuffixCopy = {
  readonly durationSuffix: string;
};

export type ProductPreviewIncludedItem = {
  readonly text: string;
  readonly icon: IconName;
};

export type ProductPreviewViewModel = {
  readonly categoryLabel: string;
  readonly formatLine: string;
  readonly priceLabel: string;
  readonly actionLabel: string;
  readonly includedItems: readonly ProductPreviewIncludedItem[];
};

export type AutoIncludedItem = ProductIncludedItemRequest & {
  readonly key: string;
  readonly tag: string;
};

export type ClientCabinetArtifact = {
  readonly icon: IconName;
  readonly label: string;
  readonly action: string;
};

export type ProductConstructorViewModel = {
  readonly autoIncludedItems: readonly AutoIncludedItem[];
  readonly visibleIncludedItems: readonly ProductIncludedItemRequest[];
  readonly preview: ProductPreviewViewModel;
  readonly enabledModifiers: readonly ProductModifierRequest[];
  readonly cabinetArtifacts: readonly ClientCabinetArtifact[];
  readonly previewIconName: ProductIconName;
  readonly isProductConfigurationValid: boolean;
};

export function createProductConstructorViewModel({
  draft,
  productCopy,
  locale,
  uiCopy
}: {
  readonly draft: ProductFormDraft;
  readonly productCopy: ProductCopy;
  readonly locale: ProductLocale;
  readonly uiCopy: ProductConstructorViewModelCopy;
}): ProductConstructorViewModel {
  const autoIncludedItems = createAutoIncludedItems(draft, productCopy, uiCopy);
  const visibleIncludedItems = createVisibleIncludedItems(
    draft,
    autoIncludedItems,
    draft.hiddenAutoIncludedKeys
  );

  return {
    autoIncludedItems,
    visibleIncludedItems,
    preview: createProductPreview(draft, productCopy, locale, uiCopy, visibleIncludedItems),
    enabledModifiers: draft.modifiers.filter((modifier) => modifier.isEnabled),
    cabinetArtifacts: createClientCabinetArtifacts(draft, productCopy, uiCopy),
    previewIconName: getProductPreviewIconName(draft),
    isProductConfigurationValid:
      !draft.accessGrants.includes("journal") ||
      productAstroDiaryConfigSchema.safeParse(draft.astroDiaryConfig).success
  };
}

export function createProductPreview(
  draft: ProductFormDraft,
  productCopy: ProductCopy,
  locale: ProductLocale,
  uiCopy: ProductPreviewCopy,
  includedItems: readonly ProductIncludedItemRequest[]
): ProductPreviewViewModel {
  const durationLabel = formatDurationLabel(draft, uiCopy);
  const deliveryLabel = draft.deliveryFormats
    .map((deliveryFormat) => productCopy.deliveryFormats[deliveryFormat].label)
    .join(" + ");
  const formatLine = [
    deliveryLabel,
    draft.executionMode === "async" && draft.slaLabel ? draft.slaLabel : durationLabel
  ]
    .filter(Boolean)
    .join(" · ");
  const priceLabel =
    draft.paymentModel === "free"
      ? uiCopy.getLabel
      : formatMoneyMinor(draft.priceMinor, draft.currency, locale).replace(/\u00A0/g, " ");
  const previewIncludedItems = includedItems.length
    ? includedItems.map((item) => ({
        text: item.text.trim(),
        icon: resolveProductIconName(item.icon)
      }))
    : [
        {
          text: productCopy.types[draft.type].description ?? productCopy.types[draft.type].label,
          icon: "check" as IconName
        }
      ];

  return {
    categoryLabel: getPreviewCategoryLabel(draft, productCopy, uiCopy),
    formatLine,
    priceLabel,
    actionLabel:
      draft.paymentModel === "free"
        ? uiCopy.getLabel
        : draft.paymentModel === "sub"
          ? uiCopy.subscribeLabel
          : uiCopy.bookLabel,
    includedItems: previewIncludedItems
  };
}

export function createAutoIncludedItems(
  draft: ProductFormDraft,
  productCopy: ProductCopy,
  uiCopy: IncludedItemsCopy
): readonly AutoIncludedItem[] {
  const items: AutoIncludedItem[] = [];
  const durationLabel = formatDurationLabel(draft, uiCopy);
  const formatLine = [
    draft.deliveryFormats
      .map((deliveryFormat) => productCopy.deliveryFormats[deliveryFormat].label)
      .join(" + "),
    draft.executionMode === "async" && draft.slaLabel ? draft.slaLabel : durationLabel
  ]
    .filter(Boolean)
    .join(" · ");

  if (formatLine) {
    items.push({
      key: "fmt",
      text: formatLine,
      icon: getDeliveryFormatIconName(draft.deliveryFormats[0]),
      order: 1,
      tag: uiCopy.includedItemTagFormat
    });
  }

  if (draft.deliveryFormats.includes("video") || draft.deliveryFormats.includes("audio")) {
    items.push({
      key: "rec",
      text: draft.deliveryFormats.includes("video")
        ? uiCopy.sessionRecordingLabel
        : uiCopy.audioRecordingLabel,
      icon: "video",
      order: 2,
      tag: uiCopy.includedItemTagRecording
    });
  }

  if (draft.paymentModel === "pack" && draft.packageSessionCount) {
    items.push({
      key: "pack",
      text: uiCopy.packageIncludedLabel(
        draft.packageSessionCount,
        draft.packageDiscountPercent ?? 0
      ),
      icon: "box",
      order: 3,
      tag: uiCopy.includedItemTagPayment
    });
  }

  if (draft.paymentModel === "sub" && draft.trialDays) {
    items.push({
      key: "trial",
      text: uiCopy.trialIncludedLabel(draft.trialDays),
      icon: "sparkle",
      order: 4,
      tag: uiCopy.includedItemTagPayment
    });
  }

  draft.accessGrants.forEach((accessGrant, index) => {
    items.push({
      key: `acc-${accessGrant}`,
      text: productCopy.accessGrants[accessGrant].label,
      icon: getAccessGrantIconName(accessGrant),
      order: 20 + index,
      tag: uiCopy.includedItemTagAccess
    });
  });

  draft.methods.forEach((method, index) => {
    items.push({
      key: `met-${method}`,
      text: uiCopy.methodIncludedLabels[method] ?? productCopy.methods[method].label,
      icon: getMethodIconName(method),
      order: 40 + index,
      tag: uiCopy.includedItemTagMethod
    });
  });

  return items;
}

export function createVisibleIncludedItems(
  draft: ProductFormDraft,
  autoIncludedItems: readonly AutoIncludedItem[],
  hiddenAutoIncludedKeys: readonly string[]
): readonly ProductIncludedItemRequest[] {
  const seen = new Set<string>();

  return [
    ...autoIncludedItems.filter((item) => !hiddenAutoIncludedKeys.includes(item.key)),
    ...draft.includedItems
  ]
    .filter((item) => {
      const text = item.text.trim();

      if (!text || seen.has(text)) {
        return false;
      }

      seen.add(text);
      return true;
    })
    .map(({ text, icon, order }) => ({ text, icon, order }));
}

export function getNextIncludedItemOrder(draft: ProductFormDraft): number {
  return Math.max(0, ...draft.includedItems.map((item) => item.order)) + 10;
}

export function createClientCabinetArtifacts(
  draft: ProductFormDraft,
  productCopy: ProductCopy,
  uiCopy: ClientCabinetCopy
): readonly ClientCabinetArtifact[] {
  const artifacts: ClientCabinetArtifact[] = [];
  const deliveryArtifacts = {
    video: { icon: "video", action: uiCopy.watchLabel },
    audio: { icon: "mic", action: uiCopy.listenLabel },
    chat: { icon: "chat", action: uiCopy.openLabel },
    text: { icon: "content", action: uiCopy.readLabel },
    file: { icon: "fileDown", action: uiCopy.downloadLabel },
    channel: { icon: "globe", action: uiCopy.enterLabel }
  } satisfies Record<ProductDeliveryFormat, { icon: IconName; action: string }>;
  const methodArtifacts = {
    natal: { icon: "orbit", action: uiCopy.openLabel },
    forecast: { icon: "refresh", action: uiCopy.openLabel },
    synastry: { icon: "chat", action: uiCopy.openLabel },
    child: { icon: "verified", action: uiCopy.openLabel },
    numerology: { icon: "content", action: uiCopy.openLabel },
    matrix: { icon: "orbit", action: uiCopy.openLabel },
    humandesign: { icon: "flow", action: uiCopy.openLabel }
  } satisfies Record<ProductMethod, { icon: IconName; action: string }>;
  const accessArtifacts = {
    content: { icon: "content", action: uiCopy.openLabel },
    channel: { icon: "flow", action: uiCopy.enterLabel },
    records: { icon: "video", action: uiCopy.watchLabel },
    course: { icon: "box", action: uiCopy.openLabel },
    community: { icon: "chat", action: uiCopy.enterLabel },
    journal: { icon: "reference", action: uiCopy.openLabel }
  } satisfies Record<ProductAccessGrant, { icon: IconName; action: string }>;

  draft.deliveryFormats.forEach((deliveryFormat) => {
    const artifact = deliveryArtifacts[deliveryFormat];
    artifacts.push({
      icon: artifact.icon,
      label: productCopy.deliveryFormats[deliveryFormat].label,
      action: artifact.action
    });
  });
  draft.methods.forEach((method) => {
    const artifact = methodArtifacts[method];
    artifacts.push({
      icon: artifact.icon,
      label: productCopy.methods[method].label,
      action: artifact.action
    });
  });
  draft.accessGrants.forEach((accessGrant) => {
    const artifact = accessArtifacts[accessGrant];
    artifacts.push({
      icon: artifact.icon,
      label: productCopy.accessGrants[accessGrant].label,
      action: artifact.action
    });
  });
  draft.modifiers.forEach((modifier) => {
    if (modifier.isEnabled && modifier.createsArtifact) {
      artifacts.push({
        icon: "box",
        label: modifier.label,
        action: uiCopy.downloadLabel
      });
    }
  });
  artifacts.push({
    icon: "content",
    label: uiCopy.astrologerNotesLabel,
    action: uiCopy.openLabel
  });

  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    if (seen.has(artifact.label)) return false;
    seen.add(artifact.label);
    return true;
  });
}

export function getPreviewCoverPlaceholder(coverPlaceholder: string): string {
  const previewPlaceholder = coverPlaceholder.replace("Фото / ", "");

  return previewPlaceholder.charAt(0).toLocaleUpperCase("ru-RU") + previewPlaceholder.slice(1);
}

export function formatModifierSuffix(
  modifier: ProductModifierRequest,
  locale: ProductLocale,
  copy: ModifierSuffixCopy
) {
  if (modifier.kind === "free") return copy.modifierIncludedSuffixLabel;
  if (modifier.kind === "percent") return `+${modifier.priceMinor}%`;
  return `+${formatMajorMoney(modifier.priceMinor, locale)} ₽`;
}

export function formatMajorMoney(priceMinor: number, locale: ProductLocale) {
  return Math.round(priceMinor / 100).toLocaleString(locale === "ru" ? "ru-RU" : "en-US");
}

export function formatDurationLabel(
  draft: Pick<ProductFormDraft, "durationLabel" | "durationMinutes">,
  copy: DurationSuffixCopy
) {
  if (draft.durationLabel.trim()) return draft.durationLabel;
  if (draft.durationMinutes) return `${draft.durationMinutes}${copy.durationSuffix}`;
  return "";
}

export function minorToMajorValue(value: number) {
  return String(Math.round(value / 100));
}

export function majorValueToMinor(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) * 100 : 0;
}

export function modifierValueToInputValue(
  modifier: Pick<ProductModifierRequest, "kind" | "priceMinor">
) {
  if (modifier.kind === "percent") return String(modifier.priceMinor);
  return minorToMajorValue(modifier.priceMinor);
}

export function modifierInputValueToStoredValue(
  kind: ProductModifierRequest["kind"],
  value: string
) {
  if (kind === "percent") return percentValueFromInput(value);
  return majorValueToMinor(value);
}

function percentValueFromInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Math.min(Number(digits), 100) : 0;
}

function getPreviewCategoryLabel(
  draft: ProductFormDraft,
  productCopy: ProductCopy,
  uiCopy: ProductPreviewCopy
) {
  if (draft.paymentModel === "sub") return productCopy.paymentModels.sub.label;
  if (draft.paymentModel === "free") return productCopy.paymentModels.free.label;
  if (draft.participantMode === "group") return productCopy.participantModes.group.label;
  if (draft.participantMode === "gift") return productCopy.participantModes.gift.label;
  if (draft.executionMode === "live") return uiCopy.personalConsultationLabel;
  return productCopy.types[draft.type].label;
}
