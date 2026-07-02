# Astrologer Products Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated astrologer products backend with normalized product storage, shared contracts, domain use cases, Drizzle adapters, Nest API routes and null lifetime analytics until source modules exist.

**Architecture:** `apps/astrologer-api` owns the HTTP module. `packages/contracts` owns Zod request/response contracts. `packages/domain` owns product use cases and ports without importing DB code. `packages/db` owns Drizzle schema, migrations and adapters. Analytics is exposed through a port with a null implementation until orders, payments and reviews exist.

**Tech Stack:** NestJS 11, TypeScript, Zod contracts via `@elevenhouse/validation`, Drizzle ORM/PostgreSQL, Vitest, existing CSRF/session security layer.

---

## File Structure

- Create: `packages/contracts/src/products.ts` - product API schemas and inferred types.
- Modify: `packages/contracts/src/index.ts` - export product contracts.
- Create: `packages/contracts/src/products.test.ts` - contract validation coverage.
- Modify: `packages/contracts/src/index.test.ts` - export smoke test.
- Create: `packages/domain/src/products/product-types.ts` - domain enums, product entity and command input types.
- Create: `packages/domain/src/products/product-errors.ts` - domain errors.
- Create: `packages/domain/src/products/product-store.ts` - product persistence port.
- Create: `packages/domain/src/products/product-analytics-reader.ts` - lifetime analytics port.
- Create: `packages/domain/src/products/product-use-cases.ts` - list/detail/create/update/status/duplicate use cases.
- Create: `packages/domain/src/products/index.ts` - product domain exports.
- Create: `packages/domain/src/products/product-use-cases.test.ts` - use-case coverage.
- Modify: `packages/domain/src/index.ts` - export products.
- Create: `packages/db/src/schema/products/product-values.ts` - DB enum constants.
- Create: `packages/db/src/schema/products/products.schema.ts` - primary product table.
- Create: `packages/db/src/schema/products/product-delivery-formats.schema.ts` - delivery format rows.
- Create: `packages/db/src/schema/products/product-required-client-data.schema.ts` - client data rows.
- Create: `packages/db/src/schema/products/product-methods.schema.ts` - method rows.
- Create: `packages/db/src/schema/products/product-access-grants.schema.ts` - access rows.
- Create: `packages/db/src/schema/products/product-included-items.schema.ts` - included item rows.
- Create: `packages/db/src/schema/products/product-modifiers.schema.ts` - modifier rows.
- Create: `packages/db/src/schema/products/relations.schema.ts` - Drizzle relations.
- Create: `packages/db/src/schema/products/index.ts` - schema exports.
- Modify: `packages/db/src/schema/index.ts` - export products schema.
- Create: `packages/db/src/adapters/products/drizzle-products-store.ts` - ProductStore adapter.
- Create: `packages/db/src/adapters/products/drizzle-products-store.integration.ts` - DB adapter integration coverage.
- Create: `packages/db/src/adapters/products/index.ts` - adapter exports.
- Modify: `packages/db/src/adapters/index.ts` - export products adapter.
- Modify: `packages/db/package.json` - expose `@elevenhouse/db/products`.
- Replace current generated migration in `packages/db/drizzle/` according to repository DB rules.
- Create: `apps/astrologer-api/src/modules/products/products.tokens.ts` - DI tokens.
- Create: `apps/astrologer-api/src/modules/products/null-product-analytics-reader.ts` - zero/null analytics implementation.
- Create: `apps/astrologer-api/src/modules/products/products.service.ts` - contract parsing and use-case orchestration.
- Create: `apps/astrologer-api/src/modules/products/products.controller.ts` - routes.
- Create: `apps/astrologer-api/src/modules/products/products.module.ts` - Nest feature module wiring.
- Create: `apps/astrologer-api/src/modules/products/products.service.test.ts` - service unit tests.
- Create: `apps/astrologer-api/src/modules/products/products.e2e.test.ts` - API e2e tests.
- Modify: `apps/astrologer-api/src/app.module.ts` - import `ProductsModule`.
- Modify: `docs/api/api-boundaries.md` - document `astrologer-api` products ownership and transitional `ops-api`.

---

### Task 1: Add Product Contracts

**Files:**
- Create: `packages/contracts/src/products.ts`
- Create: `packages/contracts/src/products.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create `packages/contracts/src/products.test.ts`:

```ts
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
        slaLabel: null,
        packageSessionCount: null,
        packageDiscountPercent: null,
        subscriptionPeriod: null,
        trialDays: null,
        groupSize: null,
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        analytics: {
          salesCount: 0,
          grossRevenueMinor: 0,
          currency: "RUB",
          averageRating: null,
          reviewsCount: 0
        }
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
});
```

- [ ] **Step 2: Run contract tests and verify they fail**

Run:

```bash
pnpm test -- packages/contracts/src/products.test.ts
```

Expected: FAIL because `packages/contracts/src/products.ts` does not exist.

- [ ] **Step 3: Implement product contracts**

Create `packages/contracts/src/products.ts`:

```ts
import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const optionalTrimmedStringSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const productStatusSchema = z.enum(["draft", "active", "archived"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productStatusFilterSchema = z.union([z.literal("all"), productStatusSchema]);
export type ProductStatusFilter = z.infer<typeof productStatusFilterSchema>;

export const productTypeSchema = z.enum([
  "single",
  "pack",
  "async",
  "sub",
  "mini",
  "course",
  "custom"
]);
export type ProductType = z.infer<typeof productTypeSchema>;

export const productDeliveryFormatSchema = z.enum([
  "video",
  "audio",
  "chat",
  "text",
  "file",
  "channel"
]);
export type ProductDeliveryFormat = z.infer<typeof productDeliveryFormatSchema>;

export const productExecutionModeSchema = z.enum(["live", "async", "instant"]);
export type ProductExecutionMode = z.infer<typeof productExecutionModeSchema>;

export const productPaymentModelSchema = z.enum(["once", "pack", "sub", "free"]);
export type ProductPaymentModel = z.infer<typeof productPaymentModelSchema>;

export const productSubscriptionPeriodSchema = z.enum(["week", "month", "year"]);
export type ProductSubscriptionPeriod = z.infer<typeof productSubscriptionPeriodSchema>;

export const productParticipantModeSchema = z.enum(["solo", "group", "gift"]);
export type ProductParticipantMode = z.infer<typeof productParticipantModeSchema>;

export const productRequiredClientDataSchema = z.enum([
  "chart1",
  "cities",
  "chart2",
  "question",
  "event"
]);
export type ProductRequiredClientData = z.infer<typeof productRequiredClientDataSchema>;

export const productMethodSchema = z.enum([
  "natal",
  "forecast",
  "synastry",
  "child",
  "numerology",
  "matrix",
  "humandesign"
]);
export type ProductMethod = z.infer<typeof productMethodSchema>;

export const productAccessGrantSchema = z.enum([
  "content",
  "channel",
  "records",
  "course",
  "community",
  "journal"
]);
export type ProductAccessGrant = z.infer<typeof productAccessGrantSchema>;

export const productModifierKindSchema = z.enum(["fixed", "percent", "free"]);
export type ProductModifierKind = z.infer<typeof productModifierKindSchema>;

export const productCurrencySchema = z.enum(["RUB"]);
export type ProductCurrency = z.infer<typeof productCurrencySchema>;

const nullableStringSchema = z.string().trim().max(500).nullable();
const optionalPositiveIntSchema = z.number().int().positive().optional();
const optionalNonNegativeIntSchema = z.number().int().min(0).optional();
const orderSchema = z.number().int().min(0).max(100_000);

export const productIncludedItemRequestSchema = z
  .object({
    text: nonEmptyStringSchema.max(300),
    icon: nonEmptyStringSchema.max(40),
    order: orderSchema
  })
  .strict();
export type ProductIncludedItemRequest = z.infer<typeof productIncludedItemRequestSchema>;

export const productModifierRequestSchema = z
  .object({
    label: nonEmptyStringSchema.max(200),
    priceMinor: z.number().int().min(0),
    kind: productModifierKindSchema,
    isEnabled: z.boolean(),
    createsArtifact: z.boolean(),
    order: orderSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "free" && value.priceMinor !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceMinor"],
        message: "Free modifiers must have zero price"
      });
    }
  });
