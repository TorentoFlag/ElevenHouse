import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { formatSqlValues, productDeliveryFormatValues } from "./product-values";
import { products } from "./products.schema";

export const productDeliveryFormats = pgTable(
  "product_delivery_formats",
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
      "product_delivery_formats_value_check",
      sql`${table.value} in ${sql.raw(formatSqlValues(productDeliveryFormatValues))}`
    ),
    index("product_delivery_formats_product_id_idx").on(table.productId),
    uniqueIndex("product_delivery_formats_product_value_unique").on(table.productId, table.value)
  ]
);
