import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";
import { platformPlanSeedData } from "@elevenhouse/domain";
import { createPostgresConnectionConfig } from "../src/index";
import {
  dictionarySeedCategories,
  dictionarySeedPlatformEntries
} from "./dictionary-seed-data/index";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(currentDirectory, "../../../.env"), quiet: true });
config({ path: resolve(currentDirectory, "../../../.env.example"), quiet: true });

const { connectionString } = createPostgresConnectionConfig();
const pool = new Pool({ connectionString });

async function main() {
  try {
    await pool.query("select 1");
    await seedDictionaryCategories();
    await seedDictionaryPlatformEntries();
    await seedPlatformPlans();
    console.log(
      `Database seed completed: ${dictionarySeedCategories.length} dictionary categories, ${dictionarySeedPlatformEntries.length} dictionary platform entries and ${platformPlanSeedData.length} platform plans upserted`
    );
  } finally {
    await pool.end();
  }
}

async function seedDictionaryCategories() {
  const valuesSql = dictionarySeedCategories
    .map((_, index) => {
      const parameterOffset = index * 3;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3})`;
    })
    .join(", ");
  const values = dictionarySeedCategories.flatMap((category) => [
    category.code,
    category.name,
    category.order
  ]);

  await pool.query(
    `insert into dictionary_categories (code, name, "order")
     values ${valuesSql}
     on conflict (code) do update
     set name = excluded.name,
         "order" = excluded."order",
         updated_at = now()`,
    values
  );
}

async function seedDictionaryPlatformEntries() {
  if (dictionarySeedPlatformEntries.length === 0) {
    return;
  }

  const valuesSql = dictionarySeedPlatformEntries
    .map((_, index) => {
      const parameterOffset = index * 6;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3}, $${parameterOffset + 4}, $${parameterOffset + 5}, $${parameterOffset + 6})`;
    })
    .join(", ");
  const values = dictionarySeedPlatformEntries.flatMap((entry) => [
    entry.categoryCode,
    entry.code,
    entry.locale,
    entry.title,
    entry.content,
    entry.status
  ]);

  await pool.query(
    `insert into dictionary_platform_entries (category_id, code, locale, title, content, status)
     select categories.id,
            seed_entries.code,
            seed_entries.locale,
            seed_entries.title,
            seed_entries.content,
            seed_entries.status
     from (values ${valuesSql})
       as seed_entries(category_code, code, locale, title, content, status)
     inner join dictionary_categories categories
       on categories.code = seed_entries.category_code
     on conflict (category_id, code, locale) do update
     set title = excluded.title,
         content = excluded.content,
         status = excluded.status,
         updated_at = now()`,
    values
  );
}

async function seedPlatformPlans() {
  const planValuesSql = platformPlanSeedData
    .map((_, index) => {
      const parameterOffset = index * 14;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3}, $${parameterOffset + 4}, $${parameterOffset + 5}, $${parameterOffset + 6}, $${parameterOffset + 7}, $${parameterOffset + 8}, $${parameterOffset + 9}, $${parameterOffset + 10}, $${parameterOffset + 11}, $${parameterOffset + 12}, $${parameterOffset + 13}, $${parameterOffset + 14})`;
    })
    .join(", ");
  const planValues = platformPlanSeedData.flatMap((plan, index) => [
    plan.id,
    plan.code,
    plan.name,
    plan.tagline,
    plan.monthlyPriceMinor,
    plan.yearlyPriceMinor,
    plan.currency,
    plan.platformFeeBps,
    plan.seatsLimit,
    plan.bookingsLimit,
    plan.aiRequestsLimit,
    plan.automationLimit,
    plan.isPopular,
    index * 10
  ]);

  await pool.query(
    `insert into platform_plans (
       id, code, name, tagline, monthly_price_minor, yearly_price_minor, currency,
       platform_fee_bps, seats_limit, bookings_limit, ai_requests_limit,
       automation_limit, is_popular, display_order
     )
     values ${planValuesSql}
     on conflict (id) do update
     set code = excluded.code,
         name = excluded.name,
         tagline = excluded.tagline,
         monthly_price_minor = excluded.monthly_price_minor,
         yearly_price_minor = excluded.yearly_price_minor,
         currency = excluded.currency,
         platform_fee_bps = excluded.platform_fee_bps,
         seats_limit = excluded.seats_limit,
         bookings_limit = excluded.bookings_limit,
         ai_requests_limit = excluded.ai_requests_limit,
         automation_limit = excluded.automation_limit,
         is_popular = excluded.is_popular,
         is_active = true,
         display_order = excluded.display_order,
         updated_at = now()`,
    planValues
  );

  await pool.query("delete from platform_plan_features where plan_id = any($1::text[])", [
    platformPlanSeedData.map((plan) => plan.id)
  ]);

  const featureRows = platformPlanSeedData.flatMap((plan) =>
    plan.features.map((feature, index) => ({
      planId: plan.id,
      value: feature,
      order: index * 10
    }))
  );
  const featureValuesSql = featureRows
    .map((_, index) => {
      const parameterOffset = index * 3;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3})`;
    })
    .join(", ");
  const featureValues = featureRows.flatMap((feature) => [
    feature.planId,
    feature.value,
    feature.order
  ]);

  await pool.query(
    `insert into platform_plan_features (plan_id, value, "order")
     values ${featureValuesSql}
     on conflict (plan_id, value) do update
     set "order" = excluded."order"`,
    featureValues
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