export type ProductModifierRequest = z.infer<typeof productModifierRequestSchema>;

const productPayloadBaseSchema = z
  .object({
    type: productTypeSchema,
    title: nonEmptyStringSchema.max(200),
    subtitle: optionalTrimmedStringSchema,
    priceMinor: z.number().int().min(0),
    currency: productCurrencySchema,
    coverMediaId: optionalTrimmedStringSchema,
    introVideoUrl: optionalTrimmedStringSchema,
    executionMode: productExecutionModeSchema,
    paymentModel: productPaymentModelSchema,
    durationMinutes: optionalPositiveIntSchema,
    durationLabel: optionalTrimmedStringSchema,
    slaLabel: optionalTrimmedStringSchema,
    packageSessionCount: optionalPositiveIntSchema,
    packageDiscountPercent: z.number().int().min(0).max(100).optional(),
    subscriptionPeriod: productSubscriptionPeriodSchema.optional(),
    trialDays: optionalNonNegativeIntSchema,
    participantMode: productParticipantModeSchema,
    groupSize: optionalPositiveIntSchema,
    deliveryFormats: z.array(productDeliveryFormatSchema).min(1).max(6),
    requiredClientData: z.array(productRequiredClientDataSchema).max(10),
    methods: z.array(productMethodSchema).max(10),
    accessGrants: z.array(productAccessGrantSchema).max(10),
    includedItems: z.array(productIncludedItemRequestSchema).max(30),
    modifiers: z.array(productModifierRequestSchema).max(30)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.paymentModel === "pack" && !value.packageSessionCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packageSessionCount"],
        message: "Package products require packageSessionCount"
      });
    }

    if (value.paymentModel === "sub" && !value.subscriptionPeriod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subscriptionPeriod"],
        message: "Subscription products require subscriptionPeriod"
      });
    }

    if (value.participantMode === "group" && !value.groupSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["groupSize"],
        message: "Group products require groupSize"
      });
    }

    if (value.paymentModel === "free" && value.priceMinor !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceMinor"],
        message: "Free products must have zero price"
      });
    }
  });

export const createProductRequestSchema = productPayloadBaseSchema.extend({
  status: productStatusSchema.default("draft")
});
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = productPayloadBaseSchema.partial().strict();
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

export const productIdParamSchema = z.object({ productId: uuidSchema }).strict();
export type ProductIdParam = z.infer<typeof productIdParamSchema>;

export const listProductsQuerySchema = z
  .object({
    status: productStatusFilterSchema.default("all"),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
  })
  .strict();
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const productLifetimeAnalyticsResponseSchema = z.object({
  salesCount: z.number().int().min(0),
  grossRevenueMinor: z.number().int().min(0),
  currency: productCurrencySchema,
  averageRating: z.number().min(1).max(5).nullable(),
  reviewsCount: z.number().int().min(0)
});
export type ProductLifetimeAnalyticsResponse = z.infer<
  typeof productLifetimeAnalyticsResponseSchema
>;

export const productIncludedItemResponseSchema = productIncludedItemRequestSchema.extend({
  id: uuidSchema
});
export type ProductIncludedItemResponse = z.infer<typeof productIncludedItemResponseSchema>;

export const productModifierResponseSchema = productModifierRequestSchema.extend({
  id: uuidSchema
});
export type ProductModifierResponse = z.infer<typeof productModifierResponseSchema>;

