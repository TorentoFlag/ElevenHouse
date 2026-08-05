import { type SQLWrapper, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { financeEconomicPaymentIntents } from "./economic-payments.schema";
import {
  financeCurrencyValues,
  financeNumeric38String,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";
import { orders } from "./orders.schema";
import {
  financeProviderOperationIntents,
  financeProviderOperationResultCommitReceipts
} from "./provider-operations.schema";
import { financeProviderAccounts } from "./provider-accounts.schema";
import {
  financePayableLots,
  financeWalletCommitBindings,
  financeWalletHeads
} from "./wallet.schema";
import { financeCanonicalJsonV1Sql } from "./canonical-json.sql";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");
const identifierCheck = (value: SQLWrapper) =>
  sql`length(trim(${value})) between 1 and 160 and ${value} = trim(${value}) and ${value} !~ '[[:cntrl:]]'`;

/**
 * The durable aggregate for a company-merchant refund initiated by ElevenHouse.
 *
 * `previousCumulativeRefundedMinor` and `approvedCumulativeRefundedMinor` bind each case to a
 * precise cumulative ArcPay fact. They make a partial refund unambiguous and prevent a retry or
 * late webhook from silently reversing the payable twice. Legacy `refunds` remains an inbound
 * provider-event projection and must not be used to authorize this state machine.
 */
export const financeRefundCases = pgTable(
  "finance_refund_cases",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 })
      .notNull()
      .references(() => financeEconomicPaymentIntents.id, { onDelete: "restrict" }),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    previousCumulativeRefundedMinor: financeNumeric38String(
      "previous_cumulative_refunded_minor"
    ).notNull(),
    approvedCumulativeRefundedMinor: financeNumeric38String(
      "approved_cumulative_refunded_minor"
    ).notNull(),
    status: text("status").notNull().default("requested"),
    version: financeRevisionString("version").notNull(),
    approvalAuthorityId: varchar("approval_authority_id", { length: 160 }),
    approvalAuthorityVersion: financeRevisionString("approval_authority_version"),
    approvalAuthorityDigest: varchar("approval_authority_digest", { length: 71 }),
    allocationAuthorityId: varchar("allocation_authority_id", { length: 160 }),
    allocationAuthorityVersion: financeRevisionString("allocation_authority_version"),
    allocationAuthorityDigest: varchar("allocation_authority_digest", { length: 71 }),
    fundingCoverageDigest: varchar("funding_coverage_digest", { length: 71 }),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }),
    providerRefundId: varchar("provider_refund_id", { length: 160 }),
    resultEvidenceArtifactId: varchar("result_evidence_artifact_id", { length: 160 }),
    resultEvidenceDigest: varchar("result_evidence_digest", { length: 71 }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeWalletHeads.id,
        financeWalletHeads.astrologerUserId,
        financeWalletHeads.currency
      ],
      name: "finance_refund_cases_wallet_scope_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_refund_cases_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerOperationIntentId],
      foreignColumns: [financeProviderOperationIntents.id],
      name: "finance_refund_cases_provider_operation_intent_fk"
    }).onDelete("restrict"),
    unique("finance_refund_cases_exact_identity_unique").on(
      table.id,
      table.orderId,
      table.economicPaymentIntentId,
      table.walletId,
      table.astrologerUserId,
      table.currency
    ),
    uniqueIndex("finance_refund_cases_payment_cumulative_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.approvedCumulativeRefundedMinor
    ),
    uniqueIndex("finance_refund_cases_provider_refund_unique")
      .on(
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerRefundId
      )
      .where(sql`${table.providerRefundId} is not null`),
    check(
      "finance_refund_cases_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "finance_refund_cases_identifier_check",
      sql`${identifierCheck(table.id)} and ${identifierCheck(table.economicPaymentIntentId)} and ${identifierCheck(table.seriesId)} and ${identifierCheck(table.providerAccountId)} and ${identifierCheck(table.providerPaymentId)} and (${table.providerRefundId} is null or ${identifierCheck(table.providerRefundId)}) and (${table.allocationAuthorityId} is null or ${identifierCheck(table.allocationAuthorityId)})`
    ),
    check(
      "finance_refund_cases_cumulative_amount_check",
      sql`${table.previousCumulativeRefundedMinor} >= 0 and ${table.approvedCumulativeRefundedMinor} > ${table.previousCumulativeRefundedMinor}`
    ),
    check(
      "finance_refund_cases_version_check",
      sql`${table.version} >= 1 and ${table.providerIdentityVersion} >= 1`
    ),
    check(
      "finance_refund_cases_authority_shape_check",
      sql`(${table.status} = 'requested' and ${table.approvalAuthorityId} is null and ${table.approvalAuthorityVersion} is null and ${table.approvalAuthorityDigest} is null and ${table.allocationAuthorityId} is null and ${table.allocationAuthorityVersion} is null and ${table.allocationAuthorityDigest} is null and ${table.fundingCoverageDigest} is null and ${table.providerOperationIntentId} is null and ${table.approvedAt} is null) or (${table.status} in ('approved', 'provider_unknown', 'succeeded', 'failed', 'allocation_blocked') and ${table.approvalAuthorityId} is not null and ${table.approvalAuthorityVersion} is not null and ${table.approvalAuthorityVersion} >= 1 and ${table.approvalAuthorityDigest} ~ ${digestPattern} and ${table.allocationAuthorityId} is not null and ${table.allocationAuthorityVersion} is not null and ${table.allocationAuthorityVersion} >= 1 and ${table.allocationAuthorityDigest} ~ ${digestPattern} and ${table.fundingCoverageDigest} ~ ${digestPattern} and ${table.approvedAt} is not null)`
    ),
    check(
      "finance_refund_cases_lifecycle_provider_result_check",
      sql`(${table.status} = 'requested' and ${table.providerOperationIntentId} is null and ${table.providerRefundId} is null and ${table.resultEvidenceArtifactId} is null and ${table.resultEvidenceDigest} is null and ${table.terminalAt} is null) or (${table.status} = 'approved' and ${table.providerOperationIntentId} is not null and ${table.providerRefundId} is null and ${table.resultEvidenceArtifactId} is null and ${table.resultEvidenceDigest} is null and ${table.terminalAt} is null) or (${table.status} in ('provider_unknown', 'allocation_blocked') and ${table.providerOperationIntentId} is not null and ${table.terminalAt} is null) or (${table.status} in ('succeeded', 'failed') and ${table.providerOperationIntentId} is not null and ${table.providerRefundId} is not null and ${table.resultEvidenceArtifactId} is not null and ${table.resultEvidenceDigest} ~ ${digestPattern} and ${table.terminalAt} is not null)`
    ),
    check(
      "finance_refund_cases_time_check",
      sql`(${table.approvedAt} is null or ${table.approvedAt} >= ${table.requestedAt}) and (${table.terminalAt} is null or (${table.approvedAt} is not null and ${table.terminalAt} >= ${table.approvedAt})) and ${table.updatedAt} >= ${table.createdAt}`
    ),
    index("finance_refund_cases_order_created_idx").on(table.orderId, table.createdAt, table.id),
    index("finance_refund_cases_pending_resolution_idx").on(table.status, table.updatedAt, table.id)
  ]
);

