import {
  createProductRequestSchema,
  updateProductRequestSchema,
  type ProductResponse
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  createDefaultProductDraft,
  createProductDraftFromResponse,
  toCreateProductRequest,
  toUpdateProductRequest
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
  coverMediaId: "cover-1",
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

  it("creates edit drafts from product responses without leaking response-only ids into requests", () => {
    const draft = createProductDraftFromResponse(productResponse);
    const updateRequest = toUpdateProductRequest(draft);

    expect(draft.includedItems).toEqual([{ text: "Полный разбор карты", icon: "check", order: 10 }]);
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
      coverMediaId: "cover-1",
      introVideoUrl: "https://video.example/intro"
    });
    expect(JSON.stringify(updateRequest)).not.toContain("33333333-3333-4333-8333-333333333333");
    expect(JSON.stringify(updateRequest)).not.toContain("44444444-4444-4444-8444-444444444444");
  });
});
