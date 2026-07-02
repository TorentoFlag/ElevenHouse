import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { products } from "./products.schema";

export const productIncludedItems = pgTable(
  "product_included_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    icon: text("icon").notNull(),
    order: integer("order").notNull()
  },
  (table) => [index("product_included_items_product_id_idx").on(table.productId)]
);
