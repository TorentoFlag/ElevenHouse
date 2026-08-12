import { describe, expect, it } from "vitest";
import * as productContracts from "./products";
import {
  createProductFromTemplateParamsSchema,
  createProductFromTemplateRequestSchema,
  createProductRequestSchema,
  duplicateProductRequestSchema,
  listProductTemplatesResponseSchema,
  listProductsQuerySchema,
  productAstroDiaryConfigSchema,
  productStatusTransitionRequestSchema,
  productTemplateResponseSchema,
  productResponseSchema,
  updateProductRequestSchema
} from "./products";

const validProductRequest = {
  type: "single",
  title: "Натальный разбор",
  subtitle: "Полный разбор карты",
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: "33333333-3333-4333-8333-333333333333",
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

const validAstroDiaryRequest = {
  ...validProductRequest,
  type: "sub",
  title: "Астродневник",
  subtitle: "Личное сопровождение и вопросы для рефлексии",
  executionMode: "async",
  paymentModel: "sub",
  durationMinutes: undefined,
  durationLabel: undefined,
  subscriptionPeriod: "month",
  participantMode: "solo",
  deliveryFormats: ["chat", "audio", "file"],
  requiredClientData: [],
  methods: [],
  accessGrants: ["journal"],
  modifiers: [],
  astroDiaryConfig: {
    reflectionCyclesPerPeriod: 12,
    responseSlaWorkingDays: 2,
    clientResponseWindowCalendarDays: 7,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow"
  }
} as const;

const validProductCoverMedia = {
  id: "33333333-3333-4333-8333-333333333333",
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
  url: "https://cdn.example/products/cover.webp",
  variants: [],
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z"
} as const;

describe("product contracts", () => {
  it("accepts a valid create request", () => {
    const parsed = createProductRequestSchema.parse(validProductRequest);

    expect(parsed).toMatchObject({
      title: "Натальный разбор",
      priceMinor: 490000
    });
    expect(parsed).not.toHaveProperty("status");
  });

  it("accepts a complete AstroDiary-only configuration", () => {
    expect(productAstroDiaryConfigSchema.parse(validAstroDiaryRequest.astroDiaryConfig)).toEqual({
      reflectionCyclesPerPeriod: 12,
      responseSlaWorkingDays: 2,
      clientResponseWindowCalendarDays: 7,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: "Europe/Moscow"
    });

    expect(createProductRequestSchema.parse(validAstroDiaryRequest)).toMatchObject({
      type: "sub",
      accessGrants: ["journal"],
      astroDiaryConfig: validAstroDiaryRequest.astroDiaryConfig
    });
  });

  it("exports typed product mutation rejection contracts", () => {
    const contracts = productContracts as unknown as {
      readonly productRevisionConflictResponseSchema?: { parse(value: unknown): unknown };
      readonly productFulfillmentNotReadyResponseSchema?: { parse(value: unknown): unknown };
      readonly productMutationRejectionSchema?: { parse(value: unknown): unknown };
    };
    const revisionConflict = {
      code: "PRODUCT_REVISION_CONFLICT",
      expectedRevision: 3,
      currentRevision: 4
    };
    const fulfillmentNotReady = {
      code: "PRODUCT_FULFILLMENT_NOT_READY",
      message: "AstroDiary subscription fulfillment is not ready"
    };

    expect(contracts.productRevisionConflictResponseSchema).toBeDefined();
    expect(contracts.productRevisionConflictResponseSchema?.parse(revisionConflict)).toEqual(
      revisionConflict
    );
    expect(contracts.productFulfillmentNotReadyResponseSchema?.parse(fulfillmentNotReady)).toEqual(
      fulfillmentNotReady
    );
    expect(contracts.productMutationRejectionSchema?.parse(revisionConflict)).toEqual(
      revisionConflict
    );
    expect(contracts.productMutationRejectionSchema?.parse(fulfillmentNotReady)).toEqual(
      fulfillmentNotReady
    );
  });

  it("requires the exact AstroDiary messaging capabilities without paid modifiers", () => {
    expect(
      createProductRequestSchema.parse({
        ...validAstroDiaryRequest,
        deliveryFormats: ["file", "chat", "audio"]
      }).deliveryFormats
    ).toEqual(["file", "chat", "audio"]);

    for (const patch of [
      { deliveryFormats: ["chat", "file"] },
      { deliveryFormats: ["chat", "audio", "file", "text"] },
      { requiredClientData: ["question"] },
      { methods: ["natal"] },
      {
        modifiers: [
          {
            label: "Extra",
            priceMinor: 100,
            kind: "fixed",
            isEnabled: true,
            createsArtifact: false,
            order: 10
          }
        ]
      }
    ] as const) {
      expect(() =>
        createProductRequestSchema.parse({ ...validAstroDiaryRequest, ...patch })
      ).toThrow();
    }
  });

  it.each([
    ["reflectionCyclesPerPeriod", { reflectionCyclesPerPeriod: 0 }],
    ["reflectionCyclesPerPeriod", { reflectionCyclesPerPeriod: 367 }],
    ["responseSlaWorkingDays", { responseSlaWorkingDays: 0 }],
    ["responseSlaWorkingDays", { responseSlaWorkingDays: 31 }],
    ["clientResponseWindowCalendarDays", { clientResponseWindowCalendarDays: 0 }],
    ["clientResponseWindowCalendarDays", { clientResponseWindowCalendarDays: 91 }],
    ["workingWeekdays", { workingWeekdays: [] }],
    ["workingWeekdays", { workingWeekdays: [1, 1] }],
    ["workingWeekdays", { workingWeekdays: [0, 1] }],
    ["serviceTimezone", { serviceTimezone: "Mars/Olympus" }]
  ] as const)("rejects invalid AstroDiary %s", (path, configPatch) => {
    const result = productAstroDiaryConfigSchema.safeParse({
      ...validAstroDiaryRequest.astroDiaryConfig,
      ...configPatch
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === path)).toBe(true);
    }
  });

  it("requires the fixed journal product shape and rejects diary config elsewhere", () => {
    expect(() =>
      createProductRequestSchema.parse({
        ...validAstroDiaryRequest,
        participantMode: "group",
        groupSize: 5
      })
    ).toThrow("AstroDiary products require solo participant mode");

    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        astroDiaryConfig: validAstroDiaryRequest.astroDiaryConfig
      })
    ).toThrow("Only AstroDiary products may define AstroDiary configuration");

    expect(() =>
      createProductRequestSchema.parse({
        ...validAstroDiaryRequest,
        astroDiaryConfig: undefined
      })
    ).toThrow("AstroDiary products require complete configuration");
  });

  it("rejects caller-controlled lifecycle status on create", () => {
    expect(() =>
      createProductRequestSchema.parse({ ...validProductRequest, status: "active" })
    ).toThrow();
  });

  it("accepts a localized duplicate title without lifecycle fields", () => {
    expect(
      duplicateProductRequestSchema.parse({
        expectedRevision: 3,
        title: "Natal reading (copy)"
      })
    ).toEqual({
      expectedRevision: 3,
      title: "Natal reading (copy)"
    });

    expect(() =>
      duplicateProductRequestSchema.parse({ expectedRevision: 3, title: "x".repeat(201) })
    ).toThrow();
    expect(() => duplicateProductRequestSchema.parse({ status: "active" })).toThrow();
  });

  it("requires a positive expected revision for product mutations", () => {
    expect(updateProductRequestSchema.parse({ expectedRevision: 2, title: "Синастрия" })).toEqual({
      expectedRevision: 2,
      title: "Синастрия"
    });
    expect(productStatusTransitionRequestSchema.parse({ expectedRevision: 2 })).toEqual({
      expectedRevision: 2
    });
    expect(() => updateProductRequestSchema.parse({ title: "Синастрия" })).toThrow();
    expect(() => productStatusTransitionRequestSchema.parse({ expectedRevision: 0 })).toThrow();
    expect(() => duplicateProductRequestSchema.parse({ title: "Копия" })).toThrow();
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
        type: "custom",
        paymentModel: "pack",
        packageSessionCount: undefined
      })
    ).toThrow();

    expect(
      createProductRequestSchema.parse({
        ...validProductRequest,
        type: "custom",
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

  it("rejects product type and scenario mismatches on create", () => {
    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        type: "sub",
        executionMode: "async",
        paymentModel: "once",
        subscriptionPeriod: "month",
        deliveryFormats: ["channel"],
        accessGrants: ["channel"]
      })
    ).toThrow();

    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        type: "course",
        executionMode: "async",
        paymentModel: "once",
        accessGrants: []
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

  it("limits percent modifiers to whole percentages", () => {
    expect(
      createProductRequestSchema.parse({
        ...validProductRequest,
        modifiers: [
          {
            label: "Скидка",
            priceMinor: 15,
            kind: "percent",
            isEnabled: true,
            createsArtifact: false,
            order: 10
          }
        ]
      }).modifiers[0]?.priceMinor
    ).toBe(15);

    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        modifiers: [
          {
            label: "Скидка",
            priceMinor: 101,
            kind: "percent",
            isEnabled: true,
            createsArtifact: false,
            order: 10
          }
        ]
      })
    ).toThrow();
  });

  it("rejects duplicate enum-array values before persistence", () => {
    expect(() =>
      createProductRequestSchema.parse({
        ...validProductRequest,
        deliveryFormats: ["video", "video"]
      })
    ).toThrow();
    expect(() =>
      updateProductRequestSchema.parse({
        expectedRevision: 1,
        methods: ["natal", "natal"]
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

  it("accepts platform product template responses", () => {
    const template = {
      id: "55555555-5555-4555-8555-555555555555",
      code: "individual_consultation",
      locale: "ru",
      type: "single",
      status: "active",
      title: "Индивидуальная консультация",
      subtitle: "Одна встреча с понятным результатом",
      description: "Подходит для консультаций, диагностики и экспертных сессий.",
      sortOrder: 10,
      payload: {
        ...validProductRequest,
        title: "Индивидуальная консультация",
        subtitle: "Одна встреча с понятным результатом",
        methods: []
      },
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z"
    };

    expect(productTemplateResponseSchema.parse(template)).toMatchObject({
      code: "individual_consultation",
      locale: "ru",
      type: "single"
    });
    expect(
      listProductTemplatesResponseSchema.parse({ templates: [template] }).templates
    ).toHaveLength(1);
    expect(createProductFromTemplateParamsSchema.parse({ templateCode: "quick_answer" })).toEqual({
      templateCode: "quick_answer"
    });
    expect(createProductFromTemplateRequestSchema.parse({ locale: "en" })).toEqual({
      locale: "en"
    });
  });

  it("accepts response analytics shape before real source modules exist", () => {
    expect(
      productResponseSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        status: "draft",
        revision: 1,
        ...validProductRequest,
        astroDiaryConfig: null,
        subtitle: "Полный разбор карты",
        coverMedia: validProductCoverMedia,
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
      coverMedia: {
        url: "https://cdn.example/products/cover.webp"
      },
      analytics: {
        salesCount: 0,
        averageRating: null
      }
    });
  });

  it("accepts partial update requests and nullable field clearing", () => {
    expect(updateProductRequestSchema.parse({ expectedRevision: 1, title: "Синастрия" })).toEqual({
      expectedRevision: 1,
      title: "Синастрия"
    });
    expect(updateProductRequestSchema.parse({ expectedRevision: 1, paymentModel: "pack" })).toEqual(
      {
        expectedRevision: 1,
        paymentModel: "pack"
      }
    );
    expect(
      updateProductRequestSchema.parse({ expectedRevision: 1, participantMode: "group" })
    ).toEqual({
      expectedRevision: 1,
      participantMode: "group"
    });
    expect(
      updateProductRequestSchema.parse({
        expectedRevision: 1,
        subtitle: null,
        introVideoUrl: "",
        durationMinutes: null,
        packageSessionCount: null,
        subscriptionPeriod: null,
        groupSize: null
      })
    ).toEqual({
      expectedRevision: 1,
      subtitle: null,
      introVideoUrl: null,
      durationMinutes: null,
      packageSessionCount: null,
      subscriptionPeriod: null,
      groupSize: null
    });
  });

  it("requires an explicit nullable cover media object in product responses", () => {
    expect(
      productResponseSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        status: "draft",
        revision: 1,
        ...validProductRequest,
        astroDiaryConfig: null,
        coverMediaId: null,
        coverMedia: null,
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
      }).coverMedia
    ).toBeNull();

    expect(() =>
      productResponseSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        status: "draft",
        revision: 1,
        ...validProductRequest,
        astroDiaryConfig: null,
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

  it("requires normalized nullable duration in product responses", () => {
    expect(() =>
      productResponseSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        status: "draft",
        revision: 1,
        ...validProductRequest,
        astroDiaryConfig: null,
        durationMinutes: undefined,
        subtitle: "Полный разбор карты",
        coverMedia: validProductCoverMedia,
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
