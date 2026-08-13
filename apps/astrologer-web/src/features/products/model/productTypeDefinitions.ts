import type {
  ProductExecutionMode,
  ProductPaymentModel,
  ProductType
} from "@elevenhouse/contracts/products";

export const productScenarioSectionIds = [
  "media",
  "basics",
  "format",
  "execution",
  "payment",
  "duration",
  "participants",
  "consultation",
  "package",
  "asyncResult",
  "subscription",
  "mini",
  "course",
  "methods",
  "clientData",
  "accessGrants",
  "astroDiary",
  "modifiers",
  "includedItems"
] as const;

export type ProductScenarioSectionId = (typeof productScenarioSectionIds)[number];

export type ProductDraftRequiredField =
  | "title"
  | "priceMinor"
  | "durationLabel"
  | "slaLabel"
  | "packageSessionCount"
  | "subscriptionPeriod"
  | "deliveryFormats"
  | "requiredClientData"
  | "methods"
  | "accessGrants"
  | "includedItems";

export type ProductTypeDefinition = {
  readonly type: ProductType;
  readonly mode: "guided" | "full";
  readonly primarySections: readonly ProductScenarioSectionId[];
  readonly advancedSections: readonly ProductScenarioSectionId[];
  readonly fixedPaymentModel: ProductPaymentModel | null;
  readonly fixedExecutionMode: ProductExecutionMode | null;
  readonly requiredDraftFields: readonly ProductDraftRequiredField[];
};

const productTypeDefinitions = {
  single: {
    type: "single",
    mode: "guided",
    primarySections: [
      "media",
      "basics",
      "consultation",
      "clientData",
      "methods",
      "modifiers",
      "includedItems"
    ],
    advancedSections: ["participants", "accessGrants"],
    fixedPaymentModel: "once",
    fixedExecutionMode: "live",
    requiredDraftFields: [
      "title",
      "priceMinor",
      "durationLabel",
      "deliveryFormats",
      "requiredClientData"
    ]
  },
  pack: {
    type: "pack",
    mode: "guided",
    primarySections: ["media", "basics", "package", "clientData", "methods", "includedItems"],
    advancedSections: ["participants", "accessGrants", "modifiers"],
    fixedPaymentModel: "pack",
    fixedExecutionMode: "live",
    requiredDraftFields: ["title", "priceMinor", "packageSessionCount", "durationLabel"]
  },
  async: {
    type: "async",
    mode: "guided",
    primarySections: ["media", "basics", "asyncResult", "clientData", "methods", "includedItems"],
    advancedSections: ["accessGrants", "modifiers"],
    fixedPaymentModel: "once",
    fixedExecutionMode: "async",
    requiredDraftFields: [
      "title",
      "priceMinor",
      "slaLabel",
      "deliveryFormats",
      "requiredClientData"
    ]
  },
  sub: {
    type: "sub",
    mode: "guided",
    primarySections: [
      "media",
      "basics",
      "subscription",
      "accessGrants",
      "astroDiary",
      "includedItems"
    ],
    advancedSections: ["format", "clientData", "modifiers"],
    fixedPaymentModel: "sub",
    fixedExecutionMode: "async",
    requiredDraftFields: ["title", "priceMinor", "subscriptionPeriod", "accessGrants"]
  },
  mini: {
    type: "mini",
    mode: "guided",
    primarySections: ["media", "basics", "mini", "includedItems"],
    advancedSections: ["methods", "modifiers"],
    fixedPaymentModel: "once",
    fixedExecutionMode: "instant",
    requiredDraftFields: [
      "title",
      "priceMinor",
      "durationLabel",
      "deliveryFormats",
      "requiredClientData"
    ]
  },
  course: {
    type: "course",
    mode: "guided",
    primarySections: ["media", "basics", "course", "accessGrants", "includedItems"],
    advancedSections: ["format", "clientData", "modifiers"],
    fixedPaymentModel: "once",
    fixedExecutionMode: "async",
    requiredDraftFields: ["title", "priceMinor", "durationLabel", "accessGrants"]
  },
  custom: {
    type: "custom",
    mode: "full",
    primarySections: productScenarioSectionIds,
    advancedSections: [],
    fixedPaymentModel: null,
    fixedExecutionMode: null,
    requiredDraftFields: ["title", "priceMinor", "deliveryFormats"]
  }
} satisfies Record<ProductType, ProductTypeDefinition>;

export function getProductTypeDefinition(type: ProductType): ProductTypeDefinition {
  return productTypeDefinitions[type];
}

export function isProductScenarioSectionVisible(
  type: ProductType,
  section: ProductScenarioSectionId
): boolean {
  const definition = getProductTypeDefinition(type);

  return (
    definition.primarySections.includes(section) || definition.advancedSections.includes(section)
  );
}
