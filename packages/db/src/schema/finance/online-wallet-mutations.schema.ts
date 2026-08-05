import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { financeJournalTransactions } from "./ledger.schema";
import { financeOnlineSaleCaptureRootLots, financeOnlineWalletHeads } from "./online-sale-capture.schema";
import { financeNumeric38String, financeRevisionString } from "./finance-values";
import { bookingLifecycleEvents } from "../scheduling/booking-lifecycle-events.schema";
import { bookings } from "../scheduling/bookings.schema";
import { financeMerchantPayoutPaymentInclusions } from "./merchant-payout-statements.schema";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * One append-only v2 wallet transition. This is deliberately separate from the capture receipt:
 * capture creates a pending root; later release/refund/payout operations advance this chain.
 */
export const financeOnlineWalletMutations = pgTable(
  "finance_online_wallet_mutations",
  {
    /** This UUID is also the next online-wallet commitment identity stored on the head. */
    mutationId: uuid("mutation_id").primaryKey(),
    walletId: uuid("wallet_id").notNull(),
    expectedWalletRevision: financeRevisionString("expected_wallet_revision").notNull(),
    nextWalletRevision: financeRevisionString("next_wallet_revision").notNull(),
    operationKind: text("operation_kind").notNull(),
    previousCommitmentDigest: varchar("previous_commitment_digest", { length: 71 }).notNull(),
    commitmentDigest: varchar("commitment_digest", { length: 71 }).notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.walletId],
      foreignColumns: [financeOnlineWalletHeads.id],
      name: "finance_online_wallet_mutations_wallet_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.journalTransactionId],
      foreignColumns: [financeJournalTransactions.id],
      name: "finance_online_wallet_mutations_journal_fk"
    }).onDelete("restrict"),
    unique("finance_online_wallet_mutations_wallet_revision_unique").on(
      table.walletId,
      table.nextWalletRevision
    ),
    unique("finance_online_wallet_mutations_journal_unique").on(table.journalTransactionId),
    check(
      "finance_online_wallet_mutations_revision_check",
      sql`${table.expectedWalletRevision} >= 1
        and ${table.nextWalletRevision} = ${table.expectedWalletRevision} + 1`
    ),
    check(
      "finance_online_wallet_mutations_operation_check",
      sql`${table.operationKind} in ('hold_release', 'reserve_release', 'payout_requested', 'payout_paid', 'payout_returned_reserved', 'refund_approved', 'refund_confirmed', 'refund_failed', 'chargeback_confirmed', 'chargeback_recovery', 'chargeback_won')`
    ),
    check(
      "finance_online_wallet_mutations_digest_check",
      sql`${table.previousCommitmentDigest} ~ ${digestPattern}
        and ${table.commitmentDigest} ~ ${digestPattern}`
    ),
    check(
      "finance_online_wallet_mutations_time_check",
      sql`${table.committedAt} >= ${table.occurredAt}`
    ),
    index("finance_online_wallet_mutations_wallet_history_idx").on(
      table.walletId,
      table.nextWalletRevision
    )
  ]
);

/**
 * Immutable active-position output of a v2 source consumption. A position is whole: a later
 * operation consumes it once and may split it into fresh child positions. This prevents a
 * payout/refund from silently spending a source component twice.
 */
export const financeOnlinePayableSourceAllocations = pgTable(
  "finance_online_payable_source_allocations",
  {
    allocationId: varchar("allocation_id", { length: 200 }).notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    walletId: uuid("wallet_id").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    bucket: text("bucket").notNull(),
    /** Required to restore a failed payout/refund to the exact source bucket. */
    returnBucket: text("return_bucket"),
    /** SQL integrity binds this to a same-wallet/root consumption below. */
    sourceConsumptionId: uuid("source_consumption_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.allocationId],
      name: "finance_online_payable_source_allocations_pk"
    }),
    foreignKey({
      columns: [table.rootLotId],
      foreignColumns: [financeOnlineSaleCaptureRootLots.lotId],
      name: "finance_online_payable_source_allocations_root_lot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.walletId],
      foreignColumns: [financeOnlineWalletHeads.id],
      name: "finance_online_payable_source_allocations_wallet_fk"
    }).onDelete("restrict"),
    check(
      "finance_online_payable_source_allocations_amount_check",
      sql`${table.amountMinor} > 0`
    ),
    check(
      "finance_online_payable_source_allocations_bucket_check",
      sql`${table.bucket} in ('pending', 'available', 'reserved', 'payout_pending', 'refund_pending', 'recovery_receivable')`
    ),
    check(
      "finance_online_payable_source_allocations_return_bucket_check",
      sql`${table.returnBucket} is null
        or (${table.bucket} in ('payout_pending', 'refund_pending')
          and ${table.returnBucket} in ('pending', 'available', 'reserved', 'recovery_receivable'))`
    ),
    index("finance_online_payable_source_allocations_root_history_idx").on(
      table.rootLotId,
      table.allocationId
    )
  ]
);

