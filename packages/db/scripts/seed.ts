import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";
import { createPostgresConnectionConfig } from "../src/index";
import {
  dictionarySeedCategories,
  dictionarySeedPlatformEntries
} from "./dictionary-seed-data/index";
import { productTemplateSeedData } from "./product-template-seed-data/index";

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
    await seedProductTemplates();
    console.log(
      `Database seed completed: ${dictionarySeedCategories.length} dictionary categories, ${dictionarySeedPlatformEntries.length} dictionary platform entries and ${productTemplateSeedData.length} product templates upserted`
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

async function seedProductTemplates() {
  if (productTemplateSeedData.length === 0) {
    return;
  }

  const valuesSql = productTemplateSeedData
    .map((_, index) => {
      const parameterOffset = index * 9;

      return `($${parameterOffset + 1}, $${parameterOffset + 2}, $${parameterOffset + 3}, $${parameterOffset + 4}, $${parameterOffset + 5}, $${parameterOffset + 6}, $${parameterOffset + 7}, $${parameterOffset + 8}, $${parameterOffset + 9}::jsonb)`;
    })
    .join(", ");
  const values = productTemplateSeedData.flatMap((template) => [
    template.code,
    template.locale,
    template.type,
    template.status,
    template.title,
    template.subtitle,
    template.description,
    template.sortOrder,
    JSON.stringify(template.payload)
  ]);

  await pool.query(
    `insert into product_templates (
       code, locale, type, status, title, subtitle, description, sort_order, payload
     )
     values ${valuesSql}
     on conflict (code, locale) do update
     set type = excluded.type,
         status = excluded.status,
         title = excluded.title,
         subtitle = excluded.subtitle,
         description = excluded.description,
         sort_order = excluded.sort_order,
         payload = excluded.payload,
         updated_at = now()`,
    values
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