export const productResponseSchema = productPayloadBaseSchema.extend({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  status: productStatusSchema,
  subtitle: nullableStringSchema,
  coverMediaId: nullableStringSchema,
  introVideoUrl: nullableStringSchema,
  durationLabel: nullableStringSchema,
  slaLabel: nullableStringSchema,
  packageSessionCount: z.number().int().positive().nullable(),
  packageDiscountPercent: z.number().int().min(0).max(100).nullable(),
  subscriptionPeriod: productSubscriptionPeriodSchema.nullable(),
  trialDays: z.number().int().min(0).nullable(),
  groupSize: z.number().int().positive().nullable(),
  includedItems: z.array(productIncludedItemResponseSchema),
  modifiers: z.array(productModifierResponseSchema),
  analytics: productLifetimeAnalyticsResponseSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ProductResponse = z.infer<typeof productResponseSchema>;

export const listProductsResponseSchema = z.object({
  products: z.array(productResponseSchema),
  total: z.number().int().min(0),
  counts: z.object({
    all: z.number().int().min(0),
    active: z.number().int().min(0),
    draft: z.number().int().min(0),
    archived: z.number().int().min(0)
  })
});
export type ListProductsResponse = z.infer<typeof listProductsResponseSchema>;

export const productSummaryResponseSchema = z.object({
  total: z.number().int().min(0),
  active: z.number().int().min(0),
  draft: z.number().int().min(0),
  archived: z.number().int().min(0),
  totalSalesCount: z.number().int().min(0),
  grossRevenueMinor: z.number().int().min(0),
  currency: productCurrencySchema,
  bestseller: z
    .object({
      productId: uuidSchema,
      title: nonEmptyStringSchema,
      salesCount: z.number().int().min(0)
    })
    .nullable()
});
export type ProductSummaryResponse = z.infer<typeof productSummaryResponseSchema>;
```

Modify `packages/contracts/src/index.ts`:

```ts
export * from "./dictionary";
export * from "./health";
export * from "./identity";
export * from "./products";
```

Modify `packages/contracts/src/index.test.ts` to assert the product export exists:

```ts
import { describe, expect, it } from "vitest";
import { createProductRequestSchema } from "./index";

describe("contracts exports", () => {
  it("exports product contracts", () => {
    expect(createProductRequestSchema).toBeDefined();
  });
});
```

If `index.test.ts` already contains export checks for other modules, add only the
`createProductRequestSchema` import and assertion to the existing test.

- [ ] **Step 4: Run contract tests**

Run:

```bash
pnpm test -- packages/contracts/src/products.test.ts packages/contracts/src/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit contracts**

```bash
git add packages/contracts/src/products.ts packages/contracts/src/products.test.ts packages/contracts/src/index.ts packages/contracts/src/index.test.ts
git commit -m "feat(contracts): add astrologer product contracts"
```

---

### Task 2: Add Product Domain Use Cases

**Files:**
- Create: `packages/domain/src/products/product-types.ts`
- Create: `packages/domain/src/products/product-errors.ts`
- Create: `packages/domain/src/products/product-store.ts`
- Create: `packages/domain/src/products/product-analytics-reader.ts`
- Create: `packages/domain/src/products/product-use-cases.ts`
- Create: `packages/domain/src/products/product-use-cases.test.ts`
- Create: `packages/domain/src/products/index.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing domain tests**

Create `packages/domain/src/products/product-use-cases.test.ts` with an in-memory store:

```ts
import { describe, expect, it } from "vitest";
import {
  archiveProduct,
  createProduct,
  duplicateProduct,
  listProducts,
  ProductNotFoundError,
  publishProduct,
  updateProduct,
  type Product,
  type ProductCreateInput,
  type ProductStore
} from "./index";

const baseInput: ProductCreateInput = {
  ownerUserId: "owner-1",
  type: "single",
  status: "draft",
  title: "Натальный разбор",
  subtitle: "Полный разбор",
  priceMinor: 490000,
  currency: "RUB",
  coverMediaId: "cover-1",
  introVideoUrl: null,
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
  includedItems: [{ id: "item-1", text: "Полный разбор карты", icon: "check", order: 10 }],
  modifiers: [],
  now: "2026-07-02T00:00:00.000Z"
};

class InMemoryProductStore implements ProductStore {
  private products: Product[] = [];
  private nextId = 1;

  async listByOwner(query) {
    const owned = this.products.filter((product) => product.ownerUserId === query.ownerUserId);
    const filtered =
      query.status === "all"
        ? owned
        : owned.filter((product) => product.status === query.status);
    return {
      products: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      counts: {
        all: owned.length,
        active: owned.filter((product) => product.status === "active").length,
        draft: owned.filter((product) => product.status === "draft").length,
        archived: owned.filter((product) => product.status === "archived").length
      }
    };
  }

  async findByOwnerAndId(input) {
    return (
      this.products.find(
        (product) => product.ownerUserId === input.ownerUserId && product.id === input.productId
      ) ?? null
    );
  }

  async create(input) {
    const product: Product = {
      ...input,
      id: `product-${this.nextId++}`,
      createdAt: input.now,
      updatedAt: input.now
    };
    this.products.unshift(product);
    return product;
  }

  async update(input) {
    const index = this.products.findIndex(
      (product) => product.ownerUserId === input.ownerUserId && product.id === input.productId
    );
    if (index === -1) return null;
    const current = this.products[index];
    const next = { ...current, ...input.patch, updatedAt: input.now };
    this.products[index] = next;
    return next;
  }

  async duplicate(input) {
    const source = await this.findByOwnerAndId({
      ownerUserId: input.ownerUserId,
      productId: input.productId
    });
    if (!source) return null;
    return this.create({
      ...source,
      id: undefined as never,
      title: `${source.title} (копия)`,
      status: "draft",
      now: input.now
    });
  }
}

describe("product use cases", () => {
  it("creates draft products and lists them by owner", async () => {
    const store = new InMemoryProductStore();
    await createProduct({ store, input: baseInput });

    const result = await listProducts({
      store,
      ownerUserId: "owner-1",
      status: "all",
      limit: 50,
      offset: 0
    });

    expect(result.total).toBe(1);
    expect(result.products[0]?.status).toBe("draft");
  });

  it("does not expose products owned by another astrologer", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({ store, input: baseInput });

    await expect(
      updateProduct({
        store,
        ownerUserId: "owner-2",
        productId: product.id,
        patch: { title: "Чужой продукт" },
        now: "2026-07-02T00:10:00.000Z"
      })
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("publishes and archives through explicit transitions", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({ store, input: baseInput });
    const active = await publishProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      now: "2026-07-02T00:10:00.000Z"
    });
    const archived = await archiveProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      now: "2026-07-02T00:20:00.000Z"
    });

    expect(active.status).toBe("active");
    expect(archived.status).toBe("archived");
  });

  it("duplicates products into draft status", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({ store, input: { ...baseInput, status: "active" } });

    const copy = await duplicateProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      now: "2026-07-02T00:30:00.000Z"
    });

    expect(copy.id).not.toBe(product.id);
    expect(copy.status).toBe("draft");
    expect(copy.title).toBe("Натальный разбор (копия)");
  });
});
```

- [ ] **Step 2: Run domain tests and verify they fail**

Run:

```bash
pnpm test -- packages/domain/src/products/product-use-cases.test.ts
```

Expected: FAIL because product domain files do not exist.

- [ ] **Step 3: Implement domain product files**

Create `packages/domain/src/products/product-types.ts`:

```ts
export type ProductStatus = "draft" | "active" | "archived";
export type ProductStatusFilter = ProductStatus | "all";
export type ProductType = "single" | "pack" | "async" | "sub" | "mini" | "course" | "custom";
export type ProductDeliveryFormat = "video" | "audio" | "chat" | "text" | "file" | "channel";
export type ProductExecutionMode = "live" | "async" | "instant";
export type ProductPaymentModel = "once" | "pack" | "sub" | "free";
export type ProductSubscriptionPeriod = "week" | "month" | "year";
export type ProductParticipantMode = "solo" | "group" | "gift";
export type ProductRequiredClientData = "chart1" | "cities" | "chart2" | "question" | "event";
export type ProductMethod =
  | "natal"
  | "forecast"
  | "synastry"
  | "child"
  | "numerology"
  | "matrix"
  | "humandesign";
export type ProductAccessGrant =
  | "content"
  | "channel"
  | "records"
  | "course"
  | "community"
  | "journal";
export type ProductModifierKind = "fixed" | "percent" | "free";
export type ProductCurrency = "RUB";

export type ProductIncludedItem = {
  readonly id: string;
  readonly text: string;
  readonly icon: string;
  readonly order: number;
};

export type ProductModifier = {
  readonly id: string;
  readonly label: string;
  readonly priceMinor: number;
  readonly kind: ProductModifierKind;
  readonly isEnabled: boolean;
  readonly createsArtifact: boolean;
  readonly order: number;
};

