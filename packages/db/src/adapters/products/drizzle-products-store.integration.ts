import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
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
import {
  astroDiaryProductIntegrityConstraintName,
  astroDiaryProductIntegrityTriggerTables
} from "../../schema/products";
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
    expect(product.revision).toBe(1);
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
      expectedRevision: 1,
      now: new Date("2026-07-02T00:05:00.000Z")
    });
    expect(active.status).toBe("active");
    expect(active.revision).toBe(2);

    const updated = await updateProduct({
      store,
      ownerUserId,
      productId: product.id,
      expectedRevision: 2,
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
    expect(updated.revision).toBe(3);
    expect(updated.deliveryFormats).toEqual(["video", "audio"]);
    expect(updated.requiredClientData).toEqual(["chart1", "question"]);
    expect(updated.methods).toEqual(["natal", "forecast"]);
    expect(updated.accessGrants).toEqual(["records"]);
    expect(updated.includedItems.map((item) => item.text)).toEqual(["Запись сессии", "PDF-резюме"]);
    expect(updated.modifiers).toHaveLength(1);

    await expect(
      store.update({
        ownerUserId,
        productId: product.id,
        expectedRevision: 2,
        patch: { title: "Stale direct update" },
        now: "2026-07-02T00:11:00.000Z"
      })
    ).resolves.toEqual({ outcome: "revision_conflict", currentRevision: 3 });
    await expect(
      store.update({
        ownerUserId,
        productId: randomUUID(),
        expectedRevision: 1,
        patch: { title: "Missing product" },
        now: "2026-07-02T00:12:00.000Z"
      })
    ).resolves.toEqual({ outcome: "not_found" });

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
      expectedRevision: 3,
      now: new Date("2026-07-02T00:20:00.000Z")
    });
    expect(copy.id).not.toBe(product.id);
    expect(copy.status).toBe("draft");
    expect(copy.revision).toBe(1);
    expect(copy.title).toBe("Натальный разбор 2");
    expect(copy.deliveryFormats).toEqual(updated.deliveryFormats);
    expect(copy.includedItems.map((item) => item.id)).not.toContain(updated.includedItems[0]?.id);

    await expect(
      updateProduct({
        store,
        ownerUserId,
        productId: product.id,
        expectedRevision: 2,
        patch: { title: "Stale overwrite" },
        now: new Date("2026-07-02T00:21:00.000Z")
      })
    ).rejects.toThrow("Product revision conflict");

    const astroDiary = await createProduct({
      store,
      input: {
        ...createProductInput(ownerUserId),
        type: "sub",
        title: `Астродневник ${randomUUID()}`,
        executionMode: "async",
        paymentModel: "sub",
        durationMinutes: null,
        durationLabel: null,
        subscriptionPeriod: "month",
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
      },
      now: new Date("2026-07-02T00:22:00.000Z")
    });
    expect(astroDiary.astroDiaryConfig).toEqual({
      reflectionCyclesPerPeriod: 12,
      responseSlaWorkingDays: 2,
      clientResponseWindowCalendarDays: 7,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: "Europe/Moscow"
    });

    await expect(
      listProducts({
        store,
        ownerUserId,
        status: "all",
        limit: 50,
        offset: 0
      })
    ).resolves.toMatchObject({
      total: 3,
      counts: {
        all: 3,
        active: 1,
        draft: 2,
        archived: 0
      }
    });
  });

  it("allows exactly one of two concurrent CAS writers and never applies the stale child patch", async () => {
    const store = createDrizzleProductStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const product = await createProduct({
      store,
      input: createProductInput(ownerUserId),
      now: new Date("2026-07-02T01:00:00.000Z")
    });
    const candidates = [
      {
        title: "Concurrent writer A",
        deliveryFormats: ["video", "audio"] as const,
        now: "2026-07-02T01:01:00.000Z"
      },
      {
        title: "Concurrent writer B",
        deliveryFormats: ["video", "chat"] as const,
        now: "2026-07-02T01:02:00.000Z"
      }
    ];

    const outcomes = await Promise.all(
      candidates.map((candidate) =>
        store.update({
          ownerUserId,
          productId: product.id,
          expectedRevision: product.revision,
          patch: {
            title: candidate.title,
            deliveryFormats: candidate.deliveryFormats
          },
          now: candidate.now
        })
      )
    );

    const updated = outcomes.filter((outcome) => outcome.outcome === "updated");
    const conflicted = outcomes.filter((outcome) => outcome.outcome === "revision_conflict");
    expect(updated).toHaveLength(1);
    expect(conflicted).toEqual([{ outcome: "revision_conflict", currentRevision: 2 }]);

    const winningProduct = updated[0]?.outcome === "updated" ? updated[0].product : raise("winner");
    await expect(store.findByOwnerAndId({ ownerUserId, productId: product.id })).resolves.toMatchObject(
      {
        revision: 2,
        title: winningProduct.title,
        deliveryFormats: winningProduct.deliveryFormats
      }
    );
  });

  describe.skipIf(process.env.ASTRO_DIARY_PRODUCT_INTEGRITY_MIGRATION_READY !== "1")(
    "AstroDiary deferred product integrity migration",
    () => {
      beforeAll(async () => {
        await assertAstroDiaryProductIntegrityMigrationInstalled(runtime.pool);
      });

      it("rejects a sole journal grant without AstroDiary configuration at commit", async () => {
        const ownerUserId = await createUser();
        ownerUserIds.push(ownerUserId);

        await expectAstroDiaryConstraintViolation(runtime.pool, async (client) => {
          const productId = await insertRawAstroDiaryParent(client, ownerUserId, false);
          await insertRawAccessGrants(client, productId, ["journal"]);
          await insertRawDeliveryFormats(client, productId, ["chat", "audio", "file"]);
        });
      });

      it("rejects AstroDiary configuration without a sole journal grant at commit", async () => {
        const ownerUserId = await createUser();
        ownerUserIds.push(ownerUserId);

        await expectAstroDiaryConstraintViolation(runtime.pool, async (client) => {
          const productId = await insertRawAstroDiaryParent(client, ownerUserId, true);
          await insertRawDeliveryFormats(client, productId, ["chat", "audio", "file"]);
        });
      });

      it("rejects journal combined with another access grant at commit", async () => {
        const ownerUserId = await createUser();
        ownerUserIds.push(ownerUserId);

        await expectAstroDiaryConstraintViolation(runtime.pool, async (client) => {
          const productId = await insertRawAstroDiaryParent(client, ownerUserId, true);
          await insertRawAccessGrants(client, productId, ["journal", "records"]);
          await insertRawDeliveryFormats(client, productId, ["chat", "audio", "file"]);
        });
      });

      it("rejects an extra delivery format at commit", async () => {
        const ownerUserId = await createUser();
        ownerUserIds.push(ownerUserId);

        await expectAstroDiaryConstraintViolation(runtime.pool, async (client) => {
          const productId = await insertRawAstroDiaryParent(client, ownerUserId, true);
          await insertRawAccessGrants(client, productId, ["journal"]);
          await insertRawDeliveryFormats(client, productId, ["chat", "audio", "file", "text"]);
        });
      });

      it("rejects a price modifier at commit", async () => {
        const ownerUserId = await createUser();
        ownerUserIds.push(ownerUserId);

        await expectAstroDiaryConstraintViolation(runtime.pool, async (client) => {
          const productId = await insertRawAstroDiaryParent(client, ownerUserId, true);
          await insertRawAccessGrants(client, productId, ["journal"]);
          await insertRawDeliveryFormats(client, productId, ["chat", "audio", "file"]);
          await client.query(
            `insert into product_modifiers
              (product_id, label, price_minor, kind, is_enabled, creates_artifact, "order")
             values ($1, 'Forbidden modifier', 100, 'fixed', true, false, 0)`,
            [productId]
          );
        });
      });

      it("accepts a complete AstroDiary product assembled atomically in one transaction", async () => {
        const ownerUserId = await createUser();
        ownerUserIds.push(ownerUserId);
        const client = await runtime.pool.connect();

        try {
          await client.query("begin");
          const productId = await insertRawAstroDiaryParent(client, ownerUserId, true);
          await insertRawAccessGrants(client, productId, ["journal"]);
          await insertRawDeliveryFormats(client, productId, ["chat", "audio", "file"]);
          await client.query("commit");

          await expect(
            runtime.pool.query<{ id: string }>("select id from products where id = $1", [productId])
          ).resolves.toMatchObject({ rows: [{ id: productId }] });
        } catch (error) {
          await client.query("rollback").catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      });

      it("serializes a concurrent raw child mutation behind the parent Diary transition", async () => {
        const ownerUserId = await createUser();
        ownerUserIds.push(ownerUserId);
        const setupClient = await runtime.pool.connect();
        let productId: string;

        try {
          await setupClient.query("begin");
          productId = await insertRawAstroDiaryParent(setupClient, ownerUserId, false);
          await insertRawDeliveryFormats(setupClient, productId, ["chat", "audio", "file"]);
          await setupClient.query("commit");
        } catch (error) {
          await setupClient.query("rollback").catch(() => undefined);
          throw error;
        } finally {
          setupClient.release();
        }

        const childClient = await runtime.pool.connect();
        const diaryClient = await runtime.pool.connect();
        try {
          await childClient.query("begin");
          await diaryClient.query("begin");
          await childClient.query(
            `insert into product_methods (product_id, value, "order")
             values ($1, 'natal', 0)`,
            [productId]
          );
          await diaryClient.query(
            `update products
                set astro_diary_reflection_cycles_per_period = 12,
                    astro_diary_response_sla_working_days = 2,
                    astro_diary_client_response_window_calendar_days = 7,
                    astro_diary_working_weekdays_mask = 31,
                    astro_diary_service_timezone = 'Europe/Moscow',
                    revision = revision + 1,
                    updated_at = now()
              where id = $1`,
            [productId]
          );
          await insertRawAccessGrants(diaryClient, productId, ["journal"]);

          const [diaryCommit, childCommit] = await Promise.allSettled([
            diaryClient.query("commit"),
            childClient.query("commit")
          ]);

          const outcomes = [diaryCommit, childCommit];
          expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
          expect(outcomes.filter((outcome) => outcome.status === "rejected")).toEqual([
            expect.objectContaining({
              reason: expect.objectContaining({
                code: "23514",
                constraint: astroDiaryProductIntegrityConstraintName
              })
            })
          ]);
          const persisted = await runtime.pool.query<{
            config_count: string;
            grant_count: string;
            method_count: string;
          }>(
              `select (select count(*) from product_access_grants where product_id = $1)::text
                        as grant_count,
                      (select count(*) from product_methods where product_id = $1)::text
                        as method_count,
                      (select count(*) from products
                        where id = $1 and astro_diary_reflection_cycles_per_period is not null)::text
                        as config_count`,
              [productId]
            );
          expect(persisted.rows).toHaveLength(1);
          expect([
            { config_count: "1", grant_count: "1", method_count: "0" },
            { config_count: "0", grant_count: "0", method_count: "1" }
          ]).toContainEqual(persisted.rows[0]);
        } finally {
          await childClient.query("rollback").catch(() => undefined);
          await diaryClient.query("rollback").catch(() => undefined);
          childClient.release();
          diaryClient.release();
        }
      });
    }
  );

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );

    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }
});

