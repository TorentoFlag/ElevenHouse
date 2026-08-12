import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import type { ProductAstroDiaryConfig } from "@elevenhouse/contracts";

import { clientAstrologerRelationships } from "../clients/client-astrologer-relationships.schema";
import { financeOrderEconomicsSnapshots } from "../finance/capture-authorities.schema";
import { financeSafeIntegerMinorUnitMax } from "../finance/finance-values";
import { orders } from "../finance/orders.schema";
import { products } from "../products/products.schema";
import { clientSubscriptionPurchaseAuthorities } from "./client-subscription-purchase-authorities.schema";

const safeIntegerMaximumSql = sql.raw(String(financeSafeIntegerMinorUnitMax));

export const clientSubscriptionContracts = pgTable(
  "client_subscription_contracts",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull(),
    purchaseAuthorityDigest: varchar("purchase_authority_digest", { length: 71 }).notNull(),
    productId: uuid("product_id").notNull(),
    productRevision: integer("product_revision").notNull(),
    relationshipId: uuid("relationship_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    clientUserId: uuid("client_user_id").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    cadence: text("cadence").notNull(),
    billingEconomicsOrderId: varchar("billing_order_id", { length: 200 }).notNull(),
    billingEconomicsDigest: varchar("billing_economics_digest", { length: 71 }).notNull(),
    billingAstrologerUserId: uuid("billing_astrologer_user_id").notNull(),
    billingPlanId: varchar("billing_plan_id", { length: 200 }).notNull(),
    billingPlanVersionId: varchar("billing_plan_version_id", { length: 200 }).notNull(),
    billingGrossAmountMinor: bigint("billing_gross_amount_minor", { mode: "number" }).notNull(),
    billingGrossCurrency: text("billing_gross_currency").notNull(),
    billingCommissionAmountMinor: bigint("billing_commission_amount_minor", {
      mode: "number"
    }).notNull(),
    billingCommissionCurrency: text("billing_commission_currency").notNull(),
    billingPayableAmountMinor: bigint("billing_payable_amount_minor", {
      mode: "number"
    }).notNull(),
    billingPayableCurrency: text("billing_payable_currency").notNull(),
    billingCommissionBps: integer("billing_commission_bps").notNull(),
    billingAllocationRevision: text("billing_allocation_revision").notNull(),
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
    createdAt: text("created_at").notNull()
  },
  (table) => [
    unique("client_subscription_contracts_order_unique").on(table.orderId),
    unique("client_subscription_contracts_exact_identity_unique").on(
      table.id,
      table.relationshipId,
      table.productId,
      table.clientUserId,
      table.astrologerUserId
    ),
    unique("client_subscription_contracts_subscription_scope_unique").on(
      table.id,
      table.relationshipId,
      table.productId
    ),
    foreignKey({
      columns: [table.orderId, table.clientUserId, table.astrologerUserId, table.productId],
      foreignColumns: [orders.id, orders.clientUserId, orders.astrologerUserId, orders.productId],
      name: "client_subscription_contracts_order_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.orderId, table.purchaseAuthorityDigest],
      foreignColumns: [
        clientSubscriptionPurchaseAuthorities.orderId,
        clientSubscriptionPurchaseAuthorities.canonicalDigest
      ],
      name: "client_subscription_contracts_purchase_authority_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.billingEconomicsOrderId, table.billingEconomicsDigest],
      foreignColumns: [
        financeOrderEconomicsSnapshots.orderId,
        financeOrderEconomicsSnapshots.canonicalDigest
      ],
      name: "client_subscription_contracts_billing_economics_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.productId, table.astrologerUserId],
      foreignColumns: [products.id, products.ownerUserId],
      name: "client_subscription_contracts_product_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.relationshipId, table.clientUserId, table.astrologerUserId],
      foreignColumns: [
        clientAstrologerRelationships.id,
        clientAstrologerRelationships.clientUserId,
        clientAstrologerRelationships.astrologerUserId
      ],
      name: "client_subscription_contracts_relationship_identity_fk"
    }).onDelete("restrict"),
    check(
      "client_subscription_contracts_positive_rub_check",
      sql`${table.priceMinor} > 0 and ${table.currency} = 'RUB'`
    ),
    check(
      "client_subscription_contracts_cadence_check",
      sql`${table.cadence} in ('week', 'month', 'year')`
    ),
    check(
      "client_subscription_contracts_product_revision_check",
      sql`${table.productRevision} >= 1`
    ),
    check(
      "client_subscription_contracts_billing_identity_check",
      sql`${table.billingEconomicsOrderId} = ${table.orderId}::text
        and ${table.billingAstrologerUserId} = ${table.astrologerUserId}
        and ${table.billingGrossAmountMinor} = ${table.priceMinor}
        and ${table.billingGrossCurrency} = ${table.currency}
        and length(${table.billingPlanId}) between 1 and 200
        and ${table.billingPlanId} = trim(${table.billingPlanId})
        and length(${table.billingPlanVersionId}) between 1 and 200
        and ${table.billingPlanVersionId} = trim(${table.billingPlanVersionId})
        and ${table.billingEconomicsDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "client_subscription_contracts_billing_allocation_check",
      sql`${table.billingGrossAmountMinor} > 0
        and ${table.billingGrossAmountMinor} <= ${safeIntegerMaximumSql}
        and ${table.billingCommissionAmountMinor} >= 0
        and ${table.billingCommissionAmountMinor} <= ${safeIntegerMaximumSql}
        and ${table.billingPayableAmountMinor} >= 0
        and ${table.billingPayableAmountMinor} <= ${safeIntegerMaximumSql}
        and ${table.billingCommissionCurrency} = ${table.billingGrossCurrency}
        and ${table.billingPayableCurrency} = ${table.billingGrossCurrency}
        and ${table.billingCommissionBps} between 0 and 10000
        and ${table.billingAllocationRevision} = 'bps_half_up_v1'
        and ${table.billingGrossAmountMinor} = ${table.billingCommissionAmountMinor} + ${table.billingPayableAmountMinor}
        and ${table.billingCommissionAmountMinor} = floor(
          (${table.billingGrossAmountMinor} * ${table.billingCommissionBps} + 5000) / 10000
        )`
    ),
    check(
      "client_subscription_contracts_exact_diary_shape_check",
      sql`${table.accessGrants} = '["journal"]'::jsonb
        and ${table.deliveryFormats} = '["chat","audio","file"]'::jsonb
        and ${table.requiredClientData} = '[]'::jsonb
        and ${table.methods} = '[]'::jsonb
        and ${table.modifiers} = '[]'::jsonb
        and jsonb_typeof(${table.astroDiaryConfig}) = 'object'`
    ),
    check(
      "client_subscription_contracts_digest_check",
      sql`${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$' and length(${table.canonicalPreimage}) > 0`
    ),
    check(
      "client_subscription_contracts_created_at_check",
      sql`${table.createdAt} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{0,8}[1-9])?Z$'`
    )
  ]
);
