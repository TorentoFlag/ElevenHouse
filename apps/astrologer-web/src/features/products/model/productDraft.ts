import {
  createProductRequestSchema,
  updateProductRequestSchema,
  type CreateProductRequest,
  type ProductAccessGrant,
  type ProductCurrency,
  type ProductDeliveryFormat,
  type ProductExecutionMode,
  type ProductIncludedItemRequest,
  type ProductMethod,
  type ProductModifierRequest,
  type ProductParticipantMode,
  type ProductPaymentModel,
  type ProductRequiredClientData,
  type ProductResponse,
  type ProductSubscriptionPeriod,
  type ProductType,
  type UpdateProductRequest
} from "@elevenhouse/contracts/products";

export type ProductFormDraft = {
  readonly type: ProductType;
  readonly title: string;
  readonly subtitle: string;
  readonly priceMinor: number;
  readonly currency: ProductCurrency;
  readonly coverMediaId: string;
  readonly introVideoUrl: string;
  readonly executionMode: ProductExecutionMode;
  readonly paymentModel: ProductPaymentModel;
  readonly durationMinutes: number | null;
  readonly durationLabel: string;
  readonly slaLabel: string;
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
  readonly includedItems: readonly ProductIncludedItemRequest[];
  readonly modifiers: readonly ProductModifierRequest[];
};

export function createDefaultProductDraft(type: ProductType): ProductFormDraft {
  const base: ProductFormDraft = {
    type,
    title: "",
    subtitle: "",
    priceMinor: 490000,
    currency: "RUB",
    coverMediaId: "",
    introVideoUrl: "",
    executionMode: "live",
    paymentModel: "once",
    durationMinutes: 60,
    durationLabel: "60 мин",
    slaLabel: "",
    packageSessionCount: null,
    packageDiscountPercent: null,
    subscriptionPeriod: null,
    trialDays: null,
    participantMode: "solo",
    groupSize: null,
    deliveryFormats: ["video"],
    requiredClientData: ["chart1"],
    methods: ["natal"],
    accessGrants: [],
    includedItems: [
      { text: "Полный разбор карты", icon: "check", order: 10 },
      { text: "Запись сессии", icon: "video", order: 20 }
    ],
    modifiers: []
  };

  if (type === "pack") {
    return {
      ...base,
      priceMinor: 1260000,
      paymentModel: "pack",
      packageSessionCount: 3,
      packageDiscountPercent: 15,
      durationLabel: "3 × 60 мин",
      includedItems: [
        { text: "3 сессии со скидкой 15%", icon: "check", order: 10 },
        { text: "Срок действия 6 мес", icon: "check", order: 20 },
        { text: "Сопровождение в чате", icon: "chat", order: 30 }
      ]
    };
  }

  if (type === "sub") {
    return {
      ...base,
      priceMinor: 99000,
      executionMode: "async",
      paymentModel: "sub",
      durationMinutes: null,
      durationLabel: "",
      subscriptionPeriod: "month",
      deliveryFormats: ["channel"],
      requiredClientData: ["question"],
      methods: [],
      accessGrants: ["channel"],
      includedItems: [
        { text: "Закрытый канал", icon: "flow", order: 10 },
        { text: "Лунный прогноз", icon: "check", order: 20 },
        { text: "Ежемесячный Q&A-эфир", icon: "video", order: 30 }
      ]
    };
  }

  if (type === "async") {
    return {
      ...base,
      priceMinor: 290000,
      executionMode: "async",
      durationMinutes: null,
      durationLabel: "20–30 мин",
      slaLabel: "3 дня",
      deliveryFormats: ["video", "file"],
      includedItems: [
        { text: "Асинхронно, без созвона", icon: "check", order: 10 },
        { text: "Видео 20–30 мин", icon: "video", order: 20 },
        { text: "Ответы на 3 вопроса", icon: "chat", order: 30 }
      ]
    };
  }

  if (type === "mini") {
    return {
      ...base,
      priceMinor: 160000,
      executionMode: "instant",
      durationMinutes: null,
      durationLabel: "24 ч",
      deliveryFormats: ["chat"],
      requiredClientData: ["question"],
      includedItems: [
        { text: "1 вопрос — 1 ответ", icon: "chat", order: 10 },
        { text: "До 10 сообщений", icon: "check", order: 20 },
        { text: "Ответ в течение суток", icon: "refresh", order: 30 }
      ]
    };
  }

  if (type === "course") {
    return {
      ...base,
      priceMinor: 1800000,
      durationMinutes: null,
      durationLabel: "8 модулей",
      deliveryFormats: ["video", "file"],
      requiredClientData: ["question"],
      methods: [],
      accessGrants: ["course"],
      includedItems: [
        { text: "24 урока + практика", icon: "video", order: 10 },
        { text: "Проверка домашних", icon: "check", order: 20 },
        { text: "Доступ навсегда", icon: "box", order: 30 }
      ]
    };
  }

  if (type === "custom") {
    return {
      ...base,
      title: "Астрокартография · где жить",
      subtitle: "Где вам будет лучше — по карте мест",
      priceMinor: 790000,
      requiredClientData: ["chart1", "cities"],
      includedItems: [
        { text: "Анализ карты по городам", icon: "map", order: 10 },
        { text: "Лучшие места для карьеры и любви", icon: "star", order: 20 }
      ],
      modifiers: createDefaultProductModifiers()
    };
  }

  return base;
}

