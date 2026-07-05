import {
  createProductRequestSchema,
  productTypeSchema,
  updateProductRequestSchema,
  type ProductResponse
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { productIconNames } from "./productConstructorOptions";
import {
  addProductIncludedItem,
  addProductModifier,
  applyProductDraftPatch,
  createDefaultProductDraft,
  createProductDraftFromResponse,
  moveProductIncludedItem,
  removeProductIncludedItem,
  removeProductModifier,
  toggleProductDraftArrayValue,
  toCreateProductRequest,
  toUpdateProductRequest,
  updateProductIncludedItem,
  updateProductModifier,
  type ProductFormDraft
} from "./productDraft";

const productResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  type: "single",
  status: "draft",
  title: "Натальный разбор",
  subtitle: "Полный разбор карты",
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: "55555555-5555-4555-8555-555555555555",
  coverMedia: {
    id: "55555555-5555-4555-8555-555555555555",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    purpose: "product_cover",
    status: "ready",
    visibility: "public",
    originalFileName: "cover.webp",
    mimeType: "image/webp",
    sizeBytes: 128000,
    width: 1600,
    height: 900,
    altText: null,
    url: "https://cdn.example/product-cover.webp",
    variants: [],
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z"
  },
  introVideoUrl: "https://video.example/intro",
  executionMode: "live",
  paymentModel: "once",
  durationMinutes: 60,
  durationLabel: "60 мин",
  slaLabel: null,
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
    {
      id: "33333333-3333-4333-8333-333333333333",
      text: "Полный разбор карты",
      icon: "check",
      order: 10
    }
  ],
  modifiers: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      label: "PDF-карта / резюме",
      priceMinor: 99000,
      kind: "fixed",
      isEnabled: true,
      createsArtifact: true,
      order: 10
    }
  ],
  analytics: {
    salesCount: 0,
    grossRevenueMinor: 0,
    currency: "RUB",
    averageRating: null,
    reviewsCount: 0
  },
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z"
} satisfies ProductResponse;