export type Product = {
  readonly id: string;
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
  readonly includedItems: readonly ProductIncludedItem[];
  readonly modifiers: readonly ProductModifier[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ProductCreateInput = Omit<Product, "id" | "createdAt" | "updatedAt"> & {
  readonly now: string;
};

export type ProductUpdatePatch = Partial<
  Omit<ProductCreateInput, "ownerUserId" | "now" | "status">
> & {
  readonly status?: ProductStatus;
};
```

Create `packages/domain/src/products/product-errors.ts`:

```ts
export class ProductNotFoundError extends Error {
  constructor() {
    super("Product not found");
  }
}
```

Create `packages/domain/src/products/product-store.ts`:

```ts
import type { Product, ProductCreateInput, ProductStatusFilter, ProductUpdatePatch } from "./product-types";

export type ProductListResult = {
  readonly products: readonly Product[];
  readonly total: number;
  readonly counts: {
    readonly all: number;
    readonly active: number;
    readonly draft: number;
    readonly archived: number;
  };
};

export type ProductStore = {
  readonly listByOwner: (query: {
    readonly ownerUserId: string;
    readonly status: ProductStatusFilter;
    readonly limit: number;
    readonly offset: number;
  }) => Promise<ProductListResult>;
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly productId: string;
  }) => Promise<Product | null>;
  readonly create: (input: ProductCreateInput) => Promise<Product>;
  readonly update: (input: {
    readonly ownerUserId: string;
    readonly productId: string;
    readonly patch: ProductUpdatePatch;
    readonly now: string;
  }) => Promise<Product | null>;
  readonly duplicate: (input: {
    readonly ownerUserId: string;
    readonly productId: string;
    readonly now: string;
  }) => Promise<Product | null>;
};
```

Create `packages/domain/src/products/product-analytics-reader.ts`:

```ts
import type { ProductCurrency } from "./product-types";

export type ProductLifetimeAnalytics = {
  readonly productId: string;
  readonly salesCount: number;
  readonly grossRevenueMinor: number;
  readonly currency: ProductCurrency;
  readonly averageRating: number | null;
  readonly reviewsCount: number;
};

export type ProductAnalyticsReader = {
  readonly getLifetimeAnalytics: (input: {
    readonly ownerUserId: string;
    readonly productIds: readonly string[];
  }) => Promise<ReadonlyMap<string, ProductLifetimeAnalytics>>;
};
```

Create `packages/domain/src/products/product-use-cases.ts`:

```ts
import type { Product, ProductCreateInput, ProductStatusFilter, ProductUpdatePatch } from "./product-types";
import { ProductNotFoundError } from "./product-errors";
import type { ProductListResult, ProductStore } from "./product-store";

export function listProducts(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly status: ProductStatusFilter;
  readonly limit: number;
  readonly offset: number;
}): Promise<ProductListResult> {
  return input.store.listByOwner(input);
}

export async function getProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
}): Promise<Product> {
  const product = await input.store.findByOwnerAndId(input);
  if (!product) throw new ProductNotFoundError();
  return product;
}

export function createProduct(input: {
  readonly store: ProductStore;
  readonly input: ProductCreateInput;
}): Promise<Product> {
  return input.store.create(input.input);
}

export async function updateProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly patch: ProductUpdatePatch;
  readonly now: string;
}): Promise<Product> {
  const product = await input.store.update(input);
  if (!product) throw new ProductNotFoundError();
  return product;
}

export function publishProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly now: string;
}): Promise<Product> {
  return updateProduct({ ...input, patch: { status: "active" } });
}

export function moveProductToDraft(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly now: string;
}): Promise<Product> {
  return updateProduct({ ...input, patch: { status: "draft" } });
}

export function archiveProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly now: string;
}): Promise<Product> {
  return updateProduct({ ...input, patch: { status: "archived" } });
}

export async function duplicateProduct(input: {
  readonly store: ProductStore;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly now: string;
}): Promise<Product> {
  const product = await input.store.duplicate(input);
  if (!product) throw new ProductNotFoundError();
  return product;
}
```

Create `packages/domain/src/products/index.ts`:

```ts
export * from "./product-analytics-reader";
export * from "./product-errors";
export * from "./product-store";
export * from "./product-types";
export * from "./product-use-cases";
```

Modify `packages/domain/src/index.ts`:

```ts
export * from "./accounts";
export * from "./auth-identities";
export * from "./auth-sessions";
export * from "./dictionary";
export * from "./domain-events";
export * from "./identity";
export * from "./products";
export * from "./roles";
export * from "./shared";
```

If the file has a different export order, add only `export * from "./products";`.

- [ ] **Step 4: Run domain tests**

Run:

```bash
pnpm test -- packages/domain/src/products/product-use-cases.test.ts packages/domain/src/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit domain**

```bash
git add packages/domain/src/products packages/domain/src/index.ts
git commit -m "feat(domain): add astrologer product use cases"
```

---

### Task 3: Add Product Database Schema And Migration

**Files:**
- Create: `packages/db/src/schema/products/*.ts`
- Modify: `packages/db/src/schema/index.ts`
- Replace generated migration under `packages/db/drizzle/`

- [ ] **Step 1: Write failing schema export test**

Modify `packages/db/src/schema.test.ts` by adding a product export assertion:

```ts
import { products } from "./schema";

describe("database schema", () => {
  it("exports product tables", () => {
    expect(products).toBeDefined();
  });
});
```

If `schema.test.ts` already has a describe block, add only the import and assertion.

- [ ] **Step 2: Run schema test and verify it fails**

Run:

```bash
pnpm test -- packages/db/src/schema.test.ts
```

Expected: FAIL because `products` is not exported from schema.

- [ ] **Step 3: Add schema values**

Create `packages/db/src/schema/products/product-values.ts`:

```ts
export const productStatuses = ["draft", "active", "archived"] as const;
export const productTypes = ["single", "pack", "async", "sub", "mini", "course", "custom"] as const;
export const productDeliveryFormats = ["video", "audio", "chat", "text", "file", "channel"] as const;
export const productExecutionModes = ["live", "async", "instant"] as const;
export const productPaymentModels = ["once", "pack", "sub", "free"] as const;
export const productSubscriptionPeriods = ["week", "month", "year"] as const;
export const productParticipantModes = ["solo", "group", "gift"] as const;
export const productRequiredClientDataValues = ["chart1", "cities", "chart2", "question", "event"] as const;
export const productMethodValues = ["natal", "forecast", "synastry", "child", "numerology", "matrix", "humandesign"] as const;
export const productAccessGrantValues = ["content", "channel", "records", "course", "community", "journal"] as const;
export const productModifierKinds = ["fixed", "percent", "free"] as const;
export const productCurrencies = ["RUB"] as const;
```

- [ ] **Step 4: Add primary product table**

