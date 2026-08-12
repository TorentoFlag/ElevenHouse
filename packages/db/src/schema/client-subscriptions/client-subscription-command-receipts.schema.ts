import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { orders } from "../finance/orders.schema";
import { clientSubscriptions } from "./client-subscriptions.schema";
import type {
  ClientSubscription,
  ClientSubscriptionCreationDecision,
  ClientSubscriptionDomainEvent,
  ClientSubscriptionTransitionReceipt
} from "@elevenhouse/domain";

export type ClientSubscriptionPersistenceResultSnapshot =
  | Readonly<{
      outcome: "applied";
      subscription: ClientSubscription;
      events: readonly ClientSubscriptionDomainEvent[];
      receipt: ClientSubscriptionTransitionReceipt;
    }>
  | Readonly<{
      outcome: "idempotent";
      subscription: ClientSubscription;
      events: readonly [];
    }>;

export type ClientSubscriptionCreationResultSnapshot = Extract<
  ClientSubscriptionCreationDecision,
  { readonly outcome: "created" }
>;

export const clientSubscriptionCreationReceipts = pgTable(
  "client_subscription_creation_receipts",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    relationshipId: uuid("relationship_id").notNull(),
    productId: uuid("product_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    requestHash: varchar("request_hash", { length: 71 }).notNull(),
    expectedSlotVersion: integer("expected_slot_version").notNull(),
    slotEffect: text("slot_effect").notNull(),
    resultKind: text("result_kind").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<ClientSubscriptionCreationResultSnapshot>(),
    resultSlotVersion: integer("result_slot_version").notNull(),
    subscriptionId: uuid("subscription_id"),
    contractId: uuid("contract_id"),
    contractDigest: varchar("contract_digest", { length: 71 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_creation_receipts_order_key_unique").on(
      table.orderId,
      table.idempotencyKey
    ),
    check(
      "client_subscription_creation_receipts_request_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "client_subscription_creation_receipts_version_check",
      sql`${table.expectedSlotVersion} >= 0 and ${table.resultSlotVersion} >= ${table.expectedSlotVersion}`
    ),
    check(
      "client_subscription_creation_receipts_result_check",
      sql`${table.resultKind} in ('created', 'rejected')
        and jsonb_typeof(${table.result}) = 'object'
        and (
          (${table.resultKind} = 'created'
            and ${table.slotEffect} = 'assign'
            and ${table.subscriptionId} is not null
            and ${table.contractId} is not null
            and ${table.contractDigest} ~ '^sha256:[a-f0-9]{64}$'
            and jsonb_typeof(${table.resultSnapshot}) = 'object'
            and ${table.resultSnapshot}->>'outcome' = 'created'
            and ${table.resultSnapshot}->'contract'->>'id' = ${table.contractId}::text
            and ${table.resultSnapshot}->'contract'->>'orderId' = ${table.orderId}::text
            and ${table.resultSnapshot}->'contract'->>'productId' = ${table.productId}::text
            and ${table.resultSnapshot}->'contract'->>'relationshipId' = ${table.relationshipId}::text
            and ${table.resultSnapshot}->'contract'->>'canonicalDigest' = ${table.contractDigest}
            and ${table.resultSnapshot}->'subscription'->>'id' = ${table.subscriptionId}::text
            and (${table.resultSnapshot}->'subscription'->>'version')::integer = 1
            and ${table.resultSnapshot}->'subscription'->>'state' = 'pending_initial_payment'
            and ${table.resultSnapshot}->'subscription'->'contract' = ${table.resultSnapshot}->'contract'
            and ${table.result} = jsonb_build_object(
              'outcome', 'created',
              'subscriptionId', ${table.subscriptionId}::text,
              'contractId', ${table.contractId}::text,
              'contractDigest', ${table.contractDigest}
            )
            and ${table.resultSlotVersion} = ${table.expectedSlotVersion} + 1)
          or (${table.resultKind} = 'rejected'
            and ${table.slotEffect} = 'retain'
            and ${table.subscriptionId} is null
            and ${table.contractId} is null
            and ${table.contractDigest} is null
            and ${table.resultSnapshot} is null
            and ${table.resultSlotVersion} = ${table.expectedSlotVersion}
            and jsonb_typeof(${table.result}->'code') = 'string'
            and ${table.result}->>'outcome' = 'rejected'
            and ${table.result} - ARRAY['outcome', 'code']::text[] = '{}'::jsonb)
        )`
    )
  ]
);

export const clientSubscriptionCommandReceipts = pgTable(
  "client_subscription_command_receipts",
  {
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => clientSubscriptions.id, { onDelete: "restrict" }),
    expectedVersion: integer("expected_version").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    requestHash: varchar("request_hash", { length: 71 }).notNull(),
    resultKind: text("result_kind").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<ClientSubscriptionPersistenceResultSnapshot>(),
    resultVersion: integer("result_version").notNull(),
    transitionId: uuid("transition_id"),
    slotEffect: text("slot_effect"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_command_receipts_scope_key_unique").on(
      table.subscriptionId,
      table.idempotencyKey
    ),
    check(
      "client_subscription_command_receipts_request_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "client_subscription_command_receipts_result_check",
      sql`${table.resultKind} in ('applied', 'idempotent', 'rejected')
        and jsonb_typeof(${table.result}) = 'object'
        and ${table.expectedVersion} >= 1
        and (
          (${table.resultKind} = 'applied' and ${table.resultVersion} = ${table.expectedVersion} + 1)
          or (${table.resultKind} in ('idempotent', 'rejected') and ${table.resultVersion} = ${table.expectedVersion})
        )
        and (
          (${table.resultKind} = 'applied'
            and ${table.transitionId} is not null
            and ${table.slotEffect} in ('retain', 'release')
            and jsonb_typeof(${table.resultSnapshot}) = 'object'
            and ${table.resultSnapshot}->>'outcome' = 'applied'
            and ${table.resultSnapshot}->'subscription'->>'id' = ${table.subscriptionId}::text
            and (${table.resultSnapshot}->'subscription'->>'version')::integer = ${table.resultVersion}
            and ${table.resultSnapshot}->'receipt'->>'transitionId' = ${table.transitionId}::text
            and jsonb_typeof(${table.resultSnapshot}->'events') = 'array'
            and ${table.result} = jsonb_build_object(
              'outcome', 'applied',
              'slotEffect', ${table.slotEffect},
              'subscriptionVersion', ${table.resultVersion},
              'transitionId', ${table.transitionId}::text
            ))
          or (${table.resultKind} = 'idempotent'
            and ${table.transitionId} is null
            and ${table.slotEffect} is null
            and jsonb_typeof(${table.resultSnapshot}) = 'object'
            and ${table.resultSnapshot}->>'outcome' = 'idempotent'
            and ${table.resultSnapshot}->'subscription'->>'id' = ${table.subscriptionId}::text
            and (${table.resultSnapshot}->'subscription'->>'version')::integer = ${table.resultVersion}
            and ${table.resultSnapshot}->'events' = '[]'::jsonb
            and ${table.result} = jsonb_build_object(
              'outcome', 'idempotent',
              'subscriptionVersion', ${table.resultVersion}
            ))
          or (${table.resultKind} = 'rejected'
            and ${table.transitionId} is null
            and ${table.slotEffect} is null
            and ${table.resultSnapshot} is null
            and jsonb_typeof(${table.result}->'code') = 'string'
            and ${table.result} - ARRAY['outcome', 'code']::text[] = '{}'::jsonb
            and ${table.result}->>'outcome' = 'rejected')
        )`
    )
  ]
);