describe("product draft helpers", () => {
  it("creates contract-valid defaults after the title is provided", () => {
    const request = toCreateProductRequest({
      ...createDefaultProductDraft("single"),
      title: " Натальный разбор "
    });

    expect(createProductRequestSchema.parse(request)).toMatchObject({
      type: "single",
      title: "Натальный разбор",
      paymentModel: "once",
      executionMode: "live",
      durationMinutes: 60,
      deliveryFormats: ["video"],
      requiredClientData: ["chart1"],
      methods: ["natal"]
    });
  });

  it("creates package and subscription defaults that satisfy product-specific contract rules", () => {
    expect(
      toCreateProductRequest({
        ...createDefaultProductDraft("pack"),
        title: "Пакет консультаций"
      })
    ).toMatchObject({
      paymentModel: "pack",
      packageSessionCount: 3,
      packageDiscountPercent: 15
    });

    expect(
      toCreateProductRequest({
        ...createDefaultProductDraft("sub"),
        title: "Лунный круг"
      })
    ).toMatchObject({
      paymentModel: "sub",
      subscriptionPeriod: "month",
      deliveryFormats: ["channel"],
      accessGrants: ["channel"]
    });
  });

  it("normalizes free and group draft settings before contract validation", () => {
    const request = toCreateProductRequest({
      ...createDefaultProductDraft("custom"),
      title: "Лид-магнит",
      priceMinor: 490000,
      paymentModel: "free",
      participantMode: "group",
      groupSize: 12
    });

    expect(request).toMatchObject({
      priceMinor: 0,
      paymentModel: "free",
      participantMode: "group",
      groupSize: 12
    });
    expect(createProductRequestSchema.parse(request)).toEqual(request);
  });

  it("materializes UI-selected modes that have visible default controls", () => {
    const baseDraft = createDefaultProductDraft("custom");
    const packageDraft = applyProductDraftPatch(baseDraft, { paymentModel: "pack" });
    const subscriptionDraft = applyProductDraftPatch(baseDraft, { paymentModel: "sub" });
    const groupDraft = applyProductDraftPatch(baseDraft, { participantMode: "group" });

    expect(toCreateProductRequest({ ...packageDraft, title: "Пакет" })).toMatchObject({
      paymentModel: "pack",
      packageSessionCount: 1,
      packageDiscountPercent: 0
    });
    expect(toCreateProductRequest({ ...subscriptionDraft, title: "Подписка" })).toMatchObject({
      paymentModel: "sub",
      subscriptionPeriod: "month",
      trialDays: 0
    });
    expect(toCreateProductRequest({ ...groupDraft, title: "Группа" })).toMatchObject({
      participantMode: "group",
      groupSize: 2
    });
  });

  it("creates edit drafts from product responses without leaking response-only ids into requests", () => {
    const draft = createProductDraftFromResponse(productResponse);
    const updateRequest = toUpdateProductRequest(draft);

    expect(draft.includedItems).toEqual([
      { text: "Полный разбор карты", icon: "check", order: 10 }
    ]);
    expect(draft.modifiers).toEqual([
      {
        label: "PDF-карта / резюме",
        priceMinor: 99000,
        kind: "fixed",
        isEnabled: true,
        createsArtifact: true,
        order: 10
      }
    ]);
    expect(updateProductRequestSchema.parse(updateRequest)).toMatchObject({
      title: "Натальный разбор",
      subtitle: "Полный разбор карты",
      coverMediaId: "55555555-5555-4555-8555-555555555555",
      introVideoUrl: "https://video.example/intro"
    });
    expect(JSON.stringify(updateRequest)).not.toContain("33333333-3333-4333-8333-333333333333");
    expect(JSON.stringify(updateRequest)).not.toContain("44444444-4444-4444-8444-444444444444");
  });

  it("toggles array values without duplicates", () => {
    const draft = createDefaultProductDraft("single");

    expect(toggleProductDraftArrayValue(draft, "deliveryFormats", "audio").deliveryFormats).toEqual(
      ["video", "audio"]
    );
    expect(toggleProductDraftArrayValue(draft, "deliveryFormats", "video").deliveryFormats).toEqual(
      []
    );
    expect(
      toggleProductDraftArrayValue(draft, "requiredClientData", "question").requiredClientData
    ).toEqual(["chart1", "question"]);
    expect(toggleProductDraftArrayValue(draft, "methods", "forecast").methods).toEqual([
      "natal",
      "forecast"
    ]);
    expect(toggleProductDraftArrayValue(draft, "accessGrants", "course").accessGrants).toEqual([
      "course"
    ]);
  });

  it("uses valid constructor icon names for all default included items", () => {
    const availableIconNames: readonly string[] = productIconNames;
    const defaultIncludedItemIcons = productTypeSchema.options.flatMap((type) =>
      createDefaultProductDraft(type).includedItems.map((item) => item.icon)
    );

    expect(defaultIncludedItemIcons.filter((icon) => !availableIconNames.includes(icon))).toEqual(
      []
    );
  });

  it("adds, updates and removes included items", () => {
    const draft = createDefaultProductDraft("custom");
    const withItem = addProductIncludedItem(draft);
    const lastIndex = withItem.includedItems.length - 1;

    expect(withItem.includedItems[lastIndex]).toEqual({
      text: "",
      icon: "check",
      order: (lastIndex + 1) * 10
    });

    const updated = updateProductIncludedItem(withItem, lastIndex, {
      text: "Персональная карта",
      icon: "orbit"
    });
    expect(updated.includedItems[lastIndex]).toMatchObject({
      text: "Персональная карта",
      icon: "orbit"
    });

    expect(removeProductIncludedItem(updated, lastIndex).includedItems).toHaveLength(lastIndex);
  });

  it("adds included items after the highest existing order", () => {
    const draft = createDefaultProductDraft("pack");
    const withoutMiddleItem = removeProductIncludedItem(draft, 1);

    expect(addProductIncludedItem(withoutMiddleItem).includedItems.at(-1)?.order).toBe(40);
  });

  it("reorders included items and normalizes their persisted order", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      includedItems: [
        { text: "Первый", icon: "check", order: 10 },
        { text: "Второй", icon: "star", order: 20 },
        { text: "Третий", icon: "video", order: 30 }
      ]
    };

    const movedUp = moveProductIncludedItem(draft, 2, -1);
    const movedPastStart = moveProductIncludedItem(movedUp, 0, -1);

    expect(movedUp.includedItems.map((item) => item.text)).toEqual(["Первый", "Третий", "Второй"]);
    expect(movedUp.includedItems.map((item) => item.order)).toEqual([10, 20, 30]);
    expect(movedPastStart.includedItems.map((item) => item.text)).toEqual([
      "Первый",
      "Третий",
      "Второй"
    ]);
  });

  it("adds, updates and removes product modifiers", () => {
    const draft = createDefaultProductDraft("single");
    const withModifier = addProductModifier(draft);

    expect(withModifier.modifiers[0]).toEqual({
      label: "",
      priceMinor: 0,
      kind: "fixed",
      isEnabled: true,
      createsArtifact: false,
      order: 10
    });

    const updated = updateProductModifier(withModifier, 0, {
      label: "PDF-резюме",
      priceMinor: 99000,
      createsArtifact: true
    });
    expect(updated.modifiers[0]).toMatchObject({
      label: "PDF-резюме",
      priceMinor: 99000,
      createsArtifact: true
    });

    expect(removeProductModifier(updated, 0).modifiers).toEqual([]);
  });

  it("normalizes modifier values when switching kind", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      modifiers: [
        {
          label: "Срочность",
          priceMinor: 90000,
          kind: "fixed" as const,
          isEnabled: true,
          createsArtifact: false,
          order: 10
        }
      ]
    };

    expect(updateProductModifier(draft, 0, { kind: "percent" }).modifiers[0]).toMatchObject({
      kind: "percent",
      priceMinor: 0
    });

    expect(updateProductModifier(draft, 0, { kind: "free" }).modifiers[0]).toMatchObject({
      kind: "free",
      priceMinor: 0
    });
  });

  it("adds product modifiers after the highest existing order", () => {
    const modifiers = [
      {
        label: "First",
        priceMinor: 1000,
        kind: "fixed",
        isEnabled: true,
        createsArtifact: false,
        order: 10
      },
      {
        label: "Second",
        priceMinor: 2000,
        kind: "fixed",
        isEnabled: true,
        createsArtifact: false,
        order: 20
      },
      {
        label: "Third",
        priceMinor: 3000,
        kind: "fixed",
        isEnabled: true,
        createsArtifact: false,
        order: 30
      }
    ] satisfies ProductFormDraft["modifiers"];
    const draft = {
      ...createDefaultProductDraft("single"),
      modifiers
    };
    const withoutMiddleModifier = removeProductModifier(draft, 1);

    expect(addProductModifier(withoutMiddleModifier).modifiers.at(-1)?.order).toBe(40);
  });
});