Create `packages/db/src/schema/products/products.schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    coverMediaId: text("cover_media_id"),
    introVideoUrl: text("intro_video_url"),
    executionMode: text("execution_mode").notNull(),
    paymentModel: text("payment_model").notNull(),
    durationMinutes: integer("duration_minutes"),
    durationLabel: text("duration_label"),
    slaLabel: text("sla_label"),
    packageSessionCount: integer("package_session_count"),
    packageDiscountPercent: integer("package_discount_percent"),
    subscriptionPeriod: text("subscription_period"),
    trialDays: integer("trial_days"),
    participantMode: text("participant_mode").notNull(),
    groupSize: integer("group_size"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("products_owner_status_idx").on(table.ownerUserId, table.status),
    check("products_status_check", sql`${table.status} in ('draft', 'active', 'archived')`),
    check("products_type_check", sql`${table.type} in ('single', 'pack', 'async', 'sub', 'mini', 'course', 'custom')`),
    check("products_currency_check", sql`${table.currency} in ('RUB')`),
    check("products_execution_mode_check", sql`${table.executionMode} in ('live', 'async', 'instant')`),
    check("products_payment_model_check", sql`${table.paymentModel} in ('once', 'pack', 'sub', 'free')`),
    check("products_participant_mode_check", sql`${table.participantMode} in ('solo', 'group', 'gift')`),
    check("products_price_minor_check", sql`${table.priceMinor} >= 0`),
    check("products_duration_minutes_check", sql`${table.durationMinutes} is null or ${table.durationMinutes} > 0`),
    check("products_package_session_count_check", sql`${table.packageSessionCount} is null or ${table.packageSessionCount} > 0`),
    check("products_package_discount_check", sql`${table.packageDiscountPercent} is null or (${table.packageDiscountPercent} >= 0 and ${table.packageDiscountPercent} <= 100)`),
    check("products_subscription_period_check", sql`${table.subscriptionPeriod} is null or ${table.subscriptionPeriod} in ('week', 'month', 'year')`),
    check("products_trial_days_check", sql`${table.trialDays} is null or ${table.trialDays} >= 0`),
    check("products_group_size_check", sql`${table.groupSize} is null or ${table.groupSize} > 0`)
  ]
);
```

- [ ] **Step 5: Add child tables**

Create one file per child table. Use the same shape for enum rows, with unique
constraints that prevent duplicates per product.

Create `packages/db/src/schema/products/product-delivery-formats.schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { products } from "./products.schema";

export const productDeliveryFormats = pgTable(
  "product_delivery_formats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    order: integer("order").notNull()
  },
  (table) => [
    index("product_delivery_formats_product_idx").on(table.productId),
    uniqueIndex("product_delivery_formats_product_value_idx").on(table.productId, table.value),
    check("product_delivery_formats_value_check", sql`${table.value} in ('video', 'audio', 'chat', 'text', 'file', 'channel')`)
  ]
);
```

Create equivalent files:

- `product-required-client-data.schema.ts` with table `product_required_client_data` and values `chart1`, `cities`, `chart2`, `question`, `event`.
- `product-methods.schema.ts` with table `product_methods` and values `natal`, `forecast`, `synastry`, `child`, `numerology`, `matrix`, `humandesign`.
- `product-access-grants.schema.ts` with table `product_access_grants` and values `content`, `channel`, `records`, `course`, `community`, `journal`.

Create `packages/db/src/schema/products/product-included-items.schema.ts`:

```ts
import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { products } from "./products.schema";

export const productIncludedItems = pgTable(
  "product_included_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    icon: text("icon").notNull(),
    order: integer("order").notNull()
  },
  (table) => [index("product_included_items_product_idx").on(table.productId)]
);
```

Create `packages/db/src/schema/products/product-modifiers.schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { products } from "./products.schema";

export const productModifiers = pgTable(
  "product_modifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    priceMinor: integer("price_minor").notNull(),
    kind: text("kind").notNull(),
    isEnabled: boolean("is_enabled").notNull(),
    createsArtifact: boolean("creates_artifact").notNull(),
    order: integer("order").notNull()
  },
  (table) => [
    index("product_modifiers_product_idx").on(table.productId),
    check("product_modifiers_kind_check", sql`${table.kind} in ('fixed', 'percent', 'free')`),
    check("product_modifiers_price_check", sql`${table.priceMinor} >= 0`)
  ]
);
```

- [ ] **Step 6: Add relations and exports**

Create `packages/db/src/schema/products/relations.schema.ts`:

```ts
import { relations } from "drizzle-orm";
import { products } from "./products.schema";
import { productAccessGrants } from "./product-access-grants.schema";
import { productDeliveryFormats } from "./product-delivery-formats.schema";
import { productIncludedItems } from "./product-included-items.schema";
import { productMethods } from "./product-methods.schema";
import { productModifiers } from "./product-modifiers.schema";
import { productRequiredClientData } from "./product-required-client-data.schema";

export const productsRelations = relations(products, ({ many }) => ({
  deliveryFormats: many(productDeliveryFormats),
  requiredClientData: many(productRequiredClientData),
  methods: many(productMethods),
  accessGrants: many(productAccessGrants),
  includedItems: many(productIncludedItems),
  modifiers: many(productModifiers)
}));
```

Create `packages/db/src/schema/products/index.ts`:

```ts
export * from "./product-access-grants.schema";
export * from "./product-delivery-formats.schema";
export * from "./product-included-items.schema";
export * from "./product-methods.schema";
export * from "./product-modifiers.schema";
export * from "./product-required-client-data.schema";
export * from "./product-values";
export * from "./products.schema";
export * from "./relations.schema";
```

Modify `packages/db/src/schema/index.ts`:

```ts
export * from "./identity";
export * from "./outbox";
export * from "./dictionary";
export * from "./products";
```

- [ ] **Step 7: Generate and reset DB according to repo rules**

Do not hand-write incremental ALTER migrations. Regenerate the current migration and
reset the local database.

Run:

```bash
pnpm db:generate
pnpm db:reset
```

Expected:

- Drizzle emits a migration containing `products` and child product tables.
- `db:reset` refuses non-local/production DBs and succeeds against the local dev DB.

If no local DB service is running, stop this task and report that the reset could not
be completed because repository instructions forbid starting local services without
explicit user permission.

- [ ] **Step 8: Run schema tests**

Run:

```bash
pnpm test -- packages/db/src/schema.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit schema**

```bash
git add packages/db/src/schema packages/db/drizzle packages/db/src/schema.test.ts
git commit -m "feat(db): add product schema"
```

---

### Task 4: Add Drizzle Product Store Adapter

**Files:**
- Create: `packages/db/src/adapters/products/drizzle-products-store.ts`
- Create: `packages/db/src/adapters/products/drizzle-products-store.integration.ts`
- Create: `packages/db/src/adapters/products/index.ts`
- Modify: `packages/db/src/adapters/index.ts`
- Modify: `packages/db/package.json`

- [ ] **Step 1: Write failing integration test**

Create `packages/db/src/adapters/products/drizzle-products-store.integration.ts` using the existing integration-test runtime pattern from dictionary adapters. Cover:

```ts
it("creates, reads, updates and duplicates an owner-scoped product", async () => {
  const store = createDrizzleProductStore(database);
  const ownerUserId = await insertTestUser(database);
  const otherOwnerUserId = await insertTestUser(database);

  const product = await store.create({
    ownerUserId,
    type: "single",
    status: "draft",
    title: "Натальный разбор",
    subtitle: "Полный разбор",
    priceMinor: 490000,
    currency: "RUB",
    coverMediaId: "cover-1",
    introVideoUrl: null,
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
    includedItems: [{ id: "ignored", text: "Полный разбор карты", icon: "check", order: 10 }],
    modifiers: [],
    now: "2026-07-02T00:00:00.000Z"
  });

  expect(product.id).toMatch(/[0-9a-f-]{36}/);
  expect(product.includedItems[0]?.text).toBe("Полный разбор карты");
  await expect(store.findByOwnerAndId({ ownerUserId: otherOwnerUserId, productId: product.id })).resolves.toBeNull();

  const active = await store.update({
    ownerUserId,
    productId: product.id,
    patch: { status: "active", title: "Натальный разбор 2" },
    now: "2026-07-02T00:10:00.000Z"
  });
  expect(active?.status).toBe("active");

  const copy = await store.duplicate({
    ownerUserId,
    productId: product.id,
    now: "2026-07-02T00:20:00.000Z"
  });
  expect(copy?.status).toBe("draft");
  expect(copy?.title).toBe("Натальный разбор 2 (копия)");
});
```

Use local helper functions from existing DB integration tests for runtime setup and
cleanup. If there is no reusable `insertTestUser`, add a small local helper in this
test file that inserts into `users` and returns the generated id.

- [ ] **Step 2: Run adapter test and verify it fails**

Run:

```bash
pnpm test:integration -- packages/db/src/adapters/products/drizzle-products-store.integration.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement adapter**

