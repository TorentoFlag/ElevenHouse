import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { formatSqlValues, productRequiredClientDataValues } from "./product-values";
import { products } from "./products.schema";

export const productRequiredClientData = pgTable(
  "product_required_client_data",
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
      "product_required_client_data_value_check",
      sql`${table.value} in ${sql.raw(formatSqlValues(productRequiredClientDataValues))}`
    ),
    index("product_required_client_data_product_id_idx").on(table.productId),
    uniqueIndex("product_required_client_data_product_value_unique").on(
      table.productId,
      table.value
    )
  ]
);
