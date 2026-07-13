import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";
import {
  productTemplateLocaleValues,
  productTemplateStatusValues
} from "@elevenhouse/validation/products";
import { formatSqlValues, productTypeValues } from "./product-values";

export { productTemplateLocaleValues, productTemplateStatusValues };

export const productTemplates = pgTable(
  "product_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    locale: text("locale").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("active"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("product_templates_code_locale_unique").on(table.code, table.locale),
    check(
      "product_templates_status_check",
      sql`${table.status} in ${sql.raw(formatSqlValues(productTemplateStatusValues))}`
    ),
    check(
      "product_templates_locale_check",
      sql`${table.locale} in ${sql.raw(formatSqlValues(productTemplateLocaleValues))}`
    ),
    check(
      "product_templates_type_check",
      sql`${table.type} in ${sql.raw(formatSqlValues(productTypeValues))}`
    ),
    check("product_templates_sort_order_check", sql`${table.sortOrder} >= 0`),
    check("product_templates_code_length_check", sql`length(trim(${table.code})) between 3 and 80`),
    check(
      "product_templates_title_length_check",
      sql`length(trim(${table.title})) between 1 and 200`
    ),
    index("product_templates_active_locale_order_idx")
      .on(table.locale, table.sortOrder, table.code)
      .where(sql`${table.status} = 'active'`)
  ]
);
