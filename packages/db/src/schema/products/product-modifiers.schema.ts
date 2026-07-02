import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { formatSqlValues, productModifierKindValues } from "./product-values";
import { products } from "./products.schema";

export const productModifiers = pgTable(
  "product_modifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    priceMinor: integer("price_minor").notNull(),
    kind: text("kind").notNull(),
    isEnabled: boolean("is_enabled").notNull(),
    createsArtifact: boolean("creates_artifact").notNull(),
    order: integer("order").notNull()
  },
  (table) => [
    check(
      "product_modifiers_kind_check",
      sql`${table.kind} in ${sql.raw(formatSqlValues(productModifierKindValues))}`
    ),
    check("product_modifiers_price_minor_check", sql`${table.priceMinor} >= 0`),
    check(
      "product_modifiers_free_price_check",
      sql`${table.kind} <> 'free' or ${table.priceMinor} = 0`
    ),
    index("product_modifiers_product_id_idx").on(table.productId)
  ]
);
