import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  hashFinanceCommandPayload,
  type ApplyVerifiedRefundResultCommand
} from "@elevenhouse/domain/finance-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { buildTerminalEvidenceBinding } from "../../../../domain/src/finance-core/postings/refund-posting-terminal-evidence-test-fixture";
import { buildRefundFailedPosting } from "../../../../domain/src/finance-core/postings/refund-terminal-posting";
import { buildZeroPayableRefundFixture } from "../../../../domain/src/finance-core/postings/refund-posting-bridge-test-fixtures";
import { readRefundPostingAllocationAuthority } from "../../../../domain/src/finance-core/postings/refund-posting-allocation-codec";
import {
  buildRefundFundingApprovalFixture,
  buildRefundFundingTerminalFixture
} from "../../../../domain/src/finance-core/postings/refund-position-test-fixtures";
import type { UnverifiedRefundFundingPosition } from "../../../../domain/src/finance-core/postings/refund-funding-position-types";
import {
  refundPostingDecoderEnvelope,
  withAllocationDigest
} from "../../../../domain/src/finance-core/postings/refund-posting-test-fixtures";
import { receiptDecoderEnvelope } from "../../../../domain/src/finance-core/postings/payable-lot-posting-link-test-fixtures";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  createDrizzleRefundResultApplicationUnitOfWork
} from "./drizzle-refund-result-application-uow";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_refund_result_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const digest = `sha256:${"a".repeat(64)}`;