/**
 * Append-only confirmed refund position history for one captured ArcPay payment.
 *
 * An approved refund reserves its exact allocation against one of these versions, while only a
 * confirmed provider outcome appends the next version.  Keeping the history immutable prevents a
 * later partial refund from silently changing the cumulative provider fact that an earlier case
 * was authorised against.
 */
export const financeRefundCumulativePositions = pgTable(
  "finance_refund_cumulative_positions",
  {
    positionId: varchar("position_id", { length: 160 }).notNull(),
    version: financeRevisionString("version").notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    confirmedCumulativeRefundedMinor: financeNumeric38String(
      "confirmed_cumulative_refunded_minor"
    ).notNull(),
    confirmedCumulativePayableReversedMinor: financeNumeric38String(
      "confirmed_cumulative_payable_reversed_minor"
    ).notNull(),
    confirmedCumulativePlatformReversedMinor: financeNumeric38String(
      "confirmed_cumulative_platform_reversed_minor"
    ).notNull(),
    lastConfirmedAllocationAuthorityId: varchar("last_confirmed_allocation_authority_id", {
      length: 160
    }),
    lastConfirmedAllocationAuthorityVersion: financeRevisionString(
      "last_confirmed_allocation_authority_version"
    ),
    lastConfirmedAllocationAuthorityDigest: varchar("last_confirmed_allocation_authority_digest", {
      length: 71
    }),
    lastConfirmedTerminalAuthorityId: varchar("last_confirmed_terminal_authority_id", {
      length: 160
    }),
    lastConfirmedTerminalAuthorityVersion: financeRevisionString(
      "last_confirmed_terminal_authority_version"
    ),
    lastConfirmedTerminalAuthorityDigest: varchar("last_confirmed_terminal_authority_digest", {
      length: 71
    }),
    positionPayload: jsonb("position_payload").notNull(),
    positionPreimage: text("position_preimage")
      .notNull()
      .default(sql`''`),
    positionDigest: varchar("position_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.positionId, table.version],
      name: "finance_refund_cumulative_positions_pk"
    }),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_refund_cumulative_positions_provider_identity_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_refund_cumulative_positions_provider_version_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.version
    ),
    check(
      "finance_refund_cumulative_positions_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "finance_refund_cumulative_positions_identifier_check",
      sql`${identifierCheck(table.positionId)} and ${identifierCheck(table.seriesId)} and ${identifierCheck(table.providerAccountId)} and ${identifierCheck(table.providerPaymentId)} and (${table.lastConfirmedAllocationAuthorityId} is null or ${identifierCheck(table.lastConfirmedAllocationAuthorityId)}) and (${table.lastConfirmedTerminalAuthorityId} is null or ${identifierCheck(table.lastConfirmedTerminalAuthorityId)})`
    ),
    check(
      "finance_refund_cumulative_positions_amount_check",
      sql`${table.confirmedCumulativeRefundedMinor} >= 0 and ${table.confirmedCumulativePayableReversedMinor} >= 0 and ${table.confirmedCumulativePlatformReversedMinor} >= 0 and ${table.confirmedCumulativePayableReversedMinor} + ${table.confirmedCumulativePlatformReversedMinor} = ${table.confirmedCumulativeRefundedMinor}`
    ),
    check(
      "finance_refund_cumulative_positions_history_shape_check",
      sql`(${table.version} = 0 and ${table.confirmedCumulativeRefundedMinor} = 0 and ${table.confirmedCumulativePayableReversedMinor} = 0 and ${table.confirmedCumulativePlatformReversedMinor} = 0 and ${table.lastConfirmedAllocationAuthorityId} is null and ${table.lastConfirmedAllocationAuthorityVersion} is null and ${table.lastConfirmedAllocationAuthorityDigest} is null and ${table.lastConfirmedTerminalAuthorityId} is null and ${table.lastConfirmedTerminalAuthorityVersion} is null and ${table.lastConfirmedTerminalAuthorityDigest} is null) or (${table.version} >= 1 and ${table.lastConfirmedAllocationAuthorityId} is not null and ${table.lastConfirmedAllocationAuthorityVersion} is not null and ${table.lastConfirmedAllocationAuthorityVersion} >= 1 and ${table.lastConfirmedAllocationAuthorityDigest} ~ ${digestPattern} and ${table.lastConfirmedTerminalAuthorityId} is not null and ${table.lastConfirmedTerminalAuthorityVersion} is not null and ${table.lastConfirmedTerminalAuthorityVersion} >= 1 and ${table.lastConfirmedTerminalAuthorityDigest} ~ ${digestPattern})`
    ),
    check(
      "finance_refund_cumulative_positions_payload_check",
      sql`jsonb_typeof(${table.positionPayload}) = 'object' and ${table.positionDigest} ~ ${digestPattern} and length(${table.positionPreimage}) between 1 and 64000`
    ),
    check(
      "finance_refund_cumulative_positions_version_check",
      sql`${table.version} >= 0 and ${table.providerIdentityVersion} >= 1`
    ),
    index("finance_refund_cumulative_positions_payment_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.version
    )
  ]
);

