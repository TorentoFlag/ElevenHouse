import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createProduct,
  duplicateProduct,
  listProducts,
  publishProduct,
  updateProduct,
  type ProductCreateInput
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleProductStore } from "./index";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("products Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({
    DATABASE_URL: databaseUrl
  });

  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
    } finally {
      await runtime.close();
    }
  });

  it("creates, reads, updates, lists and duplicates owner-scoped products", async () => {
    const store = createDrizzleProductStore(runtime.database);
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    ownerUserIds.push(ownerUserId, otherOwnerUserId);

    const product = await createProduct({
      store,
      input: createProductInput(ownerUserId),
      now: new Date("2026-07-02T00:00:00.000Z")
    });

    expect(product.id).toMatch(/[0-9a-f-]{36}/);
    expect(product.status).toBe("draft");
    expect(product.includedItems[0]).toMatchObject({
      text: "Полный разбор карты",
      icon: "check",
      order: 10
    });
    expect(product.modifiers[0]).toMatchObject({
      label: "PDF-резюме",
      priceMinor: 99000,
      kind: "fixed"
    });
    await expect(
      store.findByOwnerAndId({ ownerUserId: otherOwnerUserId, productId: product.id })
    ).resolves.toBeNull();

    const active = await publishProduct({
      store,
      ownerUserId,
      productId: product.id,
      now: new Date("2026-07-02T00:05:00.000Z")
    });
    expect(active.status).toBe("active");

    const updated = await updateProduct({
      store,
      ownerUserId,
      productId: product.id,
      patch: {
        title: "Натальный разбор 2",
        deliveryFormats: ["video", "audio"],
        requiredClientData: ["chart1", "question"],
        methods: ["natal", "forecast"],
        accessGrants: ["records"],
        includedItems: [
          { text: "Запись сессии", icon: "play", order: 20 },
          { text: "PDF-резюме", icon: "file", order: 30 }
        ],
        modifiers: [
          {
            label: "Срочная подготовка",
            priceMinor: 150000,
            kind: "fixed",
            isEnabled: true,
            createsArtifact: false,
            order: 10
          }
        ]
      },
      now: new Date("2026-07-02T00:10:00.000Z")
    });
    expect(updated.title).toBe("Натальный разбор 2");
    expect(updated.deliveryFormats).toEqual(["video", "audio"]);
    expect(updated.requiredClientData).toEqual(["chart1", "question"]);
    expect(updated.methods).toEqual(["natal", "forecast"]);
    expect(updated.accessGrants).toEqual(["records"]);
    expect(updated.includedItems.map((item) => item.text)).toEqual([
      "Запись сессии",
      "PDF-резюме"
    ]);
    expect(updated.modifiers).toHaveLength(1);

    await expect(
      listProducts({
        store,
        ownerUserId,
        status: "active",
        limit: 50,
        offset: 0
      })
    ).resolves.toMatchObject({
      total: 1,
      counts: {
        all: 1,
        active: 1,
        draft: 0,
        archived: 0
      },
      products: [expect.objectContaining({ id: product.id, title: "Натальный разбор 2" })]
    });

    const copy = await duplicateProduct({
      store,
      ownerUserId,
      productId: product.id,
      now: new Date("2026-07-02T00:20:00.000Z")
    });
    expect(copy.id).not.toBe(product.id);
    expect(copy.status).toBe("draft");
    expect(copy.title).toBe("Натальный разбор 2 (копия)");
    expect(copy.deliveryFormats).toEqual(updated.deliveryFormats);
    expect(copy.includedItems.map((item) => item.id)).not.toContain(updated.includedItems[0]?.id);

    await expect(
      listProducts({
        store,
        ownerUserId,
        status: "all",
        limit: 50,
        offset: 0
      })
    ).resolves.toMatchObject({
      total: 2,
      counts: {
        all: 2,
        active: 1,
        draft: 1,
        archived: 0
      }
    });
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );

    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }
});

function createProductInput(ownerUserId: string): ProductCreateInput {
  return {
    ownerUserId,
    type: "single",
    title: `Натальный разбор ${randomUUID()}`,
    subtitle: "Полный разбор",
    priceMinor: 490000,
    currency: "RUB",
    coverMediaId: null,
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
    includedItems: [{ text: "Полный разбор карты", icon: "check", order: 10 }],
    modifiers: [
      {
        label: "PDF-резюме",
        priceMinor: 99000,
        kind: "fixed",
        isEnabled: true,
        createsArtifact: true,
        order: 10
      }
    ]
  };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }

  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "run integration tests against"
  );
}

function raise(message: string): never {
  throw new Error(message);
}
