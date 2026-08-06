import { type SQLWrapper, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { financeRefundCandidates } from "./refund-candidates.schema";
import { financeProviderOperationIntents } from "./provider-operations.schema";
import { financeJournalTransactions } from "./ledger.schema";
import {
  financeOnlineSaleCaptureApplications,
  financeOnlineSaleCaptureRootLots,
  financeOnlineWalletHeads
} from "./online-sale-capture.schema";
import {
  financeOnlinePayableSourceAllocations,
  financeOnlineWalletMutations
} from "./online-wallet-mutations.schema";
import { financeNumeric38String, financeRevisionString } from "./finance-values";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");
const identifier = (value: SQLWrapper) =>
  sql`length(trim(${value})) between 1 and 200 and ${value} = trim(${value})`;

/**
 * V2-native outbound refund aggregate. It is created only by the step-up-authorised decision
 * transaction that has already frozen the exact V2 source allocation and provider request.
 * Legacy `finance_refund_cases` intentionally remains outside this graph.
 */
export const financeOnlineWalletRefundCases = pgTable(
  "finance_online_wallet_refund_cases",
  {
    refundCaseId: varchar("refund_case_id", { length: 200 }).primaryKey(),
    refundCandidateId: uuid("refund_candidate_id")
      .notNull()
      .references(() => financeRefundCandidates.id, { onDelete: "restrict" }),
    captureApplicationId: uuid("capture_application_id")
      .notNull()
      .references(() => financeOnlineSaleCaptureApplications.id, { onDelete: "restrict" }),
    rootLotId: varchar("root_lot_id", { length: 200 })
      .notNull()
      .references(() => financeOnlineSaleCaptureRootLots.lotId, { onDelete: "restrict" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => financeOnlineWalletHeads.id, { onDelete: "restrict" }),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    previousCumulativeRefundedMinor: financeNumeric38String(
      "previous_cumulative_refunded_minor"
    ).notNull(),
    approvedCumulativeRefundedMinor: financeNumeric38String(
      "approved_cumulative_refunded_minor"
    ).notNull(),
    refundDeltaMinor: financeNumeric38String("refund_delta_minor").notNull(),
    commissionReversalMinor: financeNumeric38String("commission_reversal_minor").notNull(),
    payableReservationMinor: financeNumeric38String("payable_reservation_minor").notNull(),
    approvalWalletMutationId: uuid("approval_wallet_mutation_id")
      .notNull()
      .references(() => financeOnlineWalletMutations.mutationId, { onDelete: "restrict" }),
    approvalJournalTransactionId: varchar("approval_journal_transaction_id", { length: 200 })
      .notNull()
      .references(() => financeJournalTransactions.id, { onDelete: "restrict" }),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 })
      .notNull()
      .references(() => financeProviderOperationIntents.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    version: financeRevisionString("version").notNull(),
    approvalAuthorityId: varchar("approval_authority_id", { length: 200 }).notNull(),
    approvalAuthorityVersion: financeRevisionString("approval_authority_version").notNull(),
    approvalAuthorityDigest: varchar("approval_authority_digest", { length: 71 }).notNull(),
    providerRefundId: varchar("provider_refund_id", { length: 160 }),
    terminalApplicationId: uuid("terminal_application_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("finance_online_wallet_refund_cases_candidate_unique").on(table.refundCandidateId),
    unique("finance_online_wallet_refund_cases_approval_mutation_unique").on(
      table.approvalWalletMutationId
    ),
    unique("finance_online_wallet_refund_cases_approval_journal_unique").on(
      table.approvalJournalTransactionId
    ),
    unique("finance_online_wallet_refund_cases_provider_intent_unique").on(
      table.providerOperationIntentId
    ),
    uniqueIndex("finance_online_wallet_refund_cases_payment_cumulative_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.approvedCumulativeRefundedMinor
    ),
    uniqueIndex("finance_online_wallet_refund_cases_provider_refund_unique")
      .on(
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerRefundId
      )
      .where(sql`${table.providerRefundId} is not null`),
    check(
      "finance_online_wallet_refund_cases_amount_check",
      sql`${table.previousCumulativeRefundedMinor} >= 0
        and ${table.approvedCumulativeRefundedMinor} > ${table.previousCumulativeRefundedMinor}
        and ${table.refundDeltaMinor} = ${table.approvedCumulativeRefundedMinor} - ${table.previousCumulativeRefundedMinor}
        and ${table.commissionReversalMinor} >= 0
        and ${table.payableReservationMinor} > 0
        and ${table.commissionReversalMinor} + ${table.payableReservationMinor} = ${table.refundDeltaMinor}`
    ),
    check(
      "finance_online_wallet_refund_cases_state_check",
      sql`(${table.status} = 'approved'
            and ${table.version} = 1
            and ${table.providerRefundId} is null
            and ${table.terminalApplicationId} is null
            and ${table.terminalAt} is null)
        or (${table.status} in ('succeeded', 'failed')
            and ${table.version} = 2
            and ${table.providerRefundId} is not null
            and ${table.terminalApplicationId} is not null
            and ${table.terminalAt} is not null)`
    ),
    check(
      "finance_online_wallet_refund_cases_authority_check",
      sql`${table.approvalAuthorityVersion} >= 1
        and ${table.approvalAuthorityDigest} ~ ${digestPattern}
        and ${table.approvedAt} <= coalesce(${table.terminalAt}, ${table.approvedAt})`
    ),
    check(
      "finance_online_wallet_refund_cases_identifier_check",
      sql`${identifier(table.refundCaseId)}
        and ${identifier(table.economicPaymentIntentId)}
        and ${identifier(table.providerAccountSeriesId)}
        and ${identifier(table.providerAccountId)}
        and ${identifier(table.providerPaymentId)}
        and ${identifier(table.approvalAuthorityId)}
        and (${table.providerRefundId} is null or ${identifier(table.providerRefundId)})`
    ),
    index("finance_online_wallet_refund_cases_terminal_queue_idx").on(
      table.status,
      table.updatedAt,
      table.refundCaseId
    )
  ]
);

/** Exact V2 sources reserved by approval; terminal processing consumes only these pending children. */
export const financeOnlineWalletRefundCaseAllocations = pgTable(
  "finance_online_wallet_refund_case_allocations",
  {
    refundCaseId: varchar("refund_case_id", { length: 200 }).notNull(),
    ordinal: integer("ordinal").notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceAllocationId: varchar("source_allocation_id", { length: 200 }),
    sourceBucket: text("source_bucket").notNull(),
    refundPendingAllocationId: varchar("refund_pending_allocation_id", { length: 200 })
      .notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.refundCaseId, table.ordinal],
      name: "finance_online_wallet_refund_case_allocations_pk"
    }),
    foreignKey({
      columns: [table.refundCaseId],
      foreignColumns: [financeOnlineWalletRefundCases.refundCaseId],
      name: "finance_online_wallet_refund_case_allocations_case_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rootLotId],
      foreignColumns: [financeOnlineSaleCaptureRootLots.lotId],
      name: "finance_online_wallet_refund_case_allocations_root_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sourceAllocationId],
      foreignColumns: [financeOnlinePayableSourceAllocations.allocationId],
      name: "finance_online_wallet_refund_case_allocations_source_allocation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.refundPendingAllocationId],
      foreignColumns: [financeOnlinePayableSourceAllocations.allocationId],
      name: "finance_online_wallet_refund_case_allocations_pending_allocation_fk"
    }).onDelete("restrict"),
    unique("finance_online_wallet_refund_case_allocations_pending_unique").on(
      table.refundPendingAllocationId
    ),
    check(
      "finance_online_wallet_refund_case_allocations_shape_check",
      sql`${table.ordinal} >= 0
        and ${table.amountMinor} > 0
        and ((${table.sourceKind} = 'root' and ${table.sourceAllocationId} is null)
          or (${table.sourceKind} = 'allocation' and ${table.sourceAllocationId} is not null))
        and ${table.sourceBucket} in ('pending', 'available', 'reserved')`
    )
  ]
);