describe.sequential("refund terminal result PostgreSQL integration", () => {
  const admin = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ElevenHouseDatabase;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool) as unknown as ElevenHouseDatabase;
    await pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await admin.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await admin.end();
    }
  }, 30_000);

  it("applies a definitive failure once, replays provider truth, and rejects stale case version", async () => {
    const fixture = await seedApprovedFailedRefundFixture();
    const unitOfWork = createDrizzleRefundResultApplicationUnitOfWork({ database });

    await expect(
      unitOfWork.applyVerifiedRefundResult({
        ...fixture.command,
        expectedRefundVersion: 1
      })
    ).rejects.toMatchObject({ reason: "refund_version_conflict" });

    const first = await unitOfWork.applyVerifiedRefundResult(fixture.command);
    const replayed = await unitOfWork.applyVerifiedRefundResult(fixture.command);

    expect(first).toMatchObject({
      kind: "refund_result_application_commit_receipt",
      refundId: fixture.refundId,
      refundVersion: 3,
      cumulativePositionVersion: "0",
      terminalOutcome: "failed",
      walletJournalCommitReceipt: null
    });
    expect(replayed).toEqual(first);
    expect(
      await scalar("select count(*)::text from finance_refund_result_application_receipts")
    ).toBe("1");
    expect(
      await scalar(
        "select status || ':' || version::text from finance_refund_cases where id = $1",
        [fixture.refundId]
      )
    ).toBe("failed:3");
    expect(
      await scalar(
        "select count(*)::text from finance_refund_funding_transition_authorities where refund_id = $1 and operation = 'failed'",
        [fixture.refundId]
      )
    ).toBe("1");
  });

  async function seedApprovedFailedRefundFixture(): Promise<{
    refundId: string;
    command: ApplyVerifiedRefundResultCommand;
  }> {
    const refundId = "refund-bridge-1";
    const orderId = randomUUID();
    const astrologerUserId = randomUUID();
    const walletId = randomUUID();
    const base = buildZeroPayableRefundFixture("failed");
    if (!base.terminalAuthority || !base.terminalEvidenceBinding) {
      throw new Error("missing failed refund fixture");
    }
    const terminalAuthority = base.terminalAuthority;
    if (terminalAuthority.kind !== "refund_failed") {
      throw new Error("expected failed refund terminal fixture");
    }
    const economics = Object.freeze({
      ...base.allocation.orderEconomics,
      orderId,
      astrologerUserId
    });
    const allocation = readRefundPostingAllocationAuthority(
      withAllocationDigest({
        ...base.allocation,
        orderId,
        astrologerUserId,
        orderEconomics: economics,
        orderEconomicsDigest: hashFinanceCommandPayload(economics)
      }),
      refundPostingDecoderEnvelope
    );
    const operationReceipt = base.operationReceipt;
    const terminalEvidenceBinding = buildTerminalEvidenceBinding(
      allocation,
      terminalAuthority,
      operationReceipt
    );
    const approval = buildRefundFundingApprovalFixture(allocation);
    const fundingTransitionBinding = buildRefundFundingTerminalFixture(
      allocation,
      approval.binding,
      terminalAuthority
    );
    const sourceTerminalPosting = buildRefundFailedPosting(
      {
        allocation: base.allocation,
        resolvedPriorAllocation: base.resolvedPriorAllocation,
        resolvedCumulativePosition: base.resolvedCumulativePosition,
        fundingTransitionBinding: base.fundingTransitionBinding,
        terminalAuthority: base.terminalAuthority,
        terminalEvidenceBinding: base.terminalEvidenceBinding,
        operationReceipt,
        postingIdentity: base.postingIdentity
      },
      refundPostingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    const terminalPosting = Object.freeze({
      ...sourceTerminalPosting,
      fundingTransitionBinding,
      terminalEvidenceBinding
    });

    await seedProviderIdentity();
    for (const position of [base.resolvedCumulativePosition]) {
      await pool.query(
        `insert into finance_refund_cumulative_positions (
          position_id, version, series_id, provider_account_id, provider_identity_version,
          provider_payment_id, currency, confirmed_cumulative_refunded_minor,
          confirmed_cumulative_payable_reversed_minor, confirmed_cumulative_platform_reversed_minor,
          position_payload
        ) values ($1, $2, 'arc-series-live-primary', $3, $4, $5, 'RUB', $6, $7, $8, $9::jsonb)`,
        [
          position.positionId,
          position.version,
          position.providerAccount.providerAccountId,
          position.providerAccount.identityVersion,
          position.providerPaymentId,
          position.confirmedCumulativeRefunded.amountMinor,
          position.confirmedCumulativePayableReversed.amountMinor,
          position.confirmedCumulativePlatformReversed.amountMinor,
          JSON.stringify(position)
        ]
      );
    }
    const persistedFundingPositions: readonly UnverifiedRefundFundingPosition[] = [
      ...approval.positions,
      ...approval.binding.transitions.map((transition) => transition.nextPosition)
    ];
    for (const position of persistedFundingPositions) {
      await pool.query(
        `insert into finance_refund_funding_positions (
          position_id, version, series_id, provider_account_id, provider_identity_version,
          provider_payment_id, currency, source_kind, source_payload, capacity_minor, free_minor,
          reserved_minor, consumed_minor, position_payload
        ) values ($1, $2, 'arc-series-live-primary', $3, $4, $5, 'RUB', $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb)`,
        [
          position.positionId,
          position.version,
          position.providerAccount.providerAccountId,
          position.providerAccount.identityVersion,
          position.providerPaymentId,
          position.source.kind,
          JSON.stringify(position.source),
          position.capacity.amountMinor,
          position.freeAmount.amountMinor,
          position.reservedAmount.amountMinor,
          position.consumedAmount.amountMinor,
          JSON.stringify(position)
        ]
      );
    }

    // These rows are upstream authority already verified by their own UoWs. We only need their
    // immutable persisted shape for the terminal adapter; all terminal writes below retain the
    // real baseline triggers and constraints.
    await pool.query("set session_replication_role = replica");
    try {
      await pool.query(
        `insert into finance_wallet_heads (
          id, astrologer_user_id, currency, revision, mutation_sequence, pending_minor, available_minor,
          reserved_minor, payout_pending_minor, refund_pending_minor, recovery_receivable_minor,
          lot_state_version, lot_state_digest, snapshot_digest, last_operation_id, last_commit_binding_id
        ) values ($1, $2, 'RUB', 1, 1, 0, 0, 0, 0, 0, 0, 2, $3, $3, 'fixture-wallet', 'fixture-binding')`,
        [walletId, astrologerUserId, digest]
      );
      await pool.query(
        `insert into finance_provider_operation_intents (
          id, economic_payment_intent_id, correlated_economic_payment_version, economic_payment_session_id,
          series_id, provider_account_id, provider_identity_version, purpose, source_id, operation_kind,
          dispatch_step, status, version, source_chain_version, predecessor_intent_id,
          predecessor_source_chain_version, replacement_authority_digest, idempotency_key,
          idempotency_retention_deadline, canonical_request_digest, dispatch_authorization_id,
          dispatch_authorization_version, dispatch_authorization_digest, operation_policy_id,
          operation_policy_version, operation_policy_digest, operation_maximum_rows,
          operation_maximum_decimal_digits, operation_maximum_artifact_bytes, restricted_credential_id,
          restricted_credential_version, transient_secret_ref_id, provider_unknown_observed_at, terminal_at
        ) values ($1, 'payment-intent-1', 1, null, 'arc-series-live-primary', 'arc-account-live', 3,
          'client_order', $2, 'refund', null, 'pending_dispatch', 2, 1, null, null, null, 'refund-result-fixture',
          clock_timestamp() + interval '1 day', $3, 'refund-approval-authority', 1, $3,
          'refund-policy', 1, $3, 32, 8, 1048576, null, null, null, null, null)`,
        [allocation.providerIntentId, refundId, allocation.providerRequestDigest]
      );
      const providerResultReceiptId = randomUUID();
      await pool.query(
        `insert into finance_provider_operation_result_commit_receipts (
          id, provider_operation_result_id, provider_operation_intent_id, provider_operation_intent_version,
          economic_payment_intent_id, correlated_economic_payment_version, economic_payment_session_id,
          series_id, provider_account_id, provider_identity_version, purpose, source_id, operation_kind,
          outcome, provider_operation_id, provider_payment_id, amount_minor, currency,
          canonical_request_digest, idempotency_key, evidence_artifact_id, evidence_artifact_digest,
          observed_at, result_committed_at, canonical_preimage, canonical_digest,
          persistence_transaction_boundary_ref, committed_at
        ) values ($1, 'provider-result-fixture', $2, 2, 'payment-intent-1', 1, null,
          'arc-series-live-primary', 'arc-account-live', 3, 'client_order', $3, 'refund', 'failed',
          'provider-operation-fixture', $4, 1000, 'RUB', $5, 'refund-result-fixture', $6, $7,
          $8::timestamptz, $8::timestamptz, 'fixture', $9, 'postgres-xid:1', $8::timestamptz)`,
        [
          providerResultReceiptId,
          allocation.providerIntentId,
          refundId,
          allocation.providerPaymentId,
          allocation.providerRequestDigest,
          terminalAuthority.canonicalEvidenceId,
          terminalEvidenceBinding.providerIntent.canonicalEvidence.digest,
          terminalAuthority.failedAt,
          digest
        ]
      );
      await pool.query(
        `insert into finance_refund_cases (
          id, order_id, economic_payment_intent_id, wallet_id, astrologer_user_id, currency, series_id,
          provider_account_id, provider_identity_version, provider_payment_id,
          previous_cumulative_refunded_minor, approved_cumulative_refunded_minor, status, version,
          approval_authority_id, approval_authority_version, approval_authority_digest,
          allocation_authority_id, allocation_authority_version, allocation_authority_digest,
          funding_coverage_digest, provider_operation_intent_id, requested_at, approved_at
        ) values ($1, $2::uuid, 'payment-intent-1', $3::uuid, $4::uuid, 'RUB',
          'arc-series-live-primary', 'arc-account-live', 3, $5, 0, 1000, 'approved', 2,
          $6, 1, $7, $8, $9, $10, $11, $12, '2026-08-03T11:00:00Z', '2026-08-03T12:00:00Z')`,
        [
          refundId,
          orderId,
          walletId,
          astrologerUserId,
          allocation.providerPaymentId,
          allocation.refundApprovalAuthorityRef.authorityId,
          allocation.refundApprovalAuthorityRef.canonicalDigest,
          allocation.authorityId,
          allocation.version,
          allocation.allocationDigest,
          approval.binding.bindingDigest,
          allocation.providerIntentId
        ]
      );
    } finally {
      await pool.query("set session_replication_role = origin");
    }
    await pool.query(
      `insert into finance_refund_allocation_authorities (
        refund_id, authority_id, authority_version, allocation_payload
      ) values ($1, $2, $3, $4::jsonb)`,
      [refundId, allocation.authorityId, allocation.version, JSON.stringify(allocation)]
    );
    await pool.query(
      `insert into finance_refund_funding_transition_authorities (
        refund_id, operation, binding_id, binding_payload
      ) values ($1, 'approved', $2, $3::jsonb)`,
      [refundId, approval.binding.bindingId, JSON.stringify(approval.binding)]
    );

    const command = {
      refundId,
      expectedRefundVersion: 2,
      walletId,
      expectedWalletRevision: "1",
      expectedCumulativePositionVersion: "0",
      providerResult: {
        kind: "provider_operation_result_commit_receipt",
        providerOperationResultId: "provider-result-fixture",
        providerOperationIntentId: allocation.providerIntentId,
        providerOperationIntentVersion: 2,
        providerOperationId: "provider-operation-fixture",
        operationKind: "refund",
        economicPaymentIntentId: "payment-intent-1",
        correlatedEconomicPaymentVersion: 1,
        economicPaymentSessionId: null,
        sourceId: refundId,
        purpose: "client_order",
        providerAccount: { ...allocation.providerAccount, seriesId: "arc-series-live-primary" },
        outcome: "failed",
        providerPaymentId: allocation.providerPaymentId,
        amountMinor: "1000",
        currency: "RUB",
        evidenceArtifactId: terminalAuthority.canonicalEvidenceId,
        evidenceArtifactDigest: terminalEvidenceBinding.providerIntent.canonicalEvidence.digest,
        canonicalRequestDigest: allocation.providerRequestDigest,
        observedAt: terminalAuthority.failedAt,
        persistenceTransactionBoundaryRef: "postgres-xid:1",
        committedAt: terminalAuthority.failedAt
      },
      refundOutcome: {
        kind: "verified_refund_provider_outcome",
        providerAccount: { ...allocation.providerAccount, seriesId: "arc-series-live-primary" },
        refundId,
        providerRefundId: terminalAuthority.providerRefundId,
        providerPaymentId: allocation.providerPaymentId,
        outcome: "failed",
        cumulativeRefundedMinor: "0",
        currency: "RUB",
        artifact: {
          kind: "raw_provider_artifact_ref",
          artifactId: terminalAuthority.canonicalEvidenceId,
          sha256Digest: terminalEvidenceBinding.providerIntent.canonicalEvidence.digest
        },
        observedAt: terminalAuthority.failedAt
      },
      execution: {
        kind: "refund_result_execution_proposal",
        allocation,
        resolvedPriorAllocation: null,
        resolvedCumulativePosition: base.resolvedCumulativePosition,
        resolvedFundingPositions: approval.binding.transitions.map(
          (transition) => transition.nextPosition
        ),
        fundingTransitionBinding,
        terminalAuthority,
        terminalEvidenceBinding,
        terminalPosting,
        walletJournalMutation: null
      },
      postingDecoderEnvelope: refundPostingDecoderEnvelope,
      operationEnvelope: {
        kind: "resolved_finance_operation_envelope",
        policyId: "refund-policy",
        policyVersion: 1,
        policyDigest: digest,
        maximumRows: 32,
        maximumDecimalDigits: 8,
        maximumArtifactBytes: 1_048_576
      }
    } as unknown as ApplyVerifiedRefundResultCommand;
    return { refundId, command };
  }

  async function scalar(
    text: string,
    values: (string | number | null)[] = []
  ): Promise<string | null> {
    const result = await pool.query(`select (${text}) as value`, values);
    const row = result.rows[0] as { value?: unknown } | undefined;
    return typeof row?.value === "string" ? row.value : null;
  }

  async function seedProviderIdentity(): Promise<void> {
    await pool.query("begin");
    try {
      await pool.query(
        `insert into finance_provider_account_series (series_id, provider, active_identity_version, head_version)
         values ('arc-series-live-primary', 'arc_pay', 1, 1)`
      );
      await insertProviderAccount(1, "arc-account-live-v1", null, null);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
    for (const [version, accountId, predecessorAccountId, predecessorVersion] of [
      [2, "arc-account-live-v2", "arc-account-live-v1", 1],
      [3, "arc-account-live", "arc-account-live-v2", 2]
    ] as const) {
      await pool.query("begin");
      try {
        await pool.query(
          `update finance_provider_account_series
             set active_identity_version = $1::integer, head_version = $1::numeric
           where series_id = 'arc-series-live-primary'
             and active_identity_version = $2::integer and head_version = $2::numeric`,
          [version, version - 1]
        );
        await insertProviderAccount(version, accountId, predecessorAccountId, predecessorVersion);
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback");
        throw error;
      }
    }
  }

  async function insertProviderAccount(
    version: number,
    accountId: string,
    predecessorAccountId: string | null,
    predecessorVersion: number | null
  ): Promise<void> {
    await pool.query(
      `insert into finance_provider_accounts (
        series_id, provider_account_id, identity_version, provider, merchant_tenant_id,
        environment, terminal_scope, settlement_scope, predecessor_provider_account_id,
        predecessor_identity_version
      ) values ('arc-series-live-primary', $1, $2, 'arc_pay', 'elevenhouse-live',
        'live', 'primary-payins', 'merchant-ledger-primary', $3, $4)`,
      [accountId, version, predecessorAccountId, predecessorVersion]
    );
  }
});

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "run refund result integration tests against"
  );
}

function withDatabaseName(databaseUrl: string, targetDatabaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}