async function assertAstroDiaryProductIntegrityMigrationInstalled(pool: Pool): Promise<void> {
  const functionResult = await pool.query<{ function_name: string | null }>(
    `select to_regprocedure(
       'elevenhouse_assert_astro_diary_product_integrity()'
     )::text as function_name`
  );
  const triggerResult = await pool.query<{
    table_name: string;
    is_deferrable: boolean;
    is_initially_deferred: boolean;
  }>(
    `select relation.relname as table_name,
            trigger.tgdeferrable as is_deferrable,
            trigger.tginitdeferred as is_initially_deferred
       from pg_trigger trigger
       join pg_class relation on relation.oid = trigger.tgrelid
      where trigger.tgname = $1
        and not trigger.tgisinternal
      order by relation.relname`,
    [astroDiaryProductIntegrityConstraintName]
  );
  const actualTables = triggerResult.rows.map((row) => row.table_name).sort();
  const expectedTables = [...astroDiaryProductIntegrityTriggerTables].sort();
  const allDeferred = triggerResult.rows.every(
    (row) => row.is_deferrable && row.is_initially_deferred
  );

  if (
    !functionResult.rows[0]?.function_name ||
    !allDeferred ||
    JSON.stringify(actualTables) !== JSON.stringify(expectedTables)
  ) {
    throw new Error(
      "AstroDiary product integrity migration is missing or incomplete; append astroDiaryProductIntegritySql to the next focused Drizzle migration before enabling ASTRO_DIARY_PRODUCT_INTEGRITY_MIGRATION_READY=1"
    );
  }
}