export const clientSubscriptionEventApplicationReceipts = pgTable(
  "client_subscription_event_application_receipts",
  {
    sourceEventId: uuid("source_event_id").primaryKey(),
    sourceEventDigest: varchar("source_event_digest", { length: 71 }).notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => clientSubscriptions.id, { onDelete: "restrict" }),
    resultKind: text("result_kind").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<ClientSubscriptionPersistenceResultSnapshot>(),
    resultVersion: integer("result_version").notNull(),
    transitionId: uuid("transition_id"),
    slotEffect: text("slot_effect"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("client_subscription_event_applications_source_unique").on(
      table.sourceEventId,
      table.sourceEventDigest
    ),
    unique("client_subscription_event_applications_evidence_unique").on(table.evidenceId),
    check(
      "client_subscription_event_applications_digest_check",
      sql`${table.sourceEventDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "client_subscription_event_applications_result_check",
      sql`${table.resultKind} in ('applied', 'idempotent', 'rejected')
        and jsonb_typeof(${table.result}) = 'object'
        and ${table.resultVersion} >= 1
        and (
          (${table.resultKind} = 'applied'
            and ${table.transitionId} is not null
            and ${table.slotEffect} in ('retain', 'release')
            and jsonb_typeof(${table.resultSnapshot}) = 'object'
            and ${table.resultSnapshot}->>'outcome' = 'applied'
            and ${table.resultSnapshot}->'subscription'->>'id' = ${table.subscriptionId}::text
            and (${table.resultSnapshot}->'subscription'->>'version')::integer = ${table.resultVersion}
            and ${table.resultSnapshot}->'receipt'->>'transitionId' = ${table.transitionId}::text
            and jsonb_typeof(${table.resultSnapshot}->'events') = 'array'
            and ${table.result} = jsonb_build_object(
              'outcome', 'applied',
              'slotEffect', ${table.slotEffect},
              'subscriptionVersion', ${table.resultVersion},
              'transitionId', ${table.transitionId}::text
            ))
          or (${table.resultKind} = 'idempotent'
            and ${table.transitionId} is null
            and ${table.slotEffect} is null
            and jsonb_typeof(${table.resultSnapshot}) = 'object'
            and ${table.resultSnapshot}->>'outcome' = 'idempotent'
            and ${table.resultSnapshot}->'subscription'->>'id' = ${table.subscriptionId}::text
            and (${table.resultSnapshot}->'subscription'->>'version')::integer = ${table.resultVersion}
            and ${table.resultSnapshot}->'events' = '[]'::jsonb
            and ${table.result} = jsonb_build_object(
              'outcome', 'idempotent',
              'subscriptionVersion', ${table.resultVersion}
            ))
          or (${table.resultKind} = 'rejected'
            and ${table.transitionId} is null
            and ${table.slotEffect} is null
            and ${table.resultSnapshot} is null
            and jsonb_typeof(${table.result}->'code') = 'string'
            and ${table.result} - ARRAY['outcome', 'code']::text[] = '{}'::jsonb
            and ${table.result}->>'outcome' = 'rejected')
        )`
    )
  ]
);