/** Immutable case history: approval and the one canonical provider terminal outcome. */
export const financeOnlineWalletRefundCaseTransitions = pgTable(
  "finance_online_wallet_refund_case_transitions",
  {
    refundCaseId: varchar("refund_case_id", { length: 200 }).notNull(),
    version: financeRevisionString("version").notNull(),
    status: text("status").notNull(),
    transitionKind: text("transition_kind").notNull(),
    authorityDigest: varchar("authority_digest", { length: 71 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.refundCaseId, table.version],
      name: "finance_online_wallet_refund_case_transitions_pk"
    }),
    foreignKey({
      columns: [table.refundCaseId],
      foreignColumns: [financeOnlineWalletRefundCases.refundCaseId],
      name: "finance_online_wallet_refund_case_transitions_case_fk"
    }).onDelete("restrict"),
    check(
      "finance_online_wallet_refund_case_transitions_shape_check",
      sql`${table.version} >= 1
        and ${table.status} in ('approved', 'succeeded', 'failed')
        and ${table.transitionKind} in ('approved', 'provider_succeeded', 'provider_failed')
        and ${table.authorityDigest} ~ ${digestPattern}`
    )
  ]
);

export const financeOnlineWalletRefundCaseIntegritySql = `
create or replace function finance_reject_online_wallet_refund_case_change()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'online wallet refund cases cannot be deleted' using errcode = '55000';
  end if;
  if new.refund_case_id <> old.refund_case_id
     or new.refund_candidate_id <> old.refund_candidate_id
     or new.capture_application_id <> old.capture_application_id
     or new.root_lot_id <> old.root_lot_id
     or new.wallet_id <> old.wallet_id
     or new.economic_payment_intent_id <> old.economic_payment_intent_id
     or new.provider_operation_intent_id <> old.provider_operation_intent_id
     or new.approval_wallet_mutation_id <> old.approval_wallet_mutation_id
     or new.approval_journal_transaction_id <> old.approval_journal_transaction_id
     or new.approved_cumulative_refunded_minor <> old.approved_cumulative_refunded_minor
     or new.approval_authority_digest <> old.approval_authority_digest then
    raise exception 'online wallet refund case authority is immutable' using errcode = '55000';
  end if;
  if old.status <> 'approved' or new.version <> old.version + 1 then
    raise exception 'online wallet refund case transition is invalid' using errcode = '40001';
  end if;
  return new;
end;
$$;
create trigger finance_online_wallet_refund_cases_transition_guard
before update or delete on finance_online_wallet_refund_cases
for each row execute function finance_reject_online_wallet_refund_case_change();
create trigger finance_online_wallet_refund_cases_no_truncate
before truncate on finance_online_wallet_refund_cases
for each statement execute function finance_reject_online_wallet_refund_case_change();

create or replace function finance_reject_online_wallet_refund_case_child_change()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'online wallet refund case evidence is append-only' using errcode = '55000';
end;
$$;
create trigger finance_online_wallet_refund_case_allocations_immutable
before update or delete on finance_online_wallet_refund_case_allocations
for each row execute function finance_reject_online_wallet_refund_case_child_change();
create trigger finance_online_wallet_refund_case_transitions_immutable
before update or delete on finance_online_wallet_refund_case_transitions
for each row execute function finance_reject_online_wallet_refund_case_child_change();
`;
