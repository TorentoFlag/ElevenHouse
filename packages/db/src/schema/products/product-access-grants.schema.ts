import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { formatSqlValues, productAccessGrantValues } from "./product-values";
import { products } from "./products.schema";

export const productAccessGrants = pgTable(
  "product_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    order: integer("order").notNull()
  },
  (table) => [
    check(
      "product_access_grants_value_check",
      sql`${table.value} in ${sql.raw(formatSqlValues(productAccessGrantValues))}`
    ),
    index("product_access_grants_product_id_idx").on(table.productId),
    uniqueIndex("product_access_grants_product_order_unique").on(table.productId, table.order),
    uniqueIndex("product_access_grants_product_value_unique").on(table.productId, table.value)
  ]
);