/**
 * Append-only funding-source position history used while an outbound refund is in flight.
 *
 * The source is deliberately retained as canonical JSON rather than reduced to a polymorphic
 * foreign key: the domain position may point at a payable root, paid/in-flight payout allocation,
 * or one platform journal entry. The approval UoW resolves and locks the authoritative source;
 * this table records the exact pre/post position it approved so terminal handling never
 * recalculates against a later wallet or payout graph.
 */
export const financeRefundFundingPositions = pgTable(
  "finance_refund_funding_positions",
  {
    positionId: varchar("position_id", { length: 160 }).notNull(),
    version: financeRevisionString("version").notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourcePayload: jsonb("source_payload").notNull(),
    capacityMinor: financeNumeric38String("capacity_minor").notNull(),
    freeMinor: financeNumeric38String("free_minor").notNull(),
    reservedMinor: financeNumeric38String("reserved_minor").notNull(),
    consumedMinor: financeNumeric38String("consumed_minor").notNull(),
    positionPayload: jsonb("position_payload").notNull(),
    positionPreimage: text("position_preimage")
      .notNull()
      .default(sql`''`),
    positionDigest: varchar("position_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.positionId, table.version],
      name: "finance_refund_funding_positions_pk"
    }),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_refund_funding_positions_provider_identity_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_refund_funding_positions_provider_history_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.positionId,
      table.version
    ),
    check(
      "finance_refund_funding_positions_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "finance_refund_funding_positions_source_kind_check",
      sql`${table.sourceKind} in ('payable_root_lot', 'paid_payout_allocation', 'in_flight_payout_allocation', 'platform_journal_entry') and jsonb_typeof(${table.sourcePayload}) = 'object'`
    ),
    check(
      "finance_refund_funding_positions_identifier_check",
      sql`${identifierCheck(table.positionId)} and ${identifierCheck(table.seriesId)} and ${identifierCheck(table.providerAccountId)} and ${identifierCheck(table.providerPaymentId)}`
    ),
    check(
      "finance_refund_funding_positions_amount_check",
      sql`${table.capacityMinor} >= 0 and ${table.freeMinor} >= 0 and ${table.reservedMinor} >= 0 and ${table.consumedMinor} >= 0 and ${table.freeMinor} + ${table.reservedMinor} + ${table.consumedMinor} = ${table.capacityMinor}`
    ),
    check(
      "finance_refund_funding_positions_payload_check",
      sql`jsonb_typeof(${table.positionPayload}) = 'object' and ${table.positionDigest} ~ ${digestPattern} and length(${table.positionPreimage}) between 1 and 64000`
    ),
    check(
      "finance_refund_funding_positions_version_check",
      sql`${table.version} >= 0 and ${table.providerIdentityVersion} >= 1`
    ),
    index("finance_refund_funding_positions_latest_idx").on(table.positionId, table.version),
    index("finance_refund_funding_positions_payment_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.positionId,
      table.version
    )
  ]
);

/**
 * Immutable evidence for one funding-position transition of a refund case.
 *
 * An `approved` authority reserves sources before ArcPay I/O; exactly one subsequent `confirmed`
 * or `failed` authority consumes or releases those same sources. The case stores only the digest
 * of the approved authority, while this table preserves the complete audited transition graph.
 */
export const financeRefundFundingTransitionAuthorities = pgTable(
  "finance_refund_funding_transition_authorities",
  {
    refundId: varchar("refund_id", { length: 160 })
      .notNull()
      .references(() => financeRefundCases.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    bindingId: varchar("binding_id", { length: 160 }).notNull(),
    bindingPayload: jsonb("binding_payload").notNull(),
    bindingPreimage: text("binding_preimage")
      .notNull()
      .default(sql`''`),
    bindingDigest: varchar("binding_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    persistedAt: timestamp("persisted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.refundId, table.operation],
      name: "finance_refund_funding_transition_authorities_pk"
    }),
    unique("finance_refund_funding_transition_authorities_exact_binding_unique").on(
      table.refundId,
      table.operation,
      table.bindingId,
      table.bindingDigest
    ),
    check(
      "finance_refund_funding_transition_authorities_operation_check",
      sql`${table.operation} in ('approved', 'confirmed', 'failed')`
    ),
    check(
      "finance_refund_funding_transition_authorities_shape_check",
      sql`${identifierCheck(table.refundId)} and ${identifierCheck(table.bindingId)} and jsonb_typeof(${table.bindingPayload}) = 'object'`
    ),
    check(
      "finance_refund_funding_transition_authorities_digest_check",
      sql`${table.bindingDigest} ~ ${digestPattern} and length(${table.bindingPreimage}) between 1 and 64000`
    ),
    index("finance_refund_funding_transition_authorities_binding_idx").on(
      table.bindingId,
      table.bindingDigest
    )
  ]
);