Create `packages/db/src/adapters/products/drizzle-products-store.ts`:

```ts
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Product, ProductCreateInput, ProductStore, ProductUpdatePatch } from "@elevenhouse/domain";
import type { PostgresDatabase } from "../../runtime";
import {
  productAccessGrants,
  productDeliveryFormats,
  productIncludedItems,
  productMethods,
  productModifiers,
  productRequiredClientData,
  products
} from "../../schema";

export function createDrizzleProductStore(database: PostgresDatabase): ProductStore {
  return {
    async listByOwner(query) {
      const where =
        query.status === "all"
          ? eq(products.ownerUserId, query.ownerUserId)
          : and(eq(products.ownerUserId, query.ownerUserId), eq(products.status, query.status));
      const rows = await database
        .select()
        .from(products)
        .where(where)
        .orderBy(desc(products.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      const mapped = await hydrateProducts(database, rows);
      const [totalRow] = await database.select({ value: count() }).from(products).where(where);
      const counts = await countByStatus(database, query.ownerUserId);
      return { products: mapped, total: totalRow?.value ?? 0, counts };
    },
    async findByOwnerAndId(input) {
      const [row] = await database
        .select()
        .from(products)
        .where(and(eq(products.ownerUserId, input.ownerUserId), eq(products.id, input.productId)))
        .limit(1);
      if (!row) return null;
      const [product] = await hydrateProducts(database, [row]);
      return product ?? null;
    },
    async create(input) {
      return database.transaction(async (tx) => insertProduct(tx, input));
    },
    async update(input) {
      return database.transaction(async (tx) => {
        const [row] = await tx
          .update(products)
          .set(toProductUpdateRow(input.patch, input.now))
          .where(and(eq(products.ownerUserId, input.ownerUserId), eq(products.id, input.productId)))
          .returning();
        if (!row) return null;
        if (hasChildPatch(input.patch)) {
          await replaceChildren(tx, row.id, input.patch);
        }
        const [product] = await hydrateProducts(tx, [row]);
        return product ?? null;
      });
    },
    async duplicate(input) {
      return database.transaction(async (tx) => {
        const [sourceRow] = await tx
          .select()
          .from(products)
          .where(and(eq(products.ownerUserId, input.ownerUserId), eq(products.id, input.productId)))
          .limit(1);
        if (!sourceRow) return null;
        const [source] = await hydrateProducts(tx, [sourceRow]);
        if (!source) return null;
        return insertProduct(tx, {
          ...source,
          title: `${source.title} (копия)`,
          status: "draft",
          now: input.now
        });
      });
    }
  };
}
```

Complete the helper functions in the same file:

- `insertProduct(tx, input)` inserts the primary row and all child rows.
- `replaceChildren(tx, productId, patch)` deletes and reinserts only child groups present in the patch.
- `hydrateProducts(tx, rows)` loads child rows by `productId` and returns domain `Product[]`.
- `countByStatus(tx, ownerUserId)` returns `{ all, active, draft, archived }`.
- `toProductInsertRow(input)` maps domain fields to table columns.
- `toProductUpdateRow(patch, now)` maps defined patch fields and always sets `updatedAt`.

Do not import from `apps/*`. Do not put business rules in SQL helper functions beyond
owner scoping and persistence integrity.

Create `packages/db/src/adapters/products/index.ts`:

```ts
export * from "./drizzle-products-store";
```

Modify `packages/db/src/adapters/index.ts`:

```ts
export * from "./dictionary";
export * from "./identity";
export * from "./notifications";
export * from "./outbox";
export * from "./products";
```

If the current file has a different order, add only `export * from "./products";`.

Modify `packages/db/package.json` by adding these exports next to the existing
dictionary adapter exports:

```json
"./products": {
  "types": "./dist/adapters/products/index.d.ts",
  "import": "./dist/adapters/products/index.js",
  "require": "./dist/adapters/products/index.js"
},
"./adapters/products": {
  "types": "./dist/adapters/products/index.d.ts",
  "import": "./dist/adapters/products/index.js",
  "require": "./dist/adapters/products/index.js"
}
```

- [ ] **Step 4: Run adapter integration tests**

Run:

```bash
pnpm test:integration -- packages/db/src/adapters/products/drizzle-products-store.integration.ts
```

Expected: PASS.

- [ ] **Step 5: Commit adapter**

```bash
git add packages/db/src/adapters/products packages/db/src/adapters/index.ts packages/db/package.json
git commit -m "feat(db): add product store adapter"
```

---

### Task 5: Add Astrologer API Products Module

**Files:**
- Create: `apps/astrologer-api/src/modules/products/products.tokens.ts`
- Create: `apps/astrologer-api/src/modules/products/null-product-analytics-reader.ts`
- Create: `apps/astrologer-api/src/modules/products/products.service.ts`
- Create: `apps/astrologer-api/src/modules/products/products.controller.ts`
- Create: `apps/astrologer-api/src/modules/products/products.module.ts`
- Create: `apps/astrologer-api/src/modules/products/products.service.test.ts`
- Create: `apps/astrologer-api/src/modules/products/products.e2e.test.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/astrologer-api/src/modules/products/products.service.test.ts` covering:

```ts
it("creates products for the current astrologer and returns null analytics", async () => {
  const service = createProductsServiceWithInMemoryStore();
  const response = await service.createProduct(validCreateBody, astrologerRequest);

  expect(response.ownerUserId).toBe(astrologerRequest.currentAstrologerAccount.account.id);
  expect(response.analytics).toEqual({
    salesCount: 0,
    grossRevenueMinor: 0,
    currency: "RUB",
    averageRating: null,
    reviewsCount: 0
  });
});

it("maps invalid body to BadRequestException", async () => {
  const service = createProductsServiceWithInMemoryStore();
  await expect(service.createProduct({ title: "" }, astrologerRequest)).rejects.toMatchObject({
    status: 400
  });
});

it("maps missing products to NotFoundException", async () => {
  const service = createProductsServiceWithInMemoryStore();
  await expect(
    service.getProduct("11111111-1111-4111-8111-111111111111", astrologerRequest)
  ).rejects.toMatchObject({ status: 404 });
});
```

