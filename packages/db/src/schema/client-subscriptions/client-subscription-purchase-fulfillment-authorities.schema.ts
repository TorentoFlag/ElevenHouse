import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { financePaidProductFulfillmentDecisions } from "../finance/capture-authorities.schema";
import { financeRevisionString } from "../finance/finance-values";
import { clientSubscriptionPurchaseAuthorities } from "./client-subscription-purchase-authorities.schema";

export const clientSubscriptionPurchaseFulfillmentAuthorities = pgTable(
  "client_subscription_purchase_fulfillment_authorities",
  {
    orderId: uuid("order_id").primaryKey(),
    purchaseAuthorityDigest: varchar("purchase_authority_digest", { length: 71 }).notNull(),
    registryKey: varchar("registry_key", { length: 200 }).notNull(),
    registryRevision: financeRevisionString("registry_revision").notNull(),
    fulfillmentDecisionDigest: varchar("fulfillment_decision_digest", { length: 71 }).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "client_sub_purchase_fulfillment_purchase_fk",
      columns: [table.orderId, table.purchaseAuthorityDigest],
      foreignColumns: [
        clientSubscriptionPurchaseAuthorities.orderId,
        clientSubscriptionPurchaseAuthorities.canonicalDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "client_sub_purchase_fulfillment_decision_fk",
      columns: [table.registryKey, table.registryRevision, table.fulfillmentDecisionDigest],
      foreignColumns: [
        financePaidProductFulfillmentDecisions.registryKey,
        financePaidProductFulfillmentDecisions.registryRevision,
        financePaidProductFulfillmentDecisions.canonicalDigest
      ]
    }).onDelete("restrict"),
    unique("client_sub_purchase_fulfillment_exact_owner_unique").on(
      table.orderId,
      table.purchaseAuthorityDigest,
      table.registryKey,
      table.registryRevision,
      table.fulfillmentDecisionDigest,
      table.canonicalDigest
    ),
    check(
      "client_sub_purchase_fulfillment_shape_check",
      sql`${table.registryKey} = 'async.once.async.solo'
        and ${table.registryRevision} >= 1`
    ),
    check(
      "client_sub_purchase_fulfillment_digest_check",
      sql`${table.purchaseAuthorityDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.fulfillmentDecisionDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) > 0`
    )
  ]
);

export const clientSubscriptionPurchaseFulfillmentAuthorityIntegritySql = `
create or replace function client_subscription_issue_purchase_fulfillment_authority()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.created_at := clock_timestamp();
  new.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'client_subscription_purchase_fulfillment_authority',
    'schemaVersion', 1,
    'orderId', new.order_id::text,
    'purchaseAuthorityDigest', new.purchase_authority_digest,
    'fulfillmentDecision', jsonb_build_object(
      'registryKey', new.registry_key,
      'registryRevision', new.registry_revision,
      'canonicalDigest', new.fulfillment_decision_digest
    ),
    'createdAt', to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ));
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger client_sub_purchase_fulfillment_issue
before insert on client_subscription_purchase_fulfillment_authorities
for each row execute function client_subscription_issue_purchase_fulfillment_authority();
`;