function createDefaultProductModifiers(): readonly ProductModifierRequest[] {
  return [
    {
      label: "PDF-карта / резюме",
      priceMinor: 99000,
      kind: "fixed",
      isEnabled: true,
      createsArtifact: true,
      order: 10
    },
    {
      label: "Срочно — за 24 часа",
      priceMinor: 150000,
      kind: "fixed",
      isEnabled: true,
      createsArtifact: false,
      order: 20
    },
    {
      label: "Доп. вопрос к разбору",
      priceMinor: 50000,
      kind: "fixed",
      isEnabled: false,
      createsArtifact: false,
      order: 30
    },
    {
      label: "Подарочный сертификат",
      priceMinor: 0,
      kind: "free",
      isEnabled: false,
      createsArtifact: true,
      order: 40
    }
  ];
}

export function createProductDraftFromResponse(product: ProductResponse): ProductFormDraft {
  return {
    type: product.type,
    title: product.title,
    subtitle: product.subtitle ?? "",
    priceMinor: product.priceMinor,
    currency: product.currency,
    coverMediaId: product.coverMediaId ?? "",
    introVideoUrl: product.introVideoUrl ?? "",
    executionMode: product.executionMode,
    paymentModel: product.paymentModel,
    durationMinutes: product.durationMinutes,
    durationLabel: product.durationLabel ?? "",
    slaLabel: product.slaLabel ?? "",
    packageSessionCount: product.packageSessionCount,
    packageDiscountPercent: product.packageDiscountPercent,
    subscriptionPeriod: product.subscriptionPeriod,
    trialDays: product.trialDays,
    participantMode: product.participantMode,
    groupSize: product.groupSize,
    deliveryFormats: [...product.deliveryFormats],
    requiredClientData: [...product.requiredClientData],
    methods: [...product.methods],
    accessGrants: [...product.accessGrants],
    includedItems: product.includedItems.map(({ text, icon, order }) => ({ text, icon, order })),
    modifiers: product.modifiers.map(
      ({ label, priceMinor, kind, isEnabled, createsArtifact, order }) => ({
        label,
        priceMinor,
        kind,
        isEnabled,
        createsArtifact,
        order
      })
    )
  };
}

export type ProductDraftArrayKey =
  | "deliveryFormats"
  | "requiredClientData"
  | "methods"
  | "accessGrants";

export type ProductDraftArrayValue<TKey extends ProductDraftArrayKey> =
  ProductFormDraft[TKey] extends readonly (infer TValue)[] ? TValue : never;

export function toggleProductDraftArrayValue<TKey extends ProductDraftArrayKey>(
  draft: ProductFormDraft,
  key: TKey,
  value: ProductDraftArrayValue<TKey>
): ProductFormDraft {
  const current = draft[key] as readonly ProductDraftArrayValue<TKey>[];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];

  return {
    ...draft,
    [key]: next
  };
}

export function applyProductDraftPatch(
  draft: ProductFormDraft,
  patch: Partial<ProductFormDraft>
): ProductFormDraft {
  const next = { ...draft, ...patch };

  if (patch.paymentModel === "pack") {
    return {
      ...next,
      packageSessionCount: next.packageSessionCount ?? 1,
      packageDiscountPercent: next.packageDiscountPercent ?? 0
    };
  }

  if (patch.paymentModel === "sub") {
    return {
      ...next,
      subscriptionPeriod: next.subscriptionPeriod ?? "month",
      trialDays: next.trialDays ?? 0
    };
  }

  if (patch.paymentModel === "free") {
    return {
      ...next,
      priceMinor: 0
    };
  }

  if (patch.participantMode === "group") {
    return {
      ...next,
      groupSize: next.groupSize ?? 2
    };
  }

  return next;
}

export function addProductIncludedItem(draft: ProductFormDraft): ProductFormDraft {
  return {
    ...draft,
    includedItems: [
      ...draft.includedItems,
      {
        text: "",
        icon: "check",
        order: getNextOrder(draft.includedItems)
      }
    ]
  };
}

export function updateProductIncludedItem(
  draft: ProductFormDraft,
  index: number,
  patch: Partial<ProductIncludedItemRequest>
): ProductFormDraft {
  return {
    ...draft,
    includedItems: draft.includedItems.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    )
  };
}

export function removeProductIncludedItem(
  draft: ProductFormDraft,
  index: number
): ProductFormDraft {
  return {
    ...draft,
    includedItems: draft.includedItems.filter((_, itemIndex) => itemIndex !== index)
  };
}

