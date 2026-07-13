import { describe, expect, it } from "vitest";
import {
  archiveProduct,
  createProductFromTemplate,
  createProduct,
  duplicateProduct,
  getProduct,
  listProductTemplates,
  listProducts,
  moveProductToDraft,
  ProductNotFoundError,
  ProductTemplateNotFoundError,
  ProductTemplateValidationError,
  ProductValidationError,
  publishProduct,
  updateProduct,
  type Product,
  type ProductCreateInput,
  type ProductStore,
  type ProductTemplate,
  type ProductTemplateStore,
  type ProductUpdatePatch
} from "./index";

const now = new Date("2026-07-02T00:00:00.000Z");

const baseInput: ProductCreateInput = {
  ownerUserId: "owner-1",
  type: "single",
  title: "Натальный разбор",
  subtitle: "Полный разбор",
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
  includedItems: [{ text: "Полный разбор карты", icon: "check", order: 10 }],
  modifiers: []
};

class InMemoryProductStore implements ProductStore {
  private products: Product[] = [];
  private nextId = 1;
  private nextChildId = 1;

  async listByOwner(query: Parameters<ProductStore["listByOwner"]>[0]) {
    const owned = this.products.filter((product) => product.ownerUserId === query.ownerUserId);
    const filtered =
      query.status === "all" ? owned : owned.filter((product) => product.status === query.status);

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

  async findByOwnerAndId(input: Parameters<ProductStore["findByOwnerAndId"]>[0]) {
    return (
      this.products.find(
        (product) => product.ownerUserId === input.ownerUserId && product.id === input.productId
      ) ?? null
    );
  }

  async create(input: Parameters<ProductStore["create"]>[0]) {
    const { now, ...productInput } = input;
    const product: Product = {
      ...productInput,
      id: `product-${this.nextId++}`,
      includedItems: input.includedItems.map((item) => ({
        ...item,
        id: `child-${this.nextChildId++}`
      })),
      modifiers: input.modifiers.map((modifier) => ({
        ...modifier,
        id: `child-${this.nextChildId++}`
      })),
      createdAt: now,
      updatedAt: now
    };
    this.products.unshift(product);
    return product;
  }

  async update(input: Parameters<ProductStore["update"]>[0]) {
    const index = this.products.findIndex(
      (product) => product.ownerUserId === input.ownerUserId && product.id === input.productId
    );
    if (index === -1) return null;

    const current = this.products[index];
    if (!current) return null;
    const patch = materializePatch(input.patch, () => `child-${this.nextChildId++}`);
    const next: Product = { ...current, ...(patch as Partial<Product>), updatedAt: input.now };
    this.products[index] = next;
    return next;
  }

  async duplicate(input: Parameters<ProductStore["duplicate"]>[0]) {
    return this.create(input);
  }
}

describe("product use cases", () => {
  it("creates draft products and lists them by owner", async () => {
    const store = new InMemoryProductStore();
    await createProduct({ store, input: baseInput, now });

    const result = await listProducts({
      store,
      ownerUserId: "owner-1",
      status: "all",
      limit: 50,
      offset: 0
    });

    expect(result.total).toBe(1);
    expect(result.products[0]?.status).toBe("draft");
    expect(result.products[0]?.createdAt).toBe("2026-07-02T00:00:00.000Z");
  });

  it("does not expose products owned by another astrologer", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({ store, input: baseInput, now });

    await expect(
      getProduct({
        store,
        ownerUserId: "owner-2",
        productId: product.id
      })
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("publishes, moves to draft and archives through explicit transitions", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({ store, input: baseInput, now });

    const active = await publishProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      now: new Date("2026-07-02T00:10:00.000Z")
    });
    const draft = await moveProductToDraft({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      now: new Date("2026-07-02T00:15:00.000Z")
    });
    const archived = await archiveProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      now: new Date("2026-07-02T00:20:00.000Z")
    });

    expect(active.status).toBe("active");
    expect(draft.status).toBe("draft");
    expect(archived.status).toBe("archived");
  });

  it("updates product fields without changing analytics-owned data", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({ store, input: baseInput, now });

    const updated = await updateProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      patch: { title: "Синастрия", priceMinor: 540000 },
      now: new Date("2026-07-02T00:30:00.000Z")
    });

    expect(updated.title).toBe("Синастрия");
    expect(updated.priceMinor).toBe(540000);
    expect(updated.updatedAt).toBe("2026-07-02T00:30:00.000Z");
  });

  it("clears nullable fields during partial updates", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({ store, input: baseInput, now });

    const updated = await updateProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      patch: {
        subtitle: null,
        introVideoUrl: null,
        durationMinutes: null
      },
      now: new Date("2026-07-02T00:32:00.000Z")
    });

    expect(updated.subtitle).toBeNull();
    expect(updated.introVideoUrl).toBeNull();
    expect(updated.durationMinutes).toBeNull();
  });

  it("rejects duplicate enum arrays before persistence unique constraints", async () => {
    const store = new InMemoryProductStore();

    await expect(
      createProduct({
        store,
        input: { ...baseInput, deliveryFormats: ["video", "video"] },
        now
      })
    ).rejects.toBeInstanceOf(ProductValidationError);
  });

  it("validates the materialized product state during partial updates", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({ store, input: baseInput, now });

    await expect(
      updateProduct({
        store,
        ownerUserId: "owner-1",
        productId: product.id,
        patch: { paymentModel: "pack" },
        now: new Date("2026-07-02T00:34:00.000Z")
      })
    ).rejects.toBeInstanceOf(ProductValidationError);
  });

  it("duplicates products into draft status", async () => {
    const store = new InMemoryProductStore();
    const product = await createProduct({
      store,
      input: baseInput,
      now
    });
    await publishProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      now: new Date("2026-07-02T00:35:00.000Z")
    });

    const copy = await duplicateProduct({
      store,
      ownerUserId: "owner-1",
      productId: product.id,
      title: "Natal reading (copy)",
      now: new Date("2026-07-02T00:40:00.000Z")
    });

    expect(copy.id).not.toBe(product.id);
    expect(copy.status).toBe("draft");
    expect(copy.title).toBe("Natal reading (copy)");
    expect(copy.includedItems[0]?.id).not.toBe(product.includedItems[0]?.id);
  });

  it("lists active product templates by locale", async () => {
    const templateStore = new InMemoryProductTemplateStore([
      createProductTemplate({ code: "individual_consultation", locale: "ru", status: "active" }),
      createProductTemplate({ code: "individual_consultation", locale: "en", status: "active" }),
      createProductTemplate({ code: "archived_template", locale: "ru", status: "archived" })
    ]);

    await expect(listProductTemplates({ store: templateStore, locale: "ru" })).resolves.toEqual([
      expect.objectContaining({
        code: "individual_consultation",
        locale: "ru",
        status: "active"
      })
    ]);
  });

  it("creates an owner draft product from an active product template", async () => {
    const store = new InMemoryProductStore();
    const templateStore = new InMemoryProductTemplateStore([
      createProductTemplate({
        code: "individual_consultation",
        locale: "ru",
        payload: {
          ...baseTemplatePayload(),
          title: "Индивидуальная консультация",
          methods: []
        }
      })
    ]);

    const product = await createProductFromTemplate({
      productStore: store,
      templateStore,
      ownerUserId: "owner-2",
      templateCode: "individual_consultation",
      locale: "ru",
      now
    });

    expect(product).toMatchObject({
      ownerUserId: "owner-2",
      status: "draft",
      title: "Индивидуальная консультация",
      methods: []
    });
  });

  it("normalizes omitted optional template payload fields before draft creation", async () => {
    const store = new InMemoryProductStore();
    const templateStore = new InMemoryProductTemplateStore([
      createProductTemplate({
        code: "quick_answer",
        locale: "ru",
        type: "mini",
        payload: {
          type: "mini",
          title: "Быстрый ответ",
          subtitle: "Короткий формат",
          priceMinor: 150000,
          currency: "RUB",
          executionMode: "instant",
          paymentModel: "once",
          participantMode: "solo",
          deliveryFormats: ["chat"],
          requiredClientData: ["question"],
          methods: [],
          accessGrants: [],
          includedItems: [{ text: "Один вопрос", icon: "chat", order: 10 }],
          modifiers: []
        } as ProductTemplate["payload"]
      })
    ]);

    const product = await createProductFromTemplate({
      productStore: store,
      templateStore,
      ownerUserId: "owner-2",
      templateCode: "quick_answer",
      locale: "ru",
      now
    });

    expect(product).toMatchObject({
      type: "mini",
      title: "Быстрый ответ",
      coverMediaId: null,
      introVideoUrl: null,
      durationMinutes: null,
      packageSessionCount: null,
      subscriptionPeriod: null,
      groupSize: null
    });
  });

  it("does not create products from missing or archived templates", async () => {
    const store = new InMemoryProductStore();
    const templateStore = new InMemoryProductTemplateStore([
      createProductTemplate({ code: "archived_template", locale: "ru", status: "archived" })
    ]);

    await expect(
      createProductFromTemplate({
        productStore: store,
        templateStore,
        ownerUserId: "owner-1",
        templateCode: "archived_template",
        locale: "ru",
        now
      })
    ).rejects.toBeInstanceOf(ProductTemplateNotFoundError);
  });

  it("rejects template payloads that reference account-owned media", async () => {
    const store = new InMemoryProductStore();
    const templateStore = new InMemoryProductTemplateStore([
      createProductTemplate({
        code: "unsafe_media_template",
        locale: "ru",
        payload: {
          ...baseTemplatePayload(),
          coverMediaId: "11111111-1111-4111-8111-111111111111"
        }
      })
    ]);

    await expect(
      createProductFromTemplate({
        productStore: store,
        templateStore,
        ownerUserId: "owner-1",
        templateCode: "unsafe_media_template",
        locale: "ru",
        now
      })
    ).rejects.toBeInstanceOf(ProductTemplateValidationError);
  });
});