Use the existing dictionary service test style for Nest exception assertions and
session request factories.

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
pnpm test -- apps/astrologer-api/src/modules/products/products.service.test.ts
```

Expected: FAIL because the products module does not exist.

- [ ] **Step 3: Implement tokens and null analytics**

Create `apps/astrologer-api/src/modules/products/products.tokens.ts`:

```ts
export const PRODUCT_STORE = Symbol("PRODUCT_STORE");
export const PRODUCT_ANALYTICS_READER = Symbol("PRODUCT_ANALYTICS_READER");
```

Create `apps/astrologer-api/src/modules/products/null-product-analytics-reader.ts`:

```ts
import type { ProductAnalyticsReader, ProductLifetimeAnalytics } from "@elevenhouse/domain";

export class NullProductAnalyticsReader implements ProductAnalyticsReader {
  async getLifetimeAnalytics(input: {
    readonly productIds: readonly string[];
  }): Promise<ReadonlyMap<string, ProductLifetimeAnalytics>> {
    return new Map(
      input.productIds.map((productId) => [
        productId,
        {
          productId,
          salesCount: 0,
          grossRevenueMinor: 0,
          currency: "RUB",
          averageRating: null,
          reviewsCount: 0
        }
      ])
    );
  }
}
```

- [ ] **Step 4: Implement service**

Create `apps/astrologer-api/src/modules/products/products.service.ts`:

```ts
import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ZodType } from "@elevenhouse/validation";
import {
  archiveProduct,
  createProduct,
  duplicateProduct,
  getProduct,
  listProducts,
  moveProductToDraft,
  ProductNotFoundError,
  publishProduct,
  updateProduct,
  type Product,
  type ProductAnalyticsReader,
  type ProductCreateInput,
  type ProductStore
} from "@elevenhouse/domain";
import {
  createProductRequestSchema,
  listProductsQuerySchema,
  listProductsResponseSchema,
  productIdParamSchema,
  productResponseSchema,
  productSummaryResponseSchema,
  updateProductRequestSchema,
  type ListProductsResponse,
  type ProductResponse,
  type ProductSummaryResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PRODUCT_ANALYTICS_READER, PRODUCT_STORE } from "./products.tokens";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_STORE) private readonly store: ProductStore,
    @Inject(PRODUCT_ANALYTICS_READER) private readonly analyticsReader: ProductAnalyticsReader,
    private readonly clock: SystemClock
  ) {}

  async listProducts(query: unknown, request: AstrologerSessionRequest): Promise<ListProductsResponse> {
    const parsedQuery = parseContract(listProductsQuerySchema, query);
    const ownerUserId = requireOwnerUserId(request);
    const result = await listProducts({ store: this.store, ownerUserId, ...parsedQuery });
    const products = await this.mapProducts(ownerUserId, result.products);
    return listProductsResponseSchema.parse({ ...result, products });
  }

  async getProduct(productId: string, request: AstrologerSessionRequest): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const ownerUserId = requireOwnerUserId(request);
    return mapProductErrors(async () => {
      const product = await getProduct({ store: this.store, ownerUserId, productId: params.productId });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  async getSummary(request: AstrologerSessionRequest): Promise<ProductSummaryResponse> {
    const ownerUserId = requireOwnerUserId(request);
    const result = await listProducts({
      store: this.store,
      ownerUserId,
      status: "all",
      limit: 200,
      offset: 0
    });
    const analytics = await this.analyticsReader.getLifetimeAnalytics({
      ownerUserId,
      productIds: result.products.map((product) => product.id)
    });
    const totalSalesCount = [...analytics.values()].reduce((sum, item) => sum + item.salesCount, 0);
    const grossRevenueMinor = [...analytics.values()].reduce((sum, item) => sum + item.grossRevenueMinor, 0);
    const bestseller = result.products
      .map((product) => ({ product, metrics: analytics.get(product.id) }))
      .filter((entry) => (entry.metrics?.salesCount ?? 0) > 0)
      .sort((a, b) => (b.metrics?.salesCount ?? 0) - (a.metrics?.salesCount ?? 0))[0];
    return productSummaryResponseSchema.parse({
      total: result.counts.all,
      active: result.counts.active,
      draft: result.counts.draft,
      archived: result.counts.archived,
      totalSalesCount,
      grossRevenueMinor,
      currency: "RUB",
      bestseller: bestseller
        ? {
            productId: bestseller.product.id,
            title: bestseller.product.title,
            salesCount: bestseller.metrics?.salesCount ?? 0
          }
        : null
    });
  }

  async createProduct(body: unknown, request: AstrologerSessionRequest): Promise<ProductResponse> {
    const parsedBody = parseContract(createProductRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    const now = this.clock.now().toISOString();
    const product = await createProduct({
      store: this.store,
      input: { ...parsedBody, ownerUserId, now } as ProductCreateInput
    });
    const [response] = await this.mapProducts(ownerUserId, [product]);
    return productResponseSchema.parse(response);
  }

  async updateProduct(productId: string, body: unknown, request: AstrologerSessionRequest): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const patch = parseContract(updateProductRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    return mapProductErrors(async () => {
      const product = await updateProduct({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        patch,
        now: this.clock.now().toISOString()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  publishProduct(productId: string, request: AstrologerSessionRequest): Promise<ProductResponse> {
    return this.transitionProduct(productId, request, publishProduct);
  }

  moveProductToDraft(productId: string, request: AstrologerSessionRequest): Promise<ProductResponse> {
    return this.transitionProduct(productId, request, moveProductToDraft);
  }

  archiveProduct(productId: string, request: AstrologerSessionRequest): Promise<ProductResponse> {
    return this.transitionProduct(productId, request, archiveProduct);
  }

  async duplicateProduct(productId: string, request: AstrologerSessionRequest): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const ownerUserId = requireOwnerUserId(request);
    return mapProductErrors(async () => {
      const product = await duplicateProduct({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        now: this.clock.now().toISOString()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  private async transitionProduct(
    productId: string,
    request: AstrologerSessionRequest,
    transition: (input: {
      readonly store: ProductStore;
      readonly ownerUserId: string;
      readonly productId: string;
      readonly now: string;
    }) => Promise<Product>
  ): Promise<ProductResponse> {
    const params = parseContract(productIdParamSchema, { productId });
    const ownerUserId = requireOwnerUserId(request);
    return mapProductErrors(async () => {
      const product = await transition({
        store: this.store,
        ownerUserId,
        productId: params.productId,
        now: this.clock.now().toISOString()
      });
      const [response] = await this.mapProducts(ownerUserId, [product]);
      return productResponseSchema.parse(response);
    });
  }

  private async mapProducts(ownerUserId: string, products: readonly Product[]): Promise<ProductResponse[]> {
    const analytics = await this.analyticsReader.getLifetimeAnalytics({
      ownerUserId,
      productIds: products.map((product) => product.id)
    });
    return products.map((product) => ({
      ...product,
      analytics: analytics.get(product.id) ?? {
        productId: product.id,
        salesCount: 0,
        grossRevenueMinor: 0,
        currency: "RUB",
        averageRating: null,
        reviewsCount: 0
      }
    }));
  }
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }
  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException("Invalid product request");
  }
  return result.data;
}

async function mapProductErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      throw new NotFoundException("Product not found");
    }
    throw error;
  }
}
```

- [ ] **Step 5: Implement controller and module**

Create `apps/astrologer-api/src/modules/products/products.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ProductsService } from "./products.service";

@Controller("products")
@UseGuards(AstrologerSessionAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  listProducts(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.productsService.listProducts(query, request);
  }

  @Get("summary")
  getSummary(@Req() request: AstrologerSessionRequest) {
    return this.productsService.getSummary(request);
  }

  @Get(":productId")
  getProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.getProduct(productId, request);
  }

  @Post()
  @RequireCsrf()
  createProduct(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.productsService.createProduct(body, request);
  }

  @Put(":productId")
  @RequireCsrf()
  updateProduct(
    @Param("productId") productId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.productsService.updateProduct(productId, body, request);
  }

  @Post(":productId/publish")
  @RequireCsrf()
  publishProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.publishProduct(productId, request);
  }

  @Post(":productId/move-to-draft")
  @RequireCsrf()
  moveProductToDraft(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.moveProductToDraft(productId, request);
  }

  @Post(":productId/archive")
  @RequireCsrf()
  archiveProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.archiveProduct(productId, request);
  }

  @Post(":productId/duplicate")
  @RequireCsrf()
  duplicateProduct(@Param("productId") productId: string, @Req() request: AstrologerSessionRequest) {
    return this.productsService.duplicateProduct(productId, request);
  }
}
```

Create `apps/astrologer-api/src/modules/products/products.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { createDrizzleProductStore } from "@elevenhouse/db/products";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { NullProductAnalyticsReader } from "./null-product-analytics-reader";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { PRODUCT_ANALYTICS_READER, PRODUCT_STORE } from "./products.tokens";

@Module({
  imports: [ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    {
      provide: PRODUCT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleProductStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PRODUCT_ANALYTICS_READER,
      useClass: NullProductAnalyticsReader
    }
  ]
})
export class ProductsModule {}
```

Modify `apps/astrologer-api/src/app.module.ts`:

```ts
import { ProductsModule } from "./modules/products/products.module";
```

Add `ProductsModule` to the `imports` array.

- [ ] **Step 6: Write e2e tests**

Create `apps/astrologer-api/src/modules/products/products.e2e.test.ts` by following
the identity/dictionary e2e test setup. Cover:

- unauthenticated `GET /products` returns 401;
- authenticated `GET /products` returns empty list and counts;
- authenticated `POST /products` without CSRF returns 403;
- authenticated `POST /products` with CSRF creates draft product;
- `POST /products/:id/publish` changes status to active;
- `POST /products/:id/archive` changes status to archived;
- `POST /products/:id/duplicate` creates a draft copy;
- `GET /products/summary` returns counts and zero/null analytics.

- [ ] **Step 7: Run API tests**

Run:

```bash
pnpm test -- apps/astrologer-api/src/modules/products/products.service.test.ts apps/astrologer-api/src/modules/products/products.e2e.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit API module**

```bash
git add apps/astrologer-api/src/modules/products apps/astrologer-api/src/app.module.ts
git commit -m "feat(astrologer-api): add products module"
```

---

### Task 6: Update API Boundary Docs

**Files:**
- Modify: `docs/api/api-boundaries.md`

- [ ] **Step 1: Update the backend surface wording**

Edit `docs/api/api-boundaries.md` so authenticated astrologer workflows reference
`astrologer-api` and internal workflows reference `admin-api`. Keep `ops-api` only as
transitional context.

Add this section near the Ops API section:

```md
## Astrologer API

`astrologer-api` обслуживает authenticated workflows астрологов.

Ответственности:

- Profile и onboarding.
- Products.
- Availability.
- Bookings.
- Clients.
- Sessions и materials.
- Wallet/finance views.
- Analytics.

Примеры routes:

- `/products`
- `/products/summary`
- `/products/:productId`
- `/products/:productId/publish`
- `/products/:productId/archive`

`ops-api` является transitional implementation для старых authenticated workflows и
не должен получать новые admin/moderator/super_admin workflows. Новые внутренние
роли должны жить в `admin-api`.
```

- [ ] **Step 2: Check docs for contradictions**

Run:

```bash
rg -n "ops-api|astrologer-api|admin-api|/astrologer/products|/products" docs/api/api-boundaries.md docs/architecture docs/decisions
```

Expected: output may still include historical ADR references to `ops-api`, but
`docs/api/api-boundaries.md` must explicitly state the active `astrologer-api` and
`admin-api` split.

- [ ] **Step 3: Commit docs**

```bash
git add docs/api/api-boundaries.md docs/superpowers/specs/2026-07-02-astrologer-products-backend-design.md docs/superpowers/plans/2026-07-02-astrologer-products-backend.md
git commit -m "docs: plan astrologer products backend"
```

---

### Task 7: Full Verification

**Files:**
- No source edits unless verification exposes a defect from previous tasks.

- [ ] **Step 1: Run package tests touched by this feature**

Run:

```bash
pnpm test -- packages/contracts/src/products.test.ts packages/contracts/src/index.test.ts
pnpm test -- packages/domain/src/products/product-use-cases.test.ts packages/domain/src/index.test.ts
pnpm test -- packages/db/src/schema.test.ts
pnpm test:integration -- packages/db/src/adapters/products/drizzle-products-store.integration.ts
pnpm test -- apps/astrologer-api/src/modules/products/products.service.test.ts apps/astrologer-api/src/modules/products/products.e2e.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck for touched packages**

Run:

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: PASS.

- [ ] **Step 3: Run repository verification if local services allow it**

Run:

```bash
pnpm verify
```

Expected: PASS.

If integration tests or `verify` need a local PostgreSQL service that is not already
running, do not start Docker or database processes. Report the missing service and
stop, because repository instructions require explicit user permission before
starting local long-running processes.

- [ ] **Step 4: Review product analytics boundary**

Run:

```bash
rg -n "salesCount|grossRevenueMinor|averageRating|reviewsCount" packages apps
```

Expected:

- contracts and response mapping include analytics fields;
- `NullProductAnalyticsReader` returns zero/null values;
- no product command writes sales, revenue or rating fields into the product table.

- [ ] **Step 5: Final commit if verification fixes were needed**

If Step 1-4 required fixes, commit only those fixes:

```bash
git add <fixed-files>
git commit -m "fix: complete astrologer products verification"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage: contracts, domain, db schema, adapter, API module, null analytics and docs update are all represented.
- No product analytics data is stored in `products`.
- State-changing routes use CSRF and avoid idempotency until product commands create booking/order/payment state.
- `packages/domain` does not import `packages/db`.
- `packages/db` does not import from `apps/*`.
- No local dev servers, Docker containers or databases are started by the plan.
- DB schema changes follow the repository rule: regenerate migration and run local `db:reset`.