/**
 * The exact refund allocation approved before an outbound provider refund is dispatched.
 *
 * The terminal worker must rehydrate this snapshot rather than recompute funding against a
 * later wallet/payout state. `allocationDigest` is deliberately the domain allocation digest:
 * it is the hash of the payload without its self-referential `allocationDigest` property.
 */
export const financeRefundAllocationAuthorities = pgTable(
  "finance_refund_allocation_authorities",
  {
    refundId: varchar("refund_id", { length: 160 })
      .primaryKey()
      .references(() => financeRefundCases.id, { onDelete: "restrict" }),
    authorityId: varchar("authority_id", { length: 160 }).notNull(),
    authorityVersion: financeRevisionString("authority_version").notNull(),
    allocationPayload: jsonb("allocation_payload").notNull(),
    allocationPreimage: text("allocation_preimage")
      .notNull()
      .default(sql`''`),
    allocationDigest: varchar("allocation_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    persistedAt: timestamp("persisted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("finance_refund_allocation_authorities_exact_authority_unique").on(
      table.refundId,
      table.authorityId,
      table.authorityVersion,
      table.allocationDigest
    ),
    check(
      "finance_refund_allocation_authorities_shape_check",
      sql`${identifierCheck(table.refundId)} and ${identifierCheck(table.authorityId)} and ${table.authorityVersion} >= 1 and jsonb_typeof(${table.allocationPayload}) = 'object'`
    ),
    check(
      "finance_refund_allocation_authorities_digest_check",
      sql`${table.allocationDigest} ~ ${digestPattern} and length(${table.allocationPreimage}) between 1 and 64000`
    )
  ]
);

/** Immutable terminal application receipt: replay authority is provider result, never webhook payload. */
export const financeRefundResultApplicationReceipts = pgTable(
  "finance_refund_result_application_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    refundId: varchar("refund_id", { length: 160 }).notNull(),
    providerResultReceiptId: uuid("provider_result_receipt_id").notNull(),
    terminalOutcome: text("terminal_outcome").notNull(),
    refundVersion: financeRevisionString("refund_version").notNull(),
    cumulativePositionVersion: financeRevisionString("cumulative_position_version").notNull(),
    terminalAuthorityPayload: jsonb("terminal_authority_payload").notNull(),
    terminalAuthorityDigest: varchar("terminal_authority_digest", { length: 71 }).notNull(),
    terminalEvidencePayload: jsonb("terminal_evidence_payload").notNull(),
    terminalEvidenceDigest: varchar("terminal_evidence_digest", { length: 71 }).notNull(),
    walletCommitReceiptId: varchar("wallet_commit_receipt_id", { length: 200 }),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_refund_result_receipts_refund_fk",
      columns: [table.refundId],
      foreignColumns: [financeRefundCases.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_refund_result_receipts_provider_result_fk",
      columns: [table.providerResultReceiptId],
      foreignColumns: [financeProviderOperationResultCommitReceipts.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_refund_result_receipts_wallet_commit_fk",
      columns: [table.walletCommitReceiptId],
      foreignColumns: [financeWalletCommitBindings.commitReceiptId]
    }).onDelete("restrict"),
    unique("finance_refund_result_receipts_refund_unique").on(table.refundId),
    unique("finance_refund_result_receipts_provider_result_unique").on(
      table.providerResultReceiptId
    ),
    check(
      "finance_refund_result_receipts_outcome_check",
      sql`${table.terminalOutcome} in ('succeeded', 'failed')`
    ),
    check(
      "finance_refund_result_receipts_shape_check",
      sql`${identifierCheck(table.refundId)} and ${table.refundVersion} >= 2 and ${table.cumulativePositionVersion} >= 0 and jsonb_typeof(${table.terminalAuthorityPayload}) = 'object' and jsonb_typeof(${table.terminalEvidencePayload}) = 'object'`
    ),
    check(
      "finance_refund_result_receipts_digest_check",
      sql`${table.terminalAuthorityDigest} ~ ${digestPattern} and ${table.terminalEvidenceDigest} ~ ${digestPattern} and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    )
  ]
);

/**
 * Immutable allocation/link rows for the exact payable descendants reserved by a refund.
 * The wallet journal holds full lineage; this table makes the aggregate-to-lot proof cheap to
 * query and prevents a later payout/refund operation from claiming the same descendant.
 */
export const financeRefundAllocationLinks = pgTable(
  "finance_refund_allocation_links",
  {
    refundId: varchar("refund_id", { length: 160 }).notNull(),
    allocationOrdinal: integer("allocation_ordinal").notNull(),
    sourceLotId: varchar("source_lot_id", { length: 200 }).notNull(),
    refundPendingLotId: varchar("refund_pending_lot_id", { length: 200 }).notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    originalBucket: text("original_bucket").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.refundId, table.allocationOrdinal],
      name: "finance_refund_allocation_links_pk"
    }),
    foreignKey({
      columns: [table.refundId],
      foreignColumns: [financeRefundCases.id],
      name: "finance_refund_allocation_links_refund_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sourceLotId],
      foreignColumns: [financePayableLots.lotId],
      name: "finance_refund_allocation_links_source_lot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.refundPendingLotId],
      foreignColumns: [financePayableLots.lotId],
      name: "finance_refund_allocation_links_refund_pending_lot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rootLotId],
      foreignColumns: [financePayableLots.lotId],
      name: "finance_refund_allocation_links_root_lot_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_refund_allocation_links_pending_lot_unique").on(table.refundPendingLotId),
    check(
      "finance_refund_allocation_links_shape_check",
      sql`${table.allocationOrdinal} >= 0 and ${table.amountMinor} > 0 and ${table.originalBucket} in ('pending', 'available', 'reserved') and ${table.sourceLotId} <> ${table.refundPendingLotId}`
    ),
    check(
      "finance_refund_allocation_links_identifier_check",
      sql`length(trim(${table.refundId})) between 1 and 160 and ${table.refundId} = trim(${table.refundId}) and ${table.refundId} !~ '[[:cntrl:]]' and length(trim(${table.sourceLotId})) between 1 and 200 and ${table.sourceLotId} = trim(${table.sourceLotId}) and ${table.sourceLotId} !~ '[[:cntrl:]]' and length(trim(${table.refundPendingLotId})) between 1 and 200 and ${table.refundPendingLotId} = trim(${table.refundPendingLotId}) and ${table.refundPendingLotId} !~ '[[:cntrl:]]' and length(trim(${table.rootLotId})) between 1 and 200 and ${table.rootLotId} = trim(${table.rootLotId}) and ${table.rootLotId} !~ '[[:cntrl:]]'`
    ),
    index("finance_refund_allocation_links_source_lot_idx").on(table.sourceLotId),
    index("finance_refund_allocation_links_root_lot_idx").on(table.rootLotId)
  ]
);

/** Baseline owner executes this DDL after the refund aggregate tables exist. */
export const financeRefundAllocationAuthorityIntegritySql = `
create extension if not exists pgcrypto;
${financeCanonicalJsonV1Sql}

create or replace function finance_issue_refund_cumulative_position()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  issued_preimage text;
  issued_digest text;
  payload_key_count integer;
begin
  if jsonb_typeof(new.position_payload) <> 'object' then
    raise exception 'refund cumulative position payload does not match its owner'
      using errcode = '23514';
  end if;
  select count(*) into payload_key_count
  from jsonb_object_keys(new.position_payload);
  if not (new.position_payload ?& array[
      'kind', 'schemaVersion', 'authorizationStatus', 'atomicityStatus', 'digestPurpose',
      'positionId', 'providerAccount', 'providerPaymentId', 'currency', 'version',
      'confirmedCumulativeRefunded', 'confirmedCumulativePayableReversed',
      'confirmedCumulativePlatformReversed', 'lastConfirmedAllocationRef',
      'lastConfirmedTerminalAuthorityRef', 'updatedAt', 'positionDigest'
    ]::text[])
    or payload_key_count <> 17
    or new.position_payload ->> 'kind' <> 'refund_cumulative_position'
    or new.position_payload ->> 'schemaVersion' <> '1'
    or new.position_payload ->> 'authorizationStatus' <> 'unverified'
    or new.position_payload ->> 'atomicityStatus' <> 'unverified'
    or new.position_payload ->> 'digestPurpose' <> 'drift_detection_only'
    or new.position_payload ->> 'positionId' <> new.position_id
    or new.position_payload #>> '{providerAccount,providerAccountId}' <> new.provider_account_id
    or new.position_payload #>> '{providerAccount,identityVersion}' <> new.provider_identity_version::text
    or new.position_payload ->> 'providerPaymentId' <> new.provider_payment_id
    or new.position_payload ->> 'currency' <> new.currency
    or new.position_payload ->> 'version' <> new.version::text
    or new.position_payload #>> '{confirmedCumulativeRefunded,amountMinor}' <>
      new.confirmed_cumulative_refunded_minor::text
    or new.position_payload #>> '{confirmedCumulativePayableReversed,amountMinor}' <>
      new.confirmed_cumulative_payable_reversed_minor::text
    or new.position_payload #>> '{confirmedCumulativePlatformReversed,amountMinor}' <>
      new.confirmed_cumulative_platform_reversed_minor::text
    or (new.position_payload #>> '{lastConfirmedAllocationRef,authorityId}') is distinct from
      new.last_confirmed_allocation_authority_id
    or (new.position_payload #>> '{lastConfirmedAllocationRef,version}') is distinct from
      new.last_confirmed_allocation_authority_version::text
    or (new.position_payload #>> '{lastConfirmedAllocationRef,canonicalDigest}') is distinct from
      new.last_confirmed_allocation_authority_digest
    or (new.position_payload #>> '{lastConfirmedTerminalAuthorityRef,authorityId}') is distinct from
      new.last_confirmed_terminal_authority_id
    or (new.position_payload #>> '{lastConfirmedTerminalAuthorityRef,version}') is distinct from
      new.last_confirmed_terminal_authority_version::text
    or (new.position_payload #>> '{lastConfirmedTerminalAuthorityRef,canonicalDigest}') is distinct from
      new.last_confirmed_terminal_authority_digest then
    raise exception 'refund cumulative position payload does not match its owner'
      using errcode = '23514';
  end if;

  begin
    new.updated_at := (new.position_payload ->> 'updatedAt')::timestamptz;
  exception when others then
    raise exception 'refund cumulative position payload has invalid updatedAt'
      using errcode = '23514';
  end;
  issued_preimage := finance_canonical_jsonb_v1(new.position_payload - 'positionDigest');
  issued_digest := 'sha256:' || encode(
    digest(convert_to(issued_preimage, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.position_payload ->> 'positionDigest' <> issued_digest then
    raise exception 'refund cumulative position digest does not match payload'
      using errcode = '23514';
  end if;
  if new.position_digest <> '' and new.position_digest <> issued_digest then
    raise exception 'refund cumulative position digest does not match canonical payload'
      using errcode = '23514';
  end if;
  new.position_preimage := issued_preimage;
  new.position_digest := issued_digest;
  return new;
end;
$$;

create trigger finance_refund_cumulative_positions_00_issue
before insert on finance_refund_cumulative_positions
for each row execute function finance_issue_refund_cumulative_position();

create or replace function finance_reject_refund_cumulative_position_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'refund cumulative positions are append-only' using errcode = '55000';
end;
$$;

create trigger finance_refund_cumulative_positions_immutable
before update or delete on finance_refund_cumulative_positions
for each row execute function finance_reject_refund_cumulative_position_mutation();
create trigger finance_refund_cumulative_positions_no_truncate
before truncate on finance_refund_cumulative_positions
for each statement execute function finance_reject_refund_cumulative_position_mutation();

create or replace function finance_issue_refund_funding_position()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  issued_preimage text;
  issued_digest text;
  payload_key_count integer;
begin
  if jsonb_typeof(new.position_payload) <> 'object' then
    raise exception 'refund funding position payload does not match its owner'
      using errcode = '23514';
  end if;
  select count(*) into payload_key_count
  from jsonb_object_keys(new.position_payload);
  if not (new.position_payload ?& array[
      'kind', 'schemaVersion', 'authorizationStatus', 'atomicityStatus', 'digestPurpose',
      'positionId', 'source', 'providerAccount', 'providerPaymentId', 'currency', 'version',
      'capacity', 'freeAmount', 'reservedAmount', 'consumedAmount', 'activeReservation',
      'updatedAt', 'positionDigest'
    ]::text[])
    or payload_key_count <> 18
    or new.position_payload ->> 'kind' <> 'unverified_refund_funding_position'
    or new.position_payload ->> 'schemaVersion' <> '1'
    or new.position_payload ->> 'authorizationStatus' <> 'unverified'
    or new.position_payload ->> 'atomicityStatus' <> 'unverified'
    or new.position_payload ->> 'digestPurpose' <> 'drift_detection_only'
    or new.position_payload ->> 'positionId' <> new.position_id
    or new.position_payload ->> 'providerPaymentId' <> new.provider_payment_id
    or new.position_payload ->> 'currency' <> new.currency
    or new.position_payload ->> 'version' <> new.version::text
    or new.position_payload #>> '{providerAccount,providerAccountId}' <> new.provider_account_id
    or new.position_payload #>> '{providerAccount,identityVersion}' <>
      new.provider_identity_version::text
    or new.position_payload #>> '{source,kind}' <> new.source_kind
    or finance_canonical_jsonb_v1(new.position_payload -> 'source') <>
      finance_canonical_jsonb_v1(new.source_payload)
    or new.position_payload #>> '{capacity,amountMinor}' <> new.capacity_minor::text
    or new.position_payload #>> '{freeAmount,amountMinor}' <> new.free_minor::text
    or new.position_payload #>> '{reservedAmount,amountMinor}' <> new.reserved_minor::text
    or new.position_payload #>> '{consumedAmount,amountMinor}' <> new.consumed_minor::text
    or new.position_payload #>> '{capacity,currency}' <> new.currency
    or new.position_payload #>> '{freeAmount,currency}' <> new.currency
    or new.position_payload #>> '{reservedAmount,currency}' <> new.currency
    or new.position_payload #>> '{consumedAmount,currency}' <> new.currency
    or ((new.position_payload -> 'activeReservation' = 'null'::jsonb) <>
      (new.reserved_minor = 0)) then
    raise exception 'refund funding position payload does not match its owner'
      using errcode = '23514';
  end if;

  begin
    new.updated_at := (new.position_payload ->> 'updatedAt')::timestamptz;
  exception when others then
    raise exception 'refund funding position payload has invalid updatedAt'
      using errcode = '23514';
  end;
  issued_preimage := finance_canonical_jsonb_v1(new.position_payload - 'positionDigest');
  issued_digest := 'sha256:' || encode(
    digest(convert_to(issued_preimage, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.position_payload ->> 'positionDigest' <> issued_digest then
    raise exception 'refund funding position digest does not match payload'
      using errcode = '23514';
  end if;
  if new.position_digest <> '' and new.position_digest <> issued_digest then
    raise exception 'refund funding position digest does not match canonical payload'
      using errcode = '23514';
  end if;
  new.position_preimage := issued_preimage;
  new.position_digest := issued_digest;
  return new;
end;
$$;

create trigger finance_refund_funding_positions_00_issue
before insert on finance_refund_funding_positions
for each row execute function finance_issue_refund_funding_position();

create or replace function finance_reject_refund_funding_position_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'refund funding positions are append-only' using errcode = '55000';
end;
$$;

create trigger finance_refund_funding_positions_immutable
before update or delete on finance_refund_funding_positions
for each row execute function finance_reject_refund_funding_position_mutation();
create trigger finance_refund_funding_positions_no_truncate
before truncate on finance_refund_funding_positions
for each statement execute function finance_reject_refund_funding_position_mutation();

create or replace function finance_issue_refund_funding_transition_authority()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  issued_preimage text;
  issued_digest text;
  payload_key_count integer;
begin
  if jsonb_typeof(new.binding_payload) <> 'object' then
    raise exception 'refund funding transition authority payload does not match its owner'
      using errcode = '23514';
  end if;
  select count(*) into payload_key_count
  from jsonb_object_keys(new.binding_payload);
  if not (new.binding_payload ?& array[
      'kind', 'schemaVersion', 'authorizationStatus', 'atomicityStatus', 'digestPurpose',
      'bindingId', 'operation', 'positionMutationMode', 'allocationAuthorityRef',
      'priorTransitionBindingRef', 'terminalAuthorityRef', 'transitions', 'occurredAt',
      'bindingDigest'
    ]::text[])
    or payload_key_count <> 14
    or new.binding_payload ->> 'kind' <> 'unverified_refund_funding_transition_binding'
    or new.binding_payload ->> 'schemaVersion' <> '1'
    or new.binding_payload ->> 'authorizationStatus' <> 'unverified'
    or new.binding_payload ->> 'atomicityStatus' <> 'unverified'
    or new.binding_payload ->> 'digestPurpose' <> 'drift_detection_only'
    or new.binding_payload ->> 'bindingId' <> new.binding_id
    or new.binding_payload ->> 'operation' <> new.operation
    or new.binding_payload ->> 'positionMutationMode' <> 'patch_existing_only'
    or jsonb_typeof(new.binding_payload -> 'transitions') <> 'array'
    or jsonb_array_length(new.binding_payload -> 'transitions') = 0 then
    raise exception 'refund funding transition authority payload does not match its owner'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from finance_refund_allocation_authorities allocation
    where allocation.refund_id = new.refund_id
      and allocation.authority_id =
        new.binding_payload #>> '{allocationAuthorityRef,authorityId}'
      and allocation.authority_version::text =
        new.binding_payload #>> '{allocationAuthorityRef,version}'
      and allocation.allocation_digest =
        new.binding_payload #>> '{allocationAuthorityRef,canonicalDigest}'
  ) then
    raise exception 'refund funding transition authority does not bind its allocation'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.binding_payload -> 'transitions') as transition_row(payload)
    where not exists (
      select 1
      from finance_refund_funding_positions expected_position
      join finance_refund_funding_positions next_position
        on next_position.position_id = expected_position.position_id
       and next_position.version = expected_position.version + 1
       and next_position.series_id = expected_position.series_id
       and next_position.provider_account_id = expected_position.provider_account_id
       and next_position.provider_identity_version = expected_position.provider_identity_version
       and next_position.provider_payment_id = expected_position.provider_payment_id
       and next_position.currency = expected_position.currency
      where expected_position.position_id =
          transition_row.payload #>> '{expectedPositionRef,positionId}'
        and expected_position.version::text =
          transition_row.payload #>> '{expectedPositionRef,version}'
        and expected_position.position_digest =
          transition_row.payload #>> '{expectedPositionRef,canonicalDigest}'
        and next_position.position_id =
          transition_row.payload #>> '{nextPosition,positionId}'
        and next_position.version::text =
          transition_row.payload #>> '{nextPosition,version}'
        and next_position.position_digest =
          transition_row.payload #>> '{nextPosition,positionDigest}'
    )
  ) then
    raise exception 'refund funding transition authority does not bind persisted positions'
      using errcode = '23503';
  end if;

  issued_preimage := finance_canonical_jsonb_v1(new.binding_payload - 'bindingDigest');
  issued_digest := 'sha256:' || encode(
    digest(convert_to(issued_preimage, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.binding_payload ->> 'bindingDigest' <> issued_digest then
    raise exception 'refund funding transition authority digest does not match payload'
      using errcode = '23514';
  end if;
  if new.binding_digest <> '' and new.binding_digest <> issued_digest then
    raise exception 'refund funding transition authority digest does not match canonical payload'
      using errcode = '23514';
  end if;
  new.binding_preimage := issued_preimage;
  new.binding_digest := issued_digest;
  new.persisted_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_refund_funding_transition_authorities_00_issue
before insert on finance_refund_funding_transition_authorities
for each row execute function finance_issue_refund_funding_transition_authority();

create or replace function finance_reject_refund_funding_transition_authority_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'refund funding transition authorities are immutable' using errcode = '55000';
end;
$$;

create trigger finance_refund_funding_transition_authorities_immutable
before update or delete on finance_refund_funding_transition_authorities
for each row execute function finance_reject_refund_funding_transition_authority_mutation();
create trigger finance_refund_funding_transition_authorities_no_truncate
before truncate on finance_refund_funding_transition_authorities
for each statement execute function finance_reject_refund_funding_transition_authority_mutation();

create or replace function finance_issue_refund_allocation_authority()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  issued_preimage text;
  issued_digest text;
  payload_key_count integer;
begin
  if jsonb_typeof(new.allocation_payload) <> 'object' then
    raise exception 'refund allocation authority payload does not match its owner'
      using errcode = '23514';
  end if;
  select count(*) into payload_key_count
  from jsonb_object_keys(new.allocation_payload);
  if not (new.allocation_payload ?& array[
      'kind', 'schemaVersion', 'authorizationStatus', 'digestPurpose', 'authorityId',
      'version', 'refundId', 'orderId', 'astrologerUserId', 'providerAccount',
      'providerPaymentId', 'providerIntentId', 'providerRequestDigest', 'approvedAt',
      'allocationStatus', 'fundingStatus', 'priorAllocationAuthorityRef',
      'confirmedCumulativePositionRef', 'refundApprovalAuthorityRef', 'orderEconomics',
      'orderEconomicsDigest', 'capturedGross', 'capturedPayable',
      'capturedPlatformCommission', 'priorCumulativeRefunded', 'nextCumulativeRefunded',
      'priorCumulativePayableReversed', 'nextCumulativePayableReversed',
      'priorCumulativePlatformReversed', 'nextCumulativePlatformReversed', 'refundAmount',
      'payableLotAmount', 'alreadyPaidAmount', 'inFlightPayoutAmount',
      'platformCommissionAmount', 'payableComponents', 'alreadyPaidComponents',
      'inFlightPayoutComponents', 'platformCommissionComponents',
      'providerClearingComponentId', 'allocationDigest'
    ]::text[])
    or payload_key_count <> 41
    or new.allocation_payload ->> 'kind' <> 'refund_posting_allocation_authority'
    or new.allocation_payload ->> 'schemaVersion' <> '1'
    or new.allocation_payload ->> 'authorizationStatus' <> 'unverified'
    or new.allocation_payload ->> 'digestPurpose' <> 'drift_detection_only'
    or new.allocation_payload ->> 'allocationStatus' <> 'approved'
    or new.allocation_payload ->> 'fundingStatus' <> 'fully_funded'
    or new.allocation_payload ->> 'authorityId' <> new.authority_id
    or new.allocation_payload ->> 'version' <> new.authority_version::text
    or new.allocation_payload ->> 'refundId' <> new.refund_id then
    raise exception 'refund allocation authority payload does not match its owner'
      using errcode = '23514';
  end if;

  issued_preimage := finance_canonical_jsonb_v1(new.allocation_payload - 'allocationDigest');
  issued_digest := 'sha256:' || encode(
    digest(convert_to(issued_preimage, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.allocation_payload ->> 'allocationDigest' <> issued_digest then
    raise exception 'refund allocation authority digest does not match payload'
      using errcode = '23514';
  end if;
  if new.allocation_digest <> '' and new.allocation_digest <> issued_digest then
    raise exception 'refund allocation authority digest does not match canonical payload'
      using errcode = '23514';
  end if;
  new.allocation_preimage := issued_preimage;
  new.allocation_digest := issued_digest;
  new.persisted_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_refund_allocation_authorities_00_issue
before insert on finance_refund_allocation_authorities
for each row execute function finance_issue_refund_allocation_authority();

create or replace function finance_reject_refund_allocation_authority_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'refund allocation authorities are immutable' using errcode = '55000';
end;
$$;

create trigger finance_refund_allocation_authorities_immutable
before update or delete on finance_refund_allocation_authorities
for each row execute function finance_reject_refund_allocation_authority_mutation();
create trigger finance_refund_allocation_authorities_no_truncate
before truncate on finance_refund_allocation_authorities
for each statement execute function finance_reject_refund_allocation_authority_mutation();

create or replace function finance_validate_refund_case_allocation_authority()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.allocation_authority_id is not null and not exists (
    select 1
    from finance_refund_allocation_authorities allocation
    where allocation.refund_id = new.id
      and allocation.authority_id = new.allocation_authority_id
      and allocation.authority_version = new.allocation_authority_version
      and allocation.allocation_digest = new.allocation_authority_digest
      and allocation.allocation_payload ->> 'orderId' = new.order_id::text
      and allocation.allocation_payload ->> 'astrologerUserId' = new.astrologer_user_id::text
      and allocation.allocation_payload #>> '{providerAccount,providerAccountId}' = new.provider_account_id
      and allocation.allocation_payload #>> '{providerAccount,identityVersion}' = new.provider_identity_version::text
      and allocation.allocation_payload ->> 'providerPaymentId' = new.provider_payment_id
      and allocation.allocation_payload ->> 'providerIntentId' = new.provider_operation_intent_id
      and allocation.allocation_payload #>> '{priorCumulativeRefunded,amountMinor}' =
        new.previous_cumulative_refunded_minor::text
      and allocation.allocation_payload #>> '{nextCumulativeRefunded,amountMinor}' =
        new.approved_cumulative_refunded_minor::text
      and allocation.allocation_payload #>> '{refundAmount,currency}' = new.currency
      and allocation.allocation_payload #>> '{refundApprovalAuthorityRef,authorityId}' =
        new.approval_authority_id
      and allocation.allocation_payload #>> '{refundApprovalAuthorityRef,version}' =
        new.approval_authority_version::text
      and allocation.allocation_payload #>> '{refundApprovalAuthorityRef,canonicalDigest}' =
        new.approval_authority_digest
      and exists (
        select 1
        from finance_provider_operation_intents provider_operation
        where provider_operation.id = new.provider_operation_intent_id
          and provider_operation.series_id = new.series_id
          and provider_operation.provider_account_id = new.provider_account_id
          and provider_operation.provider_identity_version = new.provider_identity_version
          and provider_operation.economic_payment_intent_id = new.economic_payment_intent_id
          and provider_operation.operation_kind = 'refund'
      )
      and exists (
        select 1
        from finance_refund_cumulative_positions position
        where position.position_id =
            allocation.allocation_payload #>> '{confirmedCumulativePositionRef,positionId}'
          and position.version::text =
            allocation.allocation_payload #>> '{confirmedCumulativePositionRef,version}'
          and position.position_digest =
            allocation.allocation_payload #>> '{confirmedCumulativePositionRef,canonicalDigest}'
          and position.series_id = new.series_id
          and position.provider_account_id = new.provider_account_id
          and position.provider_identity_version = new.provider_identity_version
          and position.provider_payment_id = new.provider_payment_id
          and position.currency = new.currency
          and position.confirmed_cumulative_refunded_minor = new.previous_cumulative_refunded_minor
      )
      and exists (
        select 1
        from finance_refund_funding_transition_authorities funding
        where funding.refund_id = new.id
          and funding.operation = 'approved'
          and funding.binding_digest = new.funding_coverage_digest
          and funding.binding_payload #>> '{allocationAuthorityRef,authorityId}' =
            new.allocation_authority_id
          and funding.binding_payload #>> '{allocationAuthorityRef,version}' =
            new.allocation_authority_version::text
          and funding.binding_payload #>> '{allocationAuthorityRef,canonicalDigest}' =
            new.allocation_authority_digest
      )
  ) then
    raise exception 'refund case allocation authority does not bind its economic identity'
      using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and old.allocation_authority_id is not null and (
    new.allocation_authority_id,
    new.allocation_authority_version,
    new.allocation_authority_digest
  ) is distinct from (
    old.allocation_authority_id,
    old.allocation_authority_version,
    old.allocation_authority_digest
  ) then
    raise exception 'refund case allocation authority is immutable once approved'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger finance_refund_cases_validate_allocation_authority
before insert or update on finance_refund_cases
for each row execute function finance_validate_refund_case_allocation_authority();

create trigger finance_refund_result_application_receipts_immutable
before update or delete on finance_refund_result_application_receipts
for each row execute function finance_reject_refund_cumulative_position_mutation();
`;