class InMemoryProductTemplateStore implements ProductTemplateStore {
  constructor(private readonly templates: ProductTemplate[]) {}

  async listActiveByLocale(input: Parameters<ProductTemplateStore["listActiveByLocale"]>[0]) {
    return this.templates
      .filter((template) => template.locale === input.locale && template.status === "active")
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async findActiveByCodeAndLocale(
    input: Parameters<ProductTemplateStore["findActiveByCodeAndLocale"]>[0]
  ) {
    return (
      this.templates.find(
        (template) =>
          template.code === input.code &&
          template.locale === input.locale &&
          template.status === "active"
      ) ?? null
    );
  }
}

function createProductTemplate(
  overrides: Partial<ProductTemplate> & { readonly code: string; readonly locale: "ru" | "en" }
): ProductTemplate {
  return {
    id: `${overrides.locale}-${overrides.code}`,
    code: overrides.code,
    locale: overrides.locale,
    type: overrides.type ?? "single",
    status: overrides.status ?? "active",
    title: overrides.title ?? "Индивидуальная консультация",
    subtitle: overrides.subtitle ?? "Одна встреча с понятным результатом",
    description: overrides.description ?? "Универсальная экспертная сессия.",
    sortOrder: overrides.sortOrder ?? 10,
    payload: overrides.payload ?? {
      ...baseTemplatePayload(),
      methods: []
    },
    createdAt: overrides.createdAt ?? now.toISOString(),
    updatedAt: overrides.updatedAt ?? now.toISOString()
  };
}

function baseTemplatePayload(): ProductTemplate["payload"] {
  return Object.fromEntries(
    Object.entries(baseInput).filter(
      ([key, value]) => key !== "ownerUserId" && key !== "coverMediaId" && value !== null
    )
  ) as ProductTemplate["payload"];
}

function materializePatch(patch: ProductUpdatePatch, createId: () => string): Partial<Product> {
  const { includedItems, modifiers, ...rest } = patch;
  return {
    ...rest,
    ...(includedItems
      ? { includedItems: includedItems.map((item) => ({ ...item, id: createId() })) }
      : {}),
    ...(modifiers
      ? { modifiers: modifiers.map((modifier) => ({ ...modifier, id: createId() })) }
      : {})
  };
}