/**
 * One complete source consumption. A root is an implicit first pending position; every later
 * source is an allocation. Outputs are immutable child allocations and any remaining amount is
 * explicitly disposed by the mutation's balanced journal entry.
 */
export const financeOnlinePayableSourceConsumptions = pgTable(
  "finance_online_payable_source_consumptions",
  {
    consumptionId: uuid("consumption_id").primaryKey(),
    mutationId: uuid("mutation_id").notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    walletId: uuid("wallet_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceAllocationId: varchar("source_allocation_id", { length: 200 }),
    disposedMinor: financeNumeric38String("disposed_minor").notNull(),
    dispositionKind: text("disposition_kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.mutationId],
      foreignColumns: [financeOnlineWalletMutations.mutationId],
      name: "finance_online_payable_source_consumptions_mutation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rootLotId],
      foreignColumns: [financeOnlineSaleCaptureRootLots.lotId],
      name: "finance_online_payable_source_consumptions_root_lot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.walletId],
      foreignColumns: [financeOnlineWalletHeads.id],
      name: "finance_online_payable_source_consumptions_wallet_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_online_payable_source_consumptions_root_once_unique")
      .on(table.rootLotId)
      .where(sql`${table.sourceKind} = 'root'`),
    uniqueIndex("finance_online_payable_source_consumptions_allocation_once_unique")
      .on(table.sourceAllocationId)
      .where(sql`${table.sourceKind} = 'allocation'`),
    check(
      "finance_online_payable_source_consumptions_source_check",
      sql`(${table.sourceKind} = 'root' and ${table.sourceAllocationId} is null)
        or (${table.sourceKind} = 'allocation' and ${table.sourceAllocationId} is not null)`
    ),
    check(
      "finance_online_payable_source_consumptions_disposition_check",
      sql`${table.disposedMinor} >= 0
        and ((${table.disposedMinor} = 0 and ${table.dispositionKind} = 'none')
          or (${table.disposedMinor} > 0 and ${table.dispositionKind} in ('payout_paid', 'refund_confirmed', 'chargeback_confirmed', 'chargeback_recovery', 'platform_loss'))) `
    ),
    index("finance_online_payable_source_consumptions_mutation_idx").on(table.mutationId)
  ]
);

/**
 * Immutable fulfillment/settlement evidence for the first release of a captured online root.
 * It is deliberately not a generic JSON blob: the financial mutation remains queryable back to
 * the exact completed booking event and, where policy requires it, the matched provider record.
 */
export const financeOnlineWalletHoldReleaseEvidence = pgTable(
  "finance_online_wallet_hold_release_evidence",
  {
    mutationId: uuid("mutation_id").primaryKey(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    orderId: varchar("order_id", { length: 200 }).notNull(),
    bookingId: uuid("booking_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    bookingLifecycleEventId: uuid("booking_lifecycle_event_id").notNull(),
    bookingLifecycleRevision: financeRevisionString("booking_lifecycle_revision").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    bookingCompletionDigest: varchar("booking_completion_digest", { length: 71 }).notNull(),
    merchantPayoutInclusionReceiptId: varchar("merchant_payout_inclusion_receipt_id", {
      length: 200
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.mutationId],
      foreignColumns: [financeOnlineWalletMutations.mutationId],
      name: "finance_online_wallet_hold_release_evidence_mutation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rootLotId],
      foreignColumns: [financeOnlineSaleCaptureRootLots.lotId],
      name: "finance_online_wallet_hold_release_evidence_root_lot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.bookingId, table.astrologerUserId],
      foreignColumns: [bookings.id, bookings.ownerUserId],
      name: "finance_online_wallet_hold_release_evidence_booking_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.bookingLifecycleEventId, table.bookingId, table.astrologerUserId],
      foreignColumns: [
        bookingLifecycleEvents.id,
        bookingLifecycleEvents.bookingId,
        bookingLifecycleEvents.ownerUserId
      ],
      name: "finance_online_wallet_hold_release_evidence_booking_event_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.merchantPayoutInclusionReceiptId],
      foreignColumns: [financeMerchantPayoutPaymentInclusions.receiptId],
      name: "finance_online_wallet_hold_release_evidence_merchant_payout_inclusion_fk"
    }).onDelete("restrict"),
    check(
      "finance_online_wallet_hold_release_evidence_identifier_check",
      sql`length(${table.rootLotId}) between 1 and 200
        and btrim(${table.rootLotId}) = ${table.rootLotId}
        and length(${table.orderId}) between 1 and 200
        and btrim(${table.orderId}) = ${table.orderId}
        and ${table.bookingLifecycleRevision} >= 1`
    ),
    check(
      "finance_online_wallet_hold_release_evidence_digest_check",
      sql`${table.bookingCompletionDigest} ~ ${digestPattern}`
    ),
    index("finance_online_wallet_hold_release_evidence_booking_idx").on(
      table.bookingId,
      table.bookingLifecycleEventId
    )
  ]
);

/** Installed after both online capture and mutation tables exist in the consolidated baseline. */
export const financeOnlineWalletMutationIntegritySql = `
create or replace function finance_validate_online_wallet_mutation_insert()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  head_revision numeric;
  head_digest text;
begin
  select revision, last_commitment_digest into strict head_revision, head_digest
  from finance_online_wallet_heads where id = new.wallet_id for update;
  if head_revision <> new.expected_wallet_revision
     or head_digest <> new.previous_commitment_digest then
    raise exception 'online wallet mutation predecessor is stale' using errcode = '40001';
  end if;
  return new;
exception when no_data_found then
  raise exception 'online wallet mutation wallet is missing' using errcode = '23503';
end;
$$;

create trigger finance_online_wallet_mutations_predecessor_guard
before insert on finance_online_wallet_mutations
for each row execute function finance_validate_online_wallet_mutation_insert();

create or replace function finance_reject_online_wallet_mutation_change()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'online wallet mutations are append-only' using errcode = '55000';
end;
$$;

create trigger finance_online_wallet_mutations_immutable
before update or delete on finance_online_wallet_mutations
for each row execute function finance_reject_online_wallet_mutation_change();
create trigger finance_online_wallet_mutations_no_truncate
before truncate on finance_online_wallet_mutations
for each statement execute function finance_reject_online_wallet_mutation_change();

create or replace function finance_validate_online_payable_source_allocation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  consumption_mutation_id uuid;
  consumption_wallet_id uuid;
  consumption_root_lot_id varchar;
begin
  select mutation_id, wallet_id, root_lot_id
    into strict consumption_mutation_id, consumption_wallet_id, consumption_root_lot_id
    from finance_online_payable_source_consumptions
   where consumption_id = new.source_consumption_id;
  if consumption_wallet_id <> new.wallet_id or consumption_root_lot_id <> new.root_lot_id then
    raise exception 'online payable allocation scope does not match its source consumption' using errcode = '23514';
  end if;
  return new;
exception when no_data_found then
  raise exception 'online payable allocation source consumption is missing' using errcode = '23503';
end;
$$;

create trigger finance_online_payable_source_allocations_scope_guard
before insert on finance_online_payable_source_allocations
for each row execute function finance_validate_online_payable_source_allocation();
create trigger finance_online_payable_source_allocations_immutable
before update or delete on finance_online_payable_source_allocations
for each row execute function finance_reject_online_wallet_mutation_change();
create trigger finance_online_payable_source_allocations_no_truncate
before truncate on finance_online_payable_source_allocations
for each statement execute function finance_reject_online_wallet_mutation_change();

create or replace function finance_validate_online_payable_source_consumption()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  source_wallet_id uuid;
  source_root_lot_id varchar;
  source_amount numeric;
  produced_amount numeric;
begin
  if new.source_kind = 'root' then
    select wallet_id, lot_id, amount_minor
      into strict source_wallet_id, source_root_lot_id, source_amount
      from finance_online_sale_capture_root_lots
     where lot_id = new.root_lot_id;
  else
    select wallet_id, root_lot_id, amount_minor
      into strict source_wallet_id, source_root_lot_id, source_amount
      from finance_online_payable_source_allocations
     where allocation_id = new.source_allocation_id;
  end if;
  if source_wallet_id <> new.wallet_id or source_root_lot_id <> new.root_lot_id then
    raise exception 'online payable consumption source is outside its wallet/root scope' using errcode = '23514';
  end if;
  select coalesce(sum(amount_minor), 0) into produced_amount
    from finance_online_payable_source_allocations
   where source_consumption_id = new.consumption_id;
  if produced_amount + new.disposed_minor <> source_amount then
    raise exception 'online payable consumption must conserve its exact source amount' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'online payable consumption source is missing' using errcode = '23503';
end;
$$;

create constraint trigger finance_online_payable_source_consumptions_conservation_guard
after insert on finance_online_payable_source_consumptions
deferrable initially deferred
for each row execute function finance_validate_online_payable_source_consumption();

create trigger finance_online_payable_source_consumptions_immutable
before update or delete on finance_online_payable_source_consumptions
for each row execute function finance_reject_online_wallet_mutation_change();
create trigger finance_online_payable_source_consumptions_no_truncate
before truncate on finance_online_payable_source_consumptions
for each statement execute function finance_reject_online_wallet_mutation_change();

create or replace function finance_reject_online_wallet_hold_release_evidence_change()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'online wallet hold release evidence is append-only' using errcode = '55000';
end;
$$;

create trigger finance_online_wallet_hold_release_evidence_immutable
before update or delete on finance_online_wallet_hold_release_evidence
for each row execute function finance_reject_online_wallet_hold_release_evidence_change();
create trigger finance_online_wallet_hold_release_evidence_no_truncate
before truncate on finance_online_wallet_hold_release_evidence
for each statement execute function finance_reject_online_wallet_hold_release_evidence_change();

create or replace function finance_validate_online_wallet_hold_release_evidence()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  mutation_wallet_id uuid;
  root_wallet_id uuid;
  root_astrologer_user_id uuid;
  root_receipt_id varchar;
  captured_order_id varchar;
  order_booking_id uuid;
  booking_state text;
  booking_revision integer;
  event_kind text;
  event_revision integer;
  event_occurred_at timestamptz;
  event_digest text;
  settlement_required boolean;
  authority_capture_fact_id text;
  inclusion_capture_fact_id text;
begin
  select mutation.wallet_id, root.wallet_id, root.astrologer_user_id, root.receipt_id
    into strict mutation_wallet_id, root_wallet_id, root_astrologer_user_id, root_receipt_id
    from finance_online_wallet_mutations mutation
    join finance_online_sale_capture_root_lots root on root.lot_id = new.root_lot_id
   where mutation.mutation_id = new.mutation_id
     and mutation.operation_kind = 'hold_release';
  if mutation_wallet_id <> root_wallet_id or root_astrologer_user_id <> new.astrologer_user_id then
    raise exception 'hold release evidence does not match mutation wallet/root owner' using errcode = '23514';
  end if;
  select receipt.order_id, order_row.booking_id, booking.state, booking.lifecycle_revision,
         event.event_kind, event.revision, event.occurred_at, event.canonical_digest,
         risk.provider_settlement_required, authority.capture_fact_id
    into strict captured_order_id, order_booking_id, booking_state, booking_revision,
         event_kind, event_revision, event_occurred_at, event_digest,
         settlement_required, authority_capture_fact_id
    from finance_online_sale_capture_receipts receipt
    join orders order_row on order_row.id::text = receipt.order_id
    join bookings booking on booking.id = order_row.booking_id
    join booking_lifecycle_events event on event.id = new.booking_lifecycle_event_id
      and event.booking_id = booking.id and event.owner_user_id = booking.owner_user_id
    join finance_online_sale_capture_authority_bindings authority on authority.receipt_id = receipt.receipt_id
    join finance_risk_policy_versions risk on risk.policy_id = authority.risk_policy_id
      and risk.policy_version = authority.risk_policy_version
      and risk.canonical_digest = authority.risk_policy_digest
   where receipt.receipt_id = root_receipt_id;
  if captured_order_id <> new.order_id
     or order_booking_id <> new.booking_id
     or booking_state <> 'completed'
     or booking_revision <> event_revision
     or event_kind <> 'completed'
     or new.booking_lifecycle_revision <> event_revision
     or new.completed_at <> event_occurred_at
     or new.booking_completion_digest <> event_digest then
    raise exception 'hold release evidence does not match canonical completed booking' using errcode = '23514';
  end if;
  if settlement_required then
    if new.merchant_payout_inclusion_receipt_id is null then
      raise exception 'hold release requires provider settlement evidence' using errcode = '23514';
    end if;
    select capture_fact_id into strict inclusion_capture_fact_id
      from finance_merchant_payout_payment_inclusions
     where receipt_id = new.merchant_payout_inclusion_receipt_id;
    if inclusion_capture_fact_id <> authority_capture_fact_id then
      raise exception 'hold release settlement evidence does not match capture' using errcode = '23514';
    end if;
  elsif new.merchant_payout_inclusion_receipt_id is not null then
    select capture_fact_id into strict inclusion_capture_fact_id
      from finance_merchant_payout_payment_inclusions
     where receipt_id = new.merchant_payout_inclusion_receipt_id;
    if inclusion_capture_fact_id <> authority_capture_fact_id then
      raise exception 'hold release settlement evidence does not match capture' using errcode = '23514';
    end if;
  end if;
  if not exists (
    select 1 from finance_online_payable_source_consumptions consumption
     where consumption.mutation_id = new.mutation_id
       and consumption.root_lot_id = new.root_lot_id
       and consumption.source_kind = 'root'
  ) then
    raise exception 'hold release must consume its exact pending root' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'hold release evidence authority is incomplete' using errcode = '23503';
end;
$$;

create constraint trigger finance_online_wallet_hold_release_evidence_authority_guard
after insert on finance_online_wallet_hold_release_evidence
deferrable initially deferred
for each row execute function finance_validate_online_wallet_hold_release_evidence();

create or replace function finance_validate_online_wallet_hold_release_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.operation_kind = 'hold_release' and not exists (
    select 1 from finance_online_wallet_hold_release_evidence evidence
     where evidence.mutation_id = new.mutation_id
  ) then
    raise exception 'hold release mutation requires immutable fulfillment evidence' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_online_wallet_hold_release_mutation_authority_guard
after insert on finance_online_wallet_mutations
deferrable initially deferred
for each row execute function finance_validate_online_wallet_hold_release_mutation();

create or replace function finance_validate_online_wallet_mutation_projection()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  head_revision numeric;
  head_digest text;
  projected_pending numeric;
  projected_available numeric;
  projected_reserved numeric;
  projected_payout_pending numeric;
  projected_refund_pending numeric;
  projected_recovery_receivable numeric;
begin
  select revision, last_commitment_digest
    into strict head_revision, head_digest
    from finance_online_wallet_heads
   where id = new.wallet_id;
  if head_revision <> new.next_wallet_revision or head_digest <> new.commitment_digest then
    raise exception 'online wallet mutation is not its wallet head commitment' using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_online_payable_source_consumptions
     where mutation_id = new.mutation_id
  ) then
    raise exception 'online wallet mutation must consume at least one payable source' using errcode = '23514';
  end if;
  with open_components as (
    select root.wallet_id, 'pending'::text as bucket, root.amount_minor
      from finance_online_sale_capture_root_lots root
     where root.wallet_id = new.wallet_id
       and not exists (
         select 1 from finance_online_payable_source_consumptions consumption
          where consumption.source_kind = 'root' and consumption.root_lot_id = root.lot_id
       )
    union all
    select allocation.wallet_id, allocation.bucket, allocation.amount_minor
      from finance_online_payable_source_allocations allocation
     where allocation.wallet_id = new.wallet_id
       and not exists (
         select 1 from finance_online_payable_source_consumptions consumption
          where consumption.source_kind = 'allocation'
            and consumption.source_allocation_id = allocation.allocation_id
       )
  )
  select
    coalesce(sum(amount_minor) filter (where bucket = 'pending'), 0),
    coalesce(sum(amount_minor) filter (where bucket = 'available'), 0),
    coalesce(sum(amount_minor) filter (where bucket = 'reserved'), 0),
    coalesce(sum(amount_minor) filter (where bucket = 'payout_pending'), 0),
    coalesce(sum(amount_minor) filter (where bucket = 'refund_pending'), 0),
    coalesce(sum(amount_minor) filter (where bucket = 'recovery_receivable'), 0)
    into projected_pending, projected_available, projected_reserved,
      projected_payout_pending, projected_refund_pending, projected_recovery_receivable
    from open_components;
  if (select pending_minor from finance_online_wallet_heads where id = new.wallet_id) <> projected_pending
     or (select available_minor from finance_online_wallet_heads where id = new.wallet_id) <> projected_available
     or (select reserved_minor from finance_online_wallet_heads where id = new.wallet_id) <> projected_reserved
     or (select payout_pending_minor from finance_online_wallet_heads where id = new.wallet_id) <> projected_payout_pending
     or (select refund_pending_minor from finance_online_wallet_heads where id = new.wallet_id) <> projected_refund_pending
     or (select recovery_receivable_minor from finance_online_wallet_heads where id = new.wallet_id) <> projected_recovery_receivable then
    raise exception 'online wallet head balance does not equal its source-position projection' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'online wallet mutation wallet is missing' using errcode = '23503';
end;
$$;

create constraint trigger finance_online_wallet_mutations_projection_guard
after insert on finance_online_wallet_mutations
deferrable initially deferred
for each row execute function finance_validate_online_wallet_mutation_projection();
`;
