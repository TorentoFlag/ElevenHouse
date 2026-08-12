import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

import { clientAstrologerRelationships } from "../clients/client-astrologer-relationships.schema";
import { products } from "../products/products.schema";

export const clientSubscriptionSlots = pgTable(
  "client_subscription_slots",
  {
    relationshipId: uuid("relationship_id").notNull(),
    productId: uuid("product_id").notNull(),
    clientUserId: uuid("client_user_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    version: integer("version").notNull().default(0),
    currentSubscriptionId: uuid("current_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.relationshipId, table.productId],
      name: "client_subscription_slots_relationship_product_pk"
    }),
    unique("client_subscription_slots_exact_identity_unique").on(
      table.relationshipId,
      table.productId,
      table.clientUserId,
      table.astrologerUserId
    ),
    foreignKey({
      columns: [table.relationshipId, table.clientUserId, table.astrologerUserId],
      foreignColumns: [
        clientAstrologerRelationships.id,
        clientAstrologerRelationships.clientUserId,
        clientAstrologerRelationships.astrologerUserId
      ],
      name: "client_subscription_slots_relationship_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.productId, table.astrologerUserId],
      foreignColumns: [products.id, products.ownerUserId],
      name: "client_subscription_slots_product_owner_fk"
    }).onDelete("restrict"),
    check("client_subscription_slots_version_check", sql`${table.version} >= 0`),
    check(
      "client_subscription_slots_current_version_check",
      sql`${table.currentSubscriptionId} is null or ${table.version} >= 1`
    )
  ]
);
