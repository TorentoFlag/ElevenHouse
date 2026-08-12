import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import type { ProductAstroDiaryConfig } from "@elevenhouse/contracts";

import { clientAstrologerRelationships } from "../clients/client-astrologer-relationships.schema";
import { financeOrderEconomicsSnapshots } from "../finance/capture-authorities.schema";
import { orders } from "../finance/orders.schema";

export const clientSubscriptionPurchaseAuthorities = pgTable(
  "client_subscription_purchase_authorities",
  {
    orderId: uuid("order_id").primaryKey(),
    productId: uuid("product_id").notNull(),
    productRevision: integer("product_revision").notNull(),
    relationshipId: uuid("relationship_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    clientUserId: uuid("client_user_id").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    cadence: text("cadence").notNull(),
    billingEconomicsOrderId: varchar("billing_economics_order_id", { length: 200 }).notNull(),
    billingEconomicsDigest: varchar("billing_economics_digest", { length: 71 }).notNull(),
    accessGrants: jsonb("access_grants").$type<readonly ["journal"]>().notNull(),
    deliveryFormats: jsonb("delivery_formats")
      .$type<readonly ["chat", "audio", "file"]>()
      .notNull(),
    requiredClientData: jsonb("required_client_data").$type<readonly []>().notNull(),
    methods: jsonb("methods").$type<readonly []>().notNull(),
    modifiers: jsonb("modifiers").$type<readonly []>().notNull(),
    astroDiaryConfig: jsonb("astro_diary_config").$type<ProductAstroDiaryConfig>().notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_purchase_authorities_order_digest_unique").on(
      table.orderId,
      table.canonicalDigest
    ),
    foreignKey({
      columns: [table.orderId, table.clientUserId, table.astrologerUserId, table.productId],
      foreignColumns: [orders.id, orders.clientUserId, orders.astrologerUserId, orders.productId],
      name: "client_subscription_purchase_authorities_order_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.relationshipId, table.clientUserId, table.astrologerUserId],
      foreignColumns: [
        clientAstrologerRelationships.id,
        clientAstrologerRelationships.clientUserId,
        clientAstrologerRelationships.astrologerUserId
      ],
      name: "client_subscription_purchase_authorities_relationship_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.billingEconomicsOrderId, table.billingEconomicsDigest],
      foreignColumns: [
        financeOrderEconomicsSnapshots.orderId,
        financeOrderEconomicsSnapshots.canonicalDigest
      ],
      name: "client_subscription_purchase_authorities_billing_economics_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_purchase_authorities_terms_check",
      sql`${table.productRevision} >= 1
        and ${table.priceMinor} > 0
        and ${table.currency} = 'RUB'
        and ${table.cadence} in ('week', 'month', 'year')
        and ${table.accessGrants} = '["journal"]'::jsonb
        and ${table.deliveryFormats} = '["chat","audio","file"]'::jsonb
        and ${table.requiredClientData} = '[]'::jsonb
        and ${table.methods} = '[]'::jsonb
        and ${table.modifiers} = '[]'::jsonb
        and jsonb_typeof(${table.astroDiaryConfig}) = 'object'`
    ),
    check(
      "client_subscription_purchase_authorities_digest_check",
      sql`${table.billingEconomicsDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.billingEconomicsOrderId} = ${table.orderId}::text
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) > 0`
    )
  ]
);