async function expectAstroDiaryConstraintViolation(
  pool: Pool,
  write: (client: PoolClient) => Promise<void>
): Promise<void> {
  const client = await pool.connect();
  let commitError: unknown;

  try {
    await client.query("begin");
    await write(client);
    try {
      await client.query("commit");
    } catch (error) {
      commitError = error;
    }

    expect(commitError).toMatchObject({
      code: "23514",
      constraint: astroDiaryProductIntegrityConstraintName
    });
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

async function insertRawAstroDiaryParent(
  client: PoolClient,
  ownerUserId: string,
  withConfig: boolean
): Promise<string> {
  const configValues = withConfig
    ? [12, 2, 7, 31, "Europe/Moscow"]
    : [null, null, null, null, null];
  const result = await client.query<{ id: string }>(
    `insert into products (
       owner_user_id, type, title, price_minor, currency, execution_mode,
       payment_model, subscription_period, participant_mode,
       astro_diary_reflection_cycles_per_period,
       astro_diary_response_sla_working_days,
       astro_diary_client_response_window_calendar_days,
       astro_diary_working_weekdays_mask,
       astro_diary_service_timezone
     ) values (
       $1, 'sub', $2, 10000, 'RUB', 'async', 'sub', 'month', 'solo',
       $3, $4, $5, $6, $7
     ) returning id`,
    [ownerUserId, `Raw AstroDiary ${randomUUID()}`, ...configValues]
  );

  return result.rows[0]?.id ?? raise("Expected raw AstroDiary product insert to return id");
}

async function insertRawAccessGrants(
  client: PoolClient,
  productId: string,
  values: readonly string[]
): Promise<void> {
  await client.query(
    `insert into product_access_grants (product_id, value, "order")
     select $1, grant_value, (ordinality - 1)::integer
       from unnest($2::text[]) with ordinality as grant_row(grant_value, ordinality)`,
    [productId, values]
  );
}

async function insertRawDeliveryFormats(
  client: PoolClient,
  productId: string,
  values: readonly string[]
): Promise<void> {
  await client.query(
    `insert into product_delivery_formats (product_id, value, "order")
     select $1, format_value, (ordinality - 1)::integer
       from unnest($2::text[]) with ordinality as format(format_value, ordinality)`,
    [productId, values]
  );
}

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
    astroDiaryConfig: null,
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

  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
