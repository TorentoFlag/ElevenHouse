import { describe, expect, it } from "vitest";
import {
  createProductRequestSchema,
  listProductsQuerySchema,
  productResponseSchema,
  updateProductRequestSchema
} from "./products";

const validProductRequest = {
  type: "single",
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
  slaLabel: undefined,
  packageSessionCount: undefined,
  packageDiscountPercent: undefined,
  subscriptionPeriod: undefined,
  trialDays: undefined,
  participantMode: "solo",
  groupSize: undefined,
  deliveryFormats: ["video"],
  requiredClientData: ["chart1"],
  methods: ["natal"],
  accessGrants: [],
  includedItems: [
    { text: "Полный разбор карты", icon: "check", order: 10 },
    { text: "Запись сессии", icon: "play", order: 20 }
  ],
  modifiers: [
    {
      label: "PDF-карта / резюме",
      priceMinor: 99000,
      kind: "fixed",
      isEnabled: true,
      createsArtifact: true,
      order: 10
    }
  ]
} as const;

describe("product contracts", () => {
  it("accepts a valid create request", () => {
    expect(createProductRequestSchema.parse(validProductRequest)).toMatchObject({
      title: "Натальный разбор",
      priceMinor: 490000,
      status: "draft"
    });
  });

  it("rejects negative money", () => {
    expect(() =>
      createProductRequestSchema.parse({ ...validProductRequest, priceMinor: -1 })
    ).toThrow();
  });

  it("rejects invalid currency", () => {
    expect(() =>
      createProductRequestSchema.parse({ ...validProductRequest, currency: "USD" })
    ).toThrow();
  });

  it("rejects overlong optional strings and malformed video URLs", () => {
    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        subtitle: "x".repeat(501)
      })
    ).toThrow();

    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        introVideoUrl: "not-a-url"
      })
    ).toThrow();
  });

  it("requires package settings for package payment model", () => {
    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        paymentModel: "pack",
        packageSessionCount: undefined
      })
    ).toThrow();

    expect(
      createProductRequestSchema.parse({
        ...validProductRequest,
        paymentModel: "pack",
        packageSessionCount: 3,
        packageDiscountPercent: 15
      }).packageSessionCount
    ).toBe(3);
  });

  it("requires subscription period for subscriptions", () => {
    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        paymentModel: "sub",
        subscriptionPeriod: undefined
      })
    ).toThrow();
  });

  it("requires group size for group products", () => {
    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        participantMode: "group",
        groupSize: undefined
      })
    ).toThrow();
  });

  it("requires zero prices for free products and modifiers", () => {
    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        paymentModel: "free",
        priceMinor: 1
      })
    ).toThrow();

    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        modifiers: [
          {
            label: "Бонус",
            priceMinor: 1,
            kind: "free",
            isEnabled: true,
            createsArtifact: false,
            order: 10
          }
        ]
      })
    ).toThrow();
  });

  it("parses list filters with defaults", () => {
    expect(listProductsQuerySchema.parse({})).toEqual({
      status: "all",
      limit: 50,
      offset: 0
    });
  });

  it("accepts response analytics shape before real source modules exist", () => {
    expect(
      productResponseSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        status: "draft",
        ...validProductRequest,
        subtitle: "Полный разбор карты",
        slaLabel: null,
        packageSessionCount: null,
        packageDiscountPercent: null,
        subscriptionPeriod: null,
        trialDays: null,
        groupSize: null,
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
      })
    ).toMatchObject({
      analytics: {
        salesCount: 0,
        averageRating: null
      }
    });
  });

  it("accepts partial update requests", () => {
    expect(updateProductRequestSchema.parse({ title: "Синастрия" })).toEqual({
      title: "Синастрия"
    });
  });

  it("does not require paired fields in partial updates", () => {
    expect(updateProductRequestSchema.parse({ paymentModel: "pack" })).toEqual({
      paymentModel: "pack"
    });
    expect(updateProductRequestSchema.parse({ participantMode: "group" })).toEqual({
      participantMode: "group"
    });
  });

  it("requires normalized nullable duration in product responses", () => {
    expect(() =>
      productResponseSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        status: "draft",
        ...validProductRequest,
        durationMinutes: undefined,
        subtitle: "Полный разбор карты",
        slaLabel: null,
        packageSessionCount: null,
        packageDiscountPercent: null,
        subscriptionPeriod: null,
        trialDays: null,
        groupSize: null,
        includedItems: [],
        modifiers: [],
        analytics: {
          salesCount: 0,
          grossRevenueMinor: 0,
          currency: "RUB",
          averageRating: null,
          reviewsCount: 0
        },
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z"
      })
    ).toThrow();
  });
});