export function addProductModifier(draft: ProductFormDraft): ProductFormDraft {
  return {
    ...draft,
    modifiers: [
      ...draft.modifiers,
      {
        label: "",
        priceMinor: 0,
        kind: "fixed",
        isEnabled: true,
        createsArtifact: false,
        order: getNextOrder(draft.modifiers)
      }
    ]
  };
}

export function updateProductModifier(
  draft: ProductFormDraft,
  index: number,
  patch: Partial<ProductModifierRequest>
): ProductFormDraft {
  return {
    ...draft,
    modifiers: draft.modifiers.map((modifier, modifierIndex) =>
      modifierIndex === index
        ? normalizeProductModifier({ ...modifier, ...patch }, modifier, patch)
        : modifier
    )
  };
}

export function removeProductModifier(draft: ProductFormDraft, index: number): ProductFormDraft {
  return {
    ...draft,
    modifiers: draft.modifiers.filter((_, modifierIndex) => modifierIndex !== index)
  };
}

function getNextOrder(items: readonly { readonly order: number }[]): number {
  return Math.max(0, ...items.map((item) => item.order)) + 10;
}

function normalizeProductModifier(
  modifier: ProductModifierRequest,
  previousModifier: ProductModifierRequest,
  patch: Partial<ProductModifierRequest>
): ProductModifierRequest {
  const kindChanged = patch.kind !== undefined && patch.kind !== previousModifier.kind;

  if (modifier.kind === "free") {
    return { ...modifier, priceMinor: 0 };
  }

  if (modifier.kind === "percent") {
    const nextPercent = kindChanged && patch.priceMinor === undefined ? 0 : modifier.priceMinor;
    return { ...modifier, priceMinor: clampPercentModifierValue(nextPercent) };
  }

  if (kindChanged && patch.priceMinor === undefined) {
    return { ...modifier, priceMinor: 0 };
  }

  return modifier;
}

function clampPercentModifierValue(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function toCreateProductRequest(draft: ProductFormDraft): CreateProductRequest {
  return createProductRequestSchema.parse(toPayload(draft, "create"));
}

export function toUpdateProductRequest(draft: ProductFormDraft): UpdateProductRequest {
  return updateProductRequestSchema.parse(toPayload(draft, "update"));
}

function toPayload(draft: ProductFormDraft, mode: "create" | "update") {
  const nullable = mode === "update";
  const paymentModel = draft.paymentModel;
  const participantMode = draft.participantMode;

  return {
    type: draft.type,
    title: draft.title.trim(),
    subtitle: normalizeOptionalString(draft.subtitle, nullable),
    priceMinor: paymentModel === "free" ? 0 : draft.priceMinor,
    currency: draft.currency,
    coverMediaId: normalizeOptionalString(draft.coverMediaId, nullable),
    introVideoUrl: normalizeOptionalString(draft.introVideoUrl, nullable),
    executionMode: draft.executionMode,
    paymentModel,
    durationMinutes: normalizeOptionalNumber(draft.durationMinutes, nullable),
    durationLabel: normalizeOptionalString(draft.durationLabel, nullable),
    slaLabel: normalizeOptionalString(draft.slaLabel, nullable),
    packageSessionCount:
      paymentModel === "pack"
        ? normalizeOptionalNumber(draft.packageSessionCount, nullable)
        : nullOrUndefined(nullable),
    packageDiscountPercent:
      paymentModel === "pack"
        ? normalizeOptionalNumber(draft.packageDiscountPercent, nullable)
        : nullOrUndefined(nullable),
    subscriptionPeriod:
      paymentModel === "sub" ? draft.subscriptionPeriod : nullOrUndefined(nullable),
    trialDays:
      paymentModel === "sub"
        ? normalizeOptionalNumber(draft.trialDays, nullable)
        : nullOrUndefined(nullable),
    participantMode,
    groupSize:
      participantMode === "group"
        ? normalizeOptionalNumber(draft.groupSize, nullable)
        : nullOrUndefined(nullable),
    deliveryFormats: [...draft.deliveryFormats],
    requiredClientData: [...draft.requiredClientData],
    methods: [...draft.methods],
    accessGrants: [...draft.accessGrants],
    includedItems: draft.includedItems.map((item, index) => ({
      text: item.text.trim(),
      icon: item.icon.trim(),
      order: item.order || (index + 1) * 10
    })),
    modifiers: draft.modifiers.map((modifier, index) => ({
      label: modifier.label.trim(),
      priceMinor: modifier.kind === "free" ? 0 : modifier.priceMinor,
      kind: modifier.kind,
      isEnabled: modifier.isEnabled,
      createsArtifact: modifier.createsArtifact,
      order: modifier.order || (index + 1) * 10
    }))
  };
}

function normalizeOptionalString(value: string, nullable: boolean) {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return nullOrUndefined(nullable);
}

function normalizeOptionalNumber(value: number | null, nullable: boolean) {
  return value ?? nullOrUndefined(nullable);
}

function nullOrUndefined(nullable: boolean) {
  return nullable ? null : undefined;
}
