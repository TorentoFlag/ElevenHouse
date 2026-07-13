import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProductTemplatePayload } from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleProductTemplateStore } from "./drizzle-product-template-store";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("product templates Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const templateCodes: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      await runtime.pool.query("delete from product_templates where code = any($1)", [
        templateCodes
      ]);
    } finally {
      await runtime.close();
    }
  });

  it("lists and finds only active templates in the requested locale", async () => {
    const code = `integration_${randomUUID().replaceAll("-", "")}`;
    templateCodes.push(code);
    const payload = createTemplatePayload();

    await Promise.all([
      insertTemplate({ code, locale: "ru", status: "active", title: "Тестовый шаблон", payload }),
      insertTemplate({ code, locale: "en", status: "active", title: "Test template", payload }),
      insertTemplate({
        code: `${code}_archived`,
        locale: "ru",
        status: "archived",
        title: "Архивный шаблон",
        payload
      })
    ]);
    templateCodes.push(`${code}_archived`);

    const store = createDrizzleProductTemplateStore(runtime.database);
    const russianTemplates = await store.listActiveByLocale({ locale: "ru" });
    const russianTemplate = russianTemplates.find((template) => template.code === code);

    expect(russianTemplate).toMatchObject({
      code,
      locale: "ru",
      status: "active",
      title: "Тестовый шаблон",
      payload
    });
    await expect(store.findActiveByCodeAndLocale({ code, locale: "en" })).resolves.toMatchObject({
      title: "Test template",
      locale: "en"
    });
    await expect(
      store.findActiveByCodeAndLocale({ code: `${code}_archived`, locale: "ru" })
    ).resolves.toBeNull();
  });

  async function insertTemplate(input: {
    readonly code: string;
    readonly locale: "ru" | "en";
    readonly status: "active" | "archived";
    readonly title: string;
    readonly payload: ProductTemplatePayload;
  }): Promise<void> {
    await runtime.pool.query(
      `insert into product_templates
        (code, locale, type, status, title, sort_order, payload)
       values ($1, $2, 'single', $3, $4, 999, $5::jsonb)`,
      [input.code, input.locale, input.status, input.title, JSON.stringify(input.payload)]
    );
  }
});

function createTemplatePayload(): ProductTemplatePayload {
  return {
    type: "single",
    title: "Template draft",
    priceMinor: 10000,
    currency: "RUB",
    executionMode: "live",
    paymentModel: "once",
    durationMinutes: 60,
    durationLabel: "60 min",
    participantMode: "solo",
    deliveryFormats: ["video"],
    requiredClientData: ["question"],
    methods: [],
    accessGrants: [],
    includedItems: [{ text: "Session", icon: "video", order: 10 }],
    modifiers: []
  };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }

  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}
