import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createHash, randomUUID } from "node:crypto";

import {
  createBankLiquiditySnapshotAttestationAuthorizationPayload,
  createCapturedProviderPaymentSemanticSourceId,
  createOrderEconomicsSnapshot,
  createRiskPolicySnapshot,
  digestFinanceCanonicalValueV1,
  hashFinanceCommandPayload
} from "@elevenhouse/domain/finance-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { financeArtifactRetentionPolicies } from "../../schema/finance/finance-artifacts.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import {
  createDrizzleChargebackClientOrderWebhookClaimPort,
  createDrizzleCapturedClientOrderWebhookClaimPort,
  createDrizzleRefundedClientOrderWebhookClaimPort
} from "./drizzle-captured-client-order-webhook-claim-port";
import { createDrizzleEconomicPaymentIntentCreationUnitOfWork } from "./drizzle-economic-payment-intent-creation-uow";
import { createDrizzleEconomicPaymentSessionOpenUnitOfWork } from "./drizzle-economic-payment-session-open-uow";
import { createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork } from "./drizzle-online-sale-capture-canonical-webhook-uow";
import { createDrizzleOnlineSaleCapturePersistenceResolver } from "./drizzle-online-sale-capture-persistence-resolver";
import { createDrizzleOnlineWalletHoldReleaseUnitOfWork } from "./drizzle-online-wallet-hold-release-uow";
import {
  createDrizzleOnlineWalletPayoutRequestUnitOfWork,
  OnlineWalletPayoutRequestPersistenceError
} from "./drizzle-online-wallet-payout-request-uow";
import { createDrizzleOnlineWalletPayoutRequestReader } from "./drizzle-online-wallet-payout-request-reader";
import { createDrizzleOnlineWalletPayoutReviewUnitOfWork } from "./drizzle-online-wallet-payout-review-uow";
import { createDrizzleOnlineWalletPayoutExecutionUnitOfWork } from "./drizzle-online-wallet-payout-execution-uow";
import { createDrizzleBankLiquiditySnapshotAdoptionUnitOfWork } from "./drizzle-bank-liquidity-snapshot-adoption-uow";
import { createDrizzleBankLiquiditySnapshotAttestationUnitOfWork } from "./drizzle-bank-liquidity-snapshot-attestation-uow";
import { createDrizzleBankStatementIngestionUnitOfWork } from "./drizzle-bank-statement-ingestion-uow";
import { createDrizzleBankCashMatchUnitOfWork } from "./drizzle-bank-cash-match-uow";
import { createDrizzleCashPoolDirectoryBootstrapPort } from "./drizzle-cash-pool-directory-bootstrap";
import { createDrizzleOnlineWalletRefundApplicationUnitOfWork } from "./drizzle-online-wallet-refund-application-uow";
import { createDrizzleOnlineWalletRefundApprovalUnitOfWork } from "./drizzle-online-wallet-refund-approval-uow";
import { createDrizzleOnlineWalletRefundTerminalUnitOfWork } from "./drizzle-online-wallet-refund-terminal-uow";
import { createDrizzleOnlineWalletChargebackCaseUnitOfWork } from "./drizzle-online-wallet-chargeback-case-uow";
import { createDrizzleOnlineWalletChargebackResolutionUnitOfWork, OnlineWalletChargebackResolutionPersistenceError } from "./drizzle-online-wallet-chargeback-resolution-uow";
import { createDrizzleOnlineWalletRefundPositionReader } from "./drizzle-online-wallet-refund-position-reader";
import { createDrizzleWebhookIngressStorageUnitOfWork } from "./drizzle-webhook-ingress-storage-uow";
import { createDrizzleBookingCommandStore } from "../scheduling/drizzle-booking-command-store";
import { createFinanceArtifactRegistry, type FinanceArtifactRegistry } from "./finance-artifact-registry";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_online_capture_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-online-capture",
  providerAccountId: "arc-online-capture-account",
  identityVersion: 1
});

describe.sequential("canonical online-sale capture on the full PostgreSQL baseline", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let runtime: PostgresRuntime;
  let artifacts: FinanceArtifactRegistry;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readCurrentMigrationSql());
    artifacts = createFinanceArtifactRegistry(runtime.database);
    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(financeProviderAccountSeries).values({
        seriesId: providerAccount.seriesId,
        provider: "arc_pay",
        activeIdentityVersion: providerAccount.identityVersion,
        headVersion: "1"
      });
      await transaction.insert(financeProviderAccounts).values({
        ...providerAccount,
        provider: "arc_pay",
        merchantTenantId: "elevenhouse-online-capture",
        terminalScope: "hosted-and-saved-card",
        settlementScope: "company-settlement",
        predecessorProviderAccountId: null,
        predecessorIdentityVersion: null
      });
      await transaction.insert(financeArtifactRetentionPolicies).values([
        {
          policyId: "online-capture-webhook-retention",
          policyVersion: "1",
          artifactClass: "provider_webhook",
          retainForSeconds: "3600",
          authorityRef: "integration-test",
          effectiveAt: new Date("2020-01-01T00:00:00.000Z")
        },
        {
          policyId: "online-capture-canonical-retention",
          policyVersion: "1",
          artifactClass: "provider_canonical_read",
          retainForSeconds: "3600",
          authorityRef: "integration-test",
          effectiveAt: new Date("2020-01-01T00:00:00.000Z")
        },
        {
          policyId: "online-capture-provider-request-retention",
          policyVersion: "1",
          artifactClass: "provider_request",
          retainForSeconds: "3600",
          authorityRef: "integration-test",
          effectiveAt: new Date("2020-01-01T00:00:00.000Z")
        }
      ]);
    });
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("commits the sealed semantic fact, v2 wallet, journal, clearing and paid order in one full-baseline transaction", async () => {
    const fixture = await seedCaptureFixture();
    const claims = createDrizzleCapturedClientOrderWebhookClaimPort({
      database: runtime.database,
      workerId: "online-capture-integration-worker",
      leaseDurationSeconds: 60,
      retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
    });
    const claim = await claims.claimNextCapturedClientOrderWebhook();
    expect(claim).toMatchObject({
      inboxItemId: fixture.inboxItemId,
      inboxVersion: 2,
      expectedCheckpointSequence: 1,
      providerAccount
    });

    const unitOfWork = createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
      database: runtime.database,
      workerId: "online-capture-integration-worker",
      mutationResolver: createDrizzleOnlineSaleCapturePersistenceResolver()
    });
    const receipt = await unitOfWork.applyCanonicalOnlineSaleCapture({
      semanticFact: {
        inboxItemId: claim!.inboxItemId,
        expectedInboxVersion: claim!.inboxVersion,
        expectedCheckpointSequence: claim!.expectedCheckpointSequence,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId: fixture.webhookId,
          semanticSourceKind: "payment_transition",
          semanticSourceId: createCapturedProviderPaymentSemanticSourceId(fixture.providerPaymentId),
          economicPaymentIntentId: fixture.intentId,
          economicPaymentSessionId: fixture.sessionId,
          providerPaymentId: fixture.providerPaymentId,
          amountMinor: "10000",
          currency: "RUB",
          purpose: "client_order",
          canonicalFactDigest: fixture.canonicalFactDigest,
          artifact: fixture.canonicalArtifact,
          observedAt: fixture.observedAt
        },
        operationEnvelope: operationEnvelope()
      },
      capture: {
        economicPaymentIntentId: fixture.intentId,
        expectedEconomicPaymentVersion: 2,
        operationEnvelope: operationEnvelope()
      }
    } as never);

    expect(receipt.effect).toBe("applied_once");
    await expect(
      runtime.pool.query(
        `select
           inbox.processing_status as inbox_status,
           intent.state as intent_state, intent.version::text as intent_version,
           session.state as session_state, session.version::text as session_version,
           order_row.status as order_status,
           wallet.pending_minor::text as wallet_pending_minor,
           wallet.revision::text as wallet_revision,
           clearing.state as clearing_state,
           (select count(*)::int from finance_provider_semantic_facts) as semantic_fact_count,
           (select count(*)::int from finance_capture_facts) as capture_fact_count,
           (select count(*)::int from finance_online_sale_capture_receipts) as capture_receipt_count,
           (select count(*)::int from finance_journal_transactions) as journal_count
         from finance_webhook_inbox inbox
         join finance_economic_payment_intents intent on intent.id = $2
         join finance_economic_payment_sessions session on session.id = $3
         join orders order_row on order_row.id = $4
         join finance_online_wallet_heads wallet on wallet.astrologer_user_id = $5
         join finance_payment_clearing_heads clearing on clearing.economic_payment_intent_id = intent.id
         where inbox.id = $1`,
        [fixture.inboxItemId, fixture.intentId, fixture.sessionId, fixture.orderId, fixture.astrologerUserId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          inbox_status: "completed",
          intent_state: "captured",
          intent_version: "3",
          session_state: "captured",
          session_version: "2",
          order_status: "paid",
          wallet_pending_minor: "9600",
          wallet_revision: "1",
          clearing_state: "unmatched",
          semantic_fact_count: 1,
          capture_fact_count: 1,
          capture_receipt_count: 1,
          journal_count: 1
        }
      ]
    });

    const completedAt = new Date().toISOString();
    await createDrizzleBookingCommandStore(runtime.database).executeOwnerCompletion(
      {
        actorUserId: fixture.astrologerUserId,
        scope: "bookings.owner.complete",
        key: `complete-${fixture.bookingId}`,
        requestHash: sha(`complete:${fixture.bookingId}`),
        now: completedAt,
        expiresAt: new Date(Date.parse(completedAt) + 86_400_000).toISOString()
      },
      { bookingId: fixture.bookingId, expectedLifecycleRevision: 1 }
    );
    const releaseResults = await Promise.all([
      createDrizzleOnlineWalletHoldReleaseUnitOfWork({ database: runtime.database })
        .releaseDueOnlineWalletHolds({ now: completedAt, limit: 10 }),
      createDrizzleOnlineWalletHoldReleaseUnitOfWork({ database: runtime.database })
        .releaseDueOnlineWalletHolds({ now: completedAt, limit: 10 })
    ]);
    expect(releaseResults.reduce((total, result) => total + result.released, 0)).toBe(1);
    const released = releaseResults
      .flatMap((result) => result.receipts)
      .find((receipt) => receipt.effect === "applied_once");
    expect(released).toMatchObject({ effect: "applied_once", walletRevision: "2" });
    await expect(
      createDrizzleOnlineWalletHoldReleaseUnitOfWork({ database: runtime.database })
        .releaseDueOnlineWalletHolds({ now: completedAt, limit: 10 })
    ).resolves.toMatchObject({ scanned: 0, released: 0 });

    await expect(
      runtime.pool.query(
        `select pending_minor::text as pending_minor, available_minor::text as available_minor,
                reserved_minor::text as reserved_minor, revision::text as revision
           from finance_online_wallet_heads where id = $1`,
        [released?.walletId]
      )
    ).resolves.toMatchObject({
      rows: [{ pending_minor: "0", available_minor: "8640", reserved_minor: "960", revision: "2" }]
    });
    await expect(
      runtime.pool.query(
        `select (select count(*)::int from finance_online_wallet_mutations) as mutation_count,
                (select count(*)::int from finance_online_payable_source_consumptions) as consumption_count,
                (select count(*)::int from finance_online_wallet_hold_release_evidence) as evidence_count,
                (select count(*)::int from finance_journal_transactions
                   where id like 'online-wallet-hold-release:%') as release_journal_count`
      )
    ).resolves.toMatchObject({
      rows: [
        {
          mutation_count: 1,
          consumption_count: 1,
          evidence_count: 1,
          release_journal_count: 1
        }
      ]
    });

    const payoutMethodId = randomUUID();
    await runtime.pool.query(
      `insert into payout_methods
         (id, astrologer_user_id, method, currency, display_name, is_default, version)
       values ($1, $2, 'manual_bank_transfer', 'RUB', 'Основной банковский счёт', true, 1)`,
      [payoutMethodId, fixture.astrologerUserId]
    );
    await runtime.pool.query(
      `insert into payout_method_versions
         (payout_method_id, version, destination_kind, beneficiary_fingerprint, redacted_display,
          sealed_destination_ref)
       values ($1, 1, 'bank_account', $2, 'Счёт **** 6789', $3)`,
      [payoutMethodId, sha("beneficiary"), "kms://integration/payout-destination/v1"]
    );
    const payoutRequestId = `online-payout-${randomUUID()}`;
    const payoutReader = createDrizzleOnlineWalletPayoutRequestReader({
      database: runtime.database
    });
    await expect(
      payoutReader.findWalletId({ astrologerUserId: fixture.astrologerUserId, currency: "RUB" })
    ).resolves.toBe(released!.walletId);
    const payoutCommand = {
      payoutRequestId,
      walletId: released!.walletId,
      astrologerUserId: fixture.astrologerUserId,
      amountMinor: "5000",
      currency: "RUB" as const,
      destination: {
        kind: "sealed_payout_destination_snapshot" as const,
        payoutMethodId,
        payoutMethodVersion: 1,
        destinationKind: "bank_account" as const,
        beneficiaryFingerprint: sha("beneficiary"),
        redactedDisplay: "Счёт **** 6789",
        sealedDestinationRef: "kms://integration/payout-destination/v1"
      },
      requestAuthority: {
        authorityId: `payout-request-authority:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-request-authority:${payoutRequestId}`)
      },
      occurredAt: completedAt
    };
    const payoutRequest = await createDrizzleOnlineWalletPayoutRequestUnitOfWork({
      database: runtime.database
    }).createOnlineWalletPayoutRequest(payoutCommand);
    expect(payoutRequest).toMatchObject({
      effect: "applied_once",
      payoutRequestId,
      walletId: released!.walletId,
      walletRevision: "3",
      payoutVersion: "1"
    });
    await expect(
      payoutReader.findPayoutRequest({ payoutRequestId, astrologerUserId: fixture.astrologerUserId })
    ).resolves.toMatchObject({
      payoutRequestId,
      walletId: released!.walletId,
      amountMinor: "5000",
      currency: "RUB",
      status: "requested",
      version: "1"
    });
    await expect(
      payoutReader.listPayoutRequests({ statuses: ["requested"], limit: 50 })
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payoutRequestId,
          status: "requested",
          latestTransitionActorUserId: fixture.astrologerUserId
        })
      ])
    );
    await expect(
      payoutReader.listPayoutRequestsForAstrologer({
        astrologerUserId: fixture.astrologerUserId,
        limit: 10
      })
    ).resolves.toEqual([
      expect.objectContaining({
        payoutRequestId,
        astrologerUserId: fixture.astrologerUserId,
        status: "requested"
      })
    ]);
    await expect(
      payoutReader.listPayoutRequestsForAstrologer({
        astrologerUserId: randomUUID(),
        limit: 10
      })
    ).resolves.toEqual([]);
    await expect(
      createDrizzleOnlineWalletPayoutRequestUnitOfWork({ database: runtime.database })
        .createOnlineWalletPayoutRequest(payoutCommand)
    ).resolves.toMatchObject({ effect: "replayed", walletRevision: "3" });
    const rolledBackPayoutRequestId = `online-payout-${randomUUID()}`;
    await expect(
      runtime.database.transaction(async (transaction) => {
        await createDrizzleOnlineWalletPayoutRequestUnitOfWork({ database: transaction })
          .createOnlineWalletPayoutRequest({
            ...payoutCommand,
            payoutRequestId: rolledBackPayoutRequestId,
            amountMinor: "1",
            requestAuthority: {
              authorityId: `payout-request-authority:${rolledBackPayoutRequestId}`,
              authorityVersion: "1",
              authorityDigest: sha(`payout-request-authority:${rolledBackPayoutRequestId}`)
            }
          });
        throw new Error("rollback outer payout command transaction");
      })
    ).rejects.toThrow("rollback outer payout command transaction");
    await expect(
      payoutReader.findPayoutRequest({
        payoutRequestId: rolledBackPayoutRequestId,
        astrologerUserId: fixture.astrologerUserId
      })
    ).resolves.toBeNull();
    await expect(
      runtime.pool.query(
        `select wallet.available_minor::text as available_minor,
                wallet.payout_pending_minor::text as payout_pending_minor,
                wallet.revision::text as wallet_revision,
                request.status as request_status, request.version::text as request_version,
                (select count(*)::int from finance_online_payout_request_allocations
                   where payout_request_id = $2) as allocation_count,
                (select count(*)::int from finance_online_payable_source_consumptions
                   where mutation_id = $3) as consumption_count
           from finance_online_wallet_heads wallet
           join finance_online_payout_requests request on request.wallet_id = wallet.id
          where wallet.id = $1 and request.id = $2`,
        [released!.walletId, payoutRequestId, payoutRequest.mutationId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          available_minor: "3640",
          payout_pending_minor: "5000",
          wallet_revision: "3",
          request_status: "requested",
          request_version: "1",
          allocation_count: 1,
          consumption_count: 1
        }
      ]
    });

    const concurrentPayoutRequestId = `online-payout-${randomUUID()}`;
    const concurrentCommand = {
      ...payoutCommand,
      payoutRequestId: concurrentPayoutRequestId,
      amountMinor: "1000",
      requestAuthority: {
        authorityId: `payout-request-authority:${concurrentPayoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-request-authority:${concurrentPayoutRequestId}`)
      }
    };
    const concurrentResults = await Promise.all([
      createDrizzleOnlineWalletPayoutRequestUnitOfWork({ database: runtime.database })
        .createOnlineWalletPayoutRequest(concurrentCommand),
      createDrizzleOnlineWalletPayoutRequestUnitOfWork({ database: runtime.database })
        .createOnlineWalletPayoutRequest(concurrentCommand)
    ]);
    expect(concurrentResults.map((result) => result.effect).sort()).toEqual([
      "applied_once",
      "replayed"
    ]);

    const reviewerUserId = randomUUID();
    const approverUserId = randomUUID();
    await runtime.pool.query("insert into users (id) values ($1), ($2)", [
      reviewerUserId,
      approverUserId
    ]);
    const review = await createDrizzleOnlineWalletPayoutReviewUnitOfWork({
      database: runtime.database
    }).transitionOnlineWalletPayout({
      payoutRequestId,
      expectedPayoutVersion: "1",
      nextStatus: "under_review",
      actorUserId: reviewerUserId,
      adminNote: "Review opened",
      authority: {
        authorityId: `payout-review-authority:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-review-authority:${payoutRequestId}`)
      },
      occurredAt: completedAt
    });
    expect(review).toMatchObject({
      effect: "applied_once",
      payoutRequestId,
      previousStatus: "requested",
      status: "under_review",
      payoutVersion: "2"
    });
    const bankCashPoolId = `online-payout-rub-${randomUUID()}`;
    await createDrizzleCashPoolDirectoryBootstrapPort({ database: runtime.database })
      .ensureEmptySystemCashPoolReference({
        bankCashPoolId,
        currency: "RUB",
        bankAccountFingerprint: sha(`bank-account:${bankCashPoolId}`),
        statementSourceFingerprint: sha(`statement-source:${bankCashPoolId}`)
      });
    const expiredAttestation = await attestLiquiditySnapshot({
      bankCashPoolId,
      expectedBankLiquidityRevision: "0",
      unrestrictedAvailableMinor: "10000",
      sourceCheckpoint: `statement:${bankCashPoolId}:1`,
      asOf: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 250).toISOString()
    });
    const expiredLiquiditySnapshot = await createDrizzleBankLiquiditySnapshotAdoptionUnitOfWork({
      database: runtime.database
    }).adoptVerifiedLiquiditySnapshot({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "0",
      evidence: expiredAttestation.evidence,
      operationEnvelope: operationEnvelope()
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const expiredApprovalCommand = {
      payoutRequestId,
      expectedPayoutVersion: "2",
      expectedBeneficiaryFingerprint: payoutCommand.destination.beneficiaryFingerprint,
      bankCashPoolId,
      currency: "RUB" as const,
      expectedBankLiquidityRevision: "1",
      adoptedLiquiditySnapshot: expiredLiquiditySnapshot.ref,
      occurredAt: new Date().toISOString(),
      operationEnvelope: operationEnvelope()
    } as const;
    await expect(
      createDrizzleOnlineWalletPayoutReviewUnitOfWork({ database: runtime.database })
        .approveOnlineWalletPayout({
          ...expiredApprovalCommand,
          actorUserId: reviewerUserId,
          authority: {
            authorityId: `payout-approve-authority:${payoutRequestId}`,
            authorityVersion: "1",
            authorityDigest: sha(`payout-approve-authority:${payoutRequestId}`)
          }
        } as never)
    ).rejects.toMatchObject({ code: "online_wallet_payout_review_persistence_error" });
    await expect(
      createDrizzleOnlineWalletPayoutReviewUnitOfWork({ database: runtime.database })
        .approveOnlineWalletPayout({
          ...expiredApprovalCommand,
          actorUserId: approverUserId,
          authority: {
            authorityId: `expired-payout-approve-authority:${payoutRequestId}`,
            authorityVersion: "1",
            authorityDigest: sha(`expired-payout-approve-authority:${payoutRequestId}`)
          }
        } as never)
    ).rejects.toMatchObject({ code: "online_wallet_payout_review_persistence_error" });
    const freshAttestation = await attestLiquiditySnapshot({
      bankCashPoolId,
      expectedBankLiquidityRevision: "1",
      unrestrictedAvailableMinor: "10000",
      sourceCheckpoint: `statement:${bankCashPoolId}:2`,
      asOf: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const liquiditySnapshot = await createDrizzleBankLiquiditySnapshotAdoptionUnitOfWork({
      database: runtime.database
    }).adoptVerifiedLiquiditySnapshot({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "1",
      evidence: freshAttestation.evidence,
      operationEnvelope: operationEnvelope()
    } as never);
    const approvalCommand = {
      ...expiredApprovalCommand,
      expectedBankLiquidityRevision: "2",
      adoptedLiquiditySnapshot: liquiditySnapshot.ref
    } as const;
    await expect(
      createDrizzleOnlineWalletPayoutReviewUnitOfWork({ database: runtime.database })
        .approveOnlineWalletPayout({
          ...approvalCommand,
          actorUserId: approverUserId,
          authority: {
            authorityId: `payout-approve-authority:${payoutRequestId}`,
            authorityVersion: "1",
            authorityDigest: sha(`payout-approve-authority:${payoutRequestId}`)
          }
        } as never)
    ).resolves.toMatchObject({
      effect: "applied_once",
      bankExposureVersion: "1",
      bankLiquidityRevision: "3",
      payoutVersion: "3"
    });
    await expect(
      runtime.pool.query(
        `select request.status, request.version::text as payout_version,
                exposure.state as exposure_state, exposure.version::text as exposure_version,
                liquidity.revision::text as liquidity_revision,
                liquidity.available_liquidity_minor::text as available_liquidity_minor,
                (select count(*)::int from finance_online_payout_approval_receipts) as approval_receipt_count
           from finance_online_payout_requests request
           join finance_bank_exposures exposure on exposure.payout_request_id = request.id
           join finance_bank_liquidity_heads liquidity
             on liquidity.bank_cash_pool_id = exposure.bank_cash_pool_id and liquidity.currency = exposure.currency
          where request.id = $1`,
        [payoutRequestId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          status: "approved",
          payout_version: "3",
          exposure_state: "committed",
          exposure_version: "1",
          liquidity_revision: "3",
          available_liquidity_minor: "5000",
          approval_receipt_count: 1
        }
      ]
    });

    const approvalReceiptResult = await runtime.pool.query<{
      receipt_id: string;
      canonical_digest: `sha256:${string}`;
    }>(
      `select receipt_id, canonical_digest
         from finance_online_payout_approval_receipts
        where payout_request_id = $1`,
      [payoutRequestId]
    );
    const approvalReceipt = approvalReceiptResult.rows[0];
    expect(approvalReceipt).toBeDefined();
    const executorActorUserId = randomUUID();
    const confirmerActorUserId = randomUUID();
    await runtime.pool.query("insert into users (id) values ($1), ($2)", [
      executorActorUserId,
      confirmerActorUserId
    ]);
    const executionUnitOfWork = createDrizzleOnlineWalletPayoutExecutionUnitOfWork({
      database: runtime.database
    });
    const execution = await executionUnitOfWork.startOnlineWalletPayoutManualExecution({
      payoutRequestId,
      expectedPayoutVersion: "3",
      expectedBankExposureVersion: "1",
      approval: {
        kind: "online_wallet_payout_approval_receipt",
        receiptId: approvalReceipt!.receipt_id,
        canonicalDigest: approvalReceipt!.canonical_digest
      },
      executorActorUserId,
      authority: {
        authorityId: `payout-execute-authority:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-execute-authority:${payoutRequestId}`)
      },
      occurredAt: new Date().toISOString()
    } as never);
    expect(execution).toMatchObject({
      effect: "applied_once",
      payoutVersion: "4",
      bankExposureVersion: "2",
      state: "processing_manual"
    });
    await expect(
      executionUnitOfWork.startOnlineWalletPayoutManualExecution({
        payoutRequestId,
        expectedPayoutVersion: "3",
        expectedBankExposureVersion: "1",
        approval: {
          kind: "online_wallet_payout_approval_receipt",
          receiptId: approvalReceipt!.receipt_id,
          canonicalDigest: approvalReceipt!.canonical_digest
        },
        executorActorUserId,
        authority: {
          authorityId: `payout-execute-authority:${payoutRequestId}`,
          authorityVersion: "1",
          authorityDigest: sha(`payout-execute-authority:${payoutRequestId}`)
        },
        occurredAt: new Date().toISOString()
      } as never)
    ).resolves.toMatchObject({ effect: "replayed", payoutVersion: "4" });

    const transferArtifactId = `payout-transfer-proof-${randomUUID()}`;
    const transferArtifactDigest = sha(`payout-transfer-proof:${transferArtifactId}`);
    const transferRetentionPolicyId = `payout-transfer-retention-${randomUUID()}`;
    const evidenceNow = new Date("2020-01-01T00:00:00.000Z");
    await runtime.pool.query(
      `insert into finance_artifact_retention_policies
         (policy_id, policy_version, artifact_class, retain_for_seconds, authority_ref, effective_at)
       values ($1, 1, 'bank_transfer_evidence', 86400, 'integration-test', $2)`,
      [transferRetentionPolicyId, evidenceNow]
    );
    await runtime.pool.query(
      `insert into finance_artifacts
         (id, artifact_class, sha256_digest, byte_length, content_type, binding_kind,
          bank_cash_pool_id, currency, statement_source_fingerprint, private_object_key,
          private_object_version, envelope_key_version, retention_policy_id, retention_policy_version,
          retained_until)
       values ($1, 'bank_transfer_evidence', $2, 2048, 'application/pdf', 'bank_cash_pool',
               $3, 'RUB', $4, $5, 'v1', 'kms-v1', $6, 1, $7)`,
      [
        transferArtifactId,
        transferArtifactDigest,
        bankCashPoolId,
        sha(`statement-source:${bankCashPoolId}`),
        `private/payout-transfer/${transferArtifactId}`,
        transferRetentionPolicyId,
        new Date("2030-01-01T00:00:00.000Z")
      ]
    );
    const transferredAt = new Date().toISOString();
    const paid = await executionUnitOfWork.confirmOnlineWalletPayoutPaid({
      payoutRequestId,
      expectedPayoutVersion: "4",
      expectedWalletRevision: "4",
      expectedBankExposureVersion: "2",
      approval: {
        kind: "online_wallet_payout_approval_receipt",
        receiptId: approvalReceipt!.receipt_id,
        canonicalDigest: approvalReceipt!.canonical_digest
      },
      bankReference: `manual-bank-${payoutRequestId}`,
      transferredAt,
      evidenceArtifactId: transferArtifactId,
      evidenceArtifactDigest: transferArtifactDigest,
      confirmerActorUserId,
      authority: {
        authorityId: `payout-paid-authority:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-paid-authority:${payoutRequestId}`)
      },
      occurredAt: new Date(Date.now() + 1).toISOString()
    } as never);
    expect(paid).toMatchObject({
      effect: "applied_once",
      payoutVersion: "5",
      walletRevision: "5",
      bankExposureVersion: "3",
      bankExposureState: "paid_unreflected"
    });
    await expect(
      runtime.pool.query(
        `select request.status, request.version::text as payout_version,
                wallet.payout_pending_minor::text as payout_pending_minor,
                wallet.available_minor::text as available_minor,
                wallet.revision::text as wallet_revision,
                exposure.state as exposure_state, exposure.version::text as exposure_version,
                (select count(*)::int from finance_online_payout_execution_receipts
                  where payout_request_id = request.id) as execution_receipt_count,
                (select count(*)::int from finance_online_payout_paid_receipts
                  where payout_request_id = request.id) as paid_receipt_count,
                (select count(*)::int from finance_journal_entries entry
                   join finance_accounts account on account.id = entry.account_id
                  where entry.journal_transaction_id = $2 and account.code = 'bank_cash') as bank_cash_entry_count,
                (select count(*)::int from finance_journal_entries entry
                   join finance_accounts account on account.id = entry.account_id
                  where entry.journal_transaction_id = $2 and account.code = 'bank_outbound_clearing') as outbound_clearing_entry_count
           from finance_online_payout_requests request
           join finance_online_wallet_heads wallet on wallet.id = request.wallet_id
           join finance_bank_exposures exposure on exposure.payout_request_id = request.id
          where request.id = $1`,
        [payoutRequestId, paid.journalTransactionId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          status: "paid",
          payout_version: "5",
          payout_pending_minor: "1000",
          available_minor: "2640",
          wallet_revision: "5",
          exposure_state: "paid_unreflected",
          exposure_version: "3",
          execution_receipt_count: 1,
          paid_receipt_count: 1,
          bank_cash_entry_count: 0,
          outbound_clearing_entry_count: 1
        }
      ]
    });
    await expect(
      executionUnitOfWork.confirmOnlineWalletPayoutPaid({
        payoutRequestId,
        expectedPayoutVersion: "4",
        expectedWalletRevision: "4",
        expectedBankExposureVersion: "2",
        approval: {
          kind: "online_wallet_payout_approval_receipt",
          receiptId: approvalReceipt!.receipt_id,
          canonicalDigest: approvalReceipt!.canonical_digest
        },
        bankReference: `manual-bank-${payoutRequestId}`,
        transferredAt,
        evidenceArtifactId: transferArtifactId,
        evidenceArtifactDigest: transferArtifactDigest,
        confirmerActorUserId,
        authority: {
          authorityId: `payout-paid-authority:${payoutRequestId}`,
          authorityVersion: "1",
          authorityDigest: sha(`payout-paid-authority:${payoutRequestId}`)
        },
        occurredAt: new Date(Date.now() + 2).toISOString()
      } as never)
    ).resolves.toMatchObject({ effect: "replayed", payoutVersion: "5" });

    const statementArtifactId = `payout-statement-${randomUUID()}`;
    const statementArtifactDigest = sha(`payout-statement:${statementArtifactId}`);
    const statementRetentionPolicyId = `payout-statement-retention-${randomUUID()}`;
    const statementObservedAt = new Date().toISOString();
    await runtime.pool.query(
      `insert into finance_artifact_retention_policies
         (policy_id, policy_version, artifact_class, retain_for_seconds, authority_ref, effective_at)
       values ($1, 1, 'bank_statement', 86400, 'integration-test', $2)`,
      // A retention policy is an operational prerequisite, not evidence timed at the statement
      // observation instant. Keep the fixture deterministically effective before the trigger's
      // clock_timestamp() registration time.
      [statementRetentionPolicyId, new Date("2020-01-01T00:00:00.000Z")]
    );
    await runtime.pool.query(
      `insert into finance_artifacts
         (id, artifact_class, sha256_digest, byte_length, content_type, binding_kind,
          bank_cash_pool_id, currency, statement_source_fingerprint, private_object_key,
          private_object_version, envelope_key_version, retention_policy_id, retention_policy_version,
          retained_until)
       values ($1, 'bank_statement', $2, 2048, 'application/pdf', 'bank_cash_pool',
               $3, 'RUB', $4, $5, 'v1', 'kms-v1', $6, 1, $7)`,
      [
        statementArtifactId,
        statementArtifactDigest,
        bankCashPoolId,
        sha(`statement-source:${bankCashPoolId}`),
        `private/payout-statement/${statementArtifactId}`,
        statementRetentionPolicyId,
        new Date("2030-01-01T00:00:00.000Z")
      ]
    );
    const ingestion = await createDrizzleBankStatementIngestionUnitOfWork({ database: runtime.database })
      .ingestVerifiedStatementEntry({
        bankCashPoolId,
        expectedStatementImportVersion: "1",
        evidence: {
          kind: "verified_bank_statement_evidence",
          bankCashPoolId,
          bankStatementEntryId: `payout-statement-entry:${payoutRequestId}`,
          sourceStatementId: `payout-statement:${bankCashPoolId}`,
          sourceCheckpoint: `payout-statement:${bankCashPoolId}:1`,
          sourceRowId: `payout-row:${payoutRequestId}`,
          direction: "debit",
          amountMinor: "5000",
          currency: "RUB",
          occurredAt: statementObservedAt,
          bankReference: `manual-bank-${payoutRequestId}`,
          artifact: {
            artifactId: statementArtifactId,
            sha256Digest: statementArtifactDigest,
            byteLength: 2048,
            bankCashPoolId,
            statementSourceFingerprint: sha(`statement-source:${bankCashPoolId}`)
          }
        },
        operationEnvelope: operationEnvelope()
      } as never);
    expect(ingestion).toMatchObject({
      sourceCheckpoint: `payout-statement:${bankCashPoolId}:1`,
      dedupeResult: "inserted",
      journalTransactionId: null
    });
    await expect(
      createDrizzleBankStatementIngestionUnitOfWork({ database: runtime.database })
        .ingestVerifiedStatementEntry({
          bankCashPoolId,
          expectedStatementImportVersion: "1",
          evidence: {
            kind: "verified_bank_statement_evidence",
            bankCashPoolId,
            bankStatementEntryId: `payout-statement-entry:${payoutRequestId}`,
            sourceStatementId: `payout-statement:${bankCashPoolId}`,
            sourceCheckpoint: `payout-statement:${bankCashPoolId}:tampered`,
            sourceRowId: `payout-row:${payoutRequestId}`,
            direction: "debit",
            amountMinor: "5000",
            currency: "RUB",
            occurredAt: statementObservedAt,
            bankReference: `manual-bank-${payoutRequestId}`,
            artifact: {
              artifactId: statementArtifactId,
              sha256Digest: statementArtifactDigest,
              byteLength: 2048,
              bankCashPoolId,
              statementSourceFingerprint: sha(`statement-source:${bankCashPoolId}`)
            }
          },
          operationEnvelope: operationEnvelope()
        } as never)
    ).rejects.toMatchObject({
      code: "bank_statement_ingestion_persistence_error",
      reason: "statement_conflict"
    });
    await expect(runtime.pool.query(
      `select
         (select count(*)::int from finance_bank_statement_imports) as imports,
         (select count(*)::int from finance_bank_statement_rows) as rows,
         (select count(*)::int from finance_bank_statement_ingestion_receipts) as receipts,
         (select count(*)::int from finance_bank_matches) as matches`
    )).resolves.toMatchObject({ rows: [{ imports: 1, rows: 1, receipts: 1, matches: 0 }] });

    const matchUnitOfWork = createDrizzleBankCashMatchUnitOfWork({ database: runtime.database });
    const ingestCandidate = async (suffix: string, amountMinor: string, bankReference: string) => {
      const artifactId = `payout-statement-${suffix}-${randomUUID()}`;
      const artifactDigest = sha(`payout-statement:${artifactId}`);
      await runtime.pool.query(
        `insert into finance_artifacts
           (id, artifact_class, sha256_digest, byte_length, content_type, binding_kind,
            bank_cash_pool_id, currency, statement_source_fingerprint, private_object_key,
            private_object_version, envelope_key_version, retention_policy_id, retention_policy_version,
            retained_until)
         values ($1, 'bank_statement', $2, 2048, 'application/pdf', 'bank_cash_pool',
                 $3, 'RUB', $4, $5, 'v1', 'kms-v1', $6, 1, $7)`,
        [
          artifactId,
          artifactDigest,
          bankCashPoolId,
          sha(`statement-source:${bankCashPoolId}`),
          `private/payout-statement/${artifactId}`,
          statementRetentionPolicyId,
          new Date("2030-01-01T00:00:00.000Z")
        ]
      );
      return createDrizzleBankStatementIngestionUnitOfWork({ database: runtime.database })
        .ingestVerifiedStatementEntry({
          bankCashPoolId,
          expectedStatementImportVersion: "1",
          evidence: {
            kind: "verified_bank_statement_evidence",
            bankCashPoolId,
            bankStatementEntryId: `payout-statement-entry:${suffix}:${payoutRequestId}`,
            sourceStatementId: `payout-statement:${suffix}:${bankCashPoolId}`,
            sourceCheckpoint: `payout-statement:${suffix}:${bankCashPoolId}:1`,
            sourceRowId: `payout-row:${suffix}:${payoutRequestId}`,
            direction: "debit",
            amountMinor,
            currency: "RUB",
            occurredAt: statementObservedAt,
            bankReference,
            artifact: {
              artifactId,
              sha256Digest: artifactDigest,
              byteLength: 2048,
              bankCashPoolId,
              statementSourceFingerprint: sha(`statement-source:${bankCashPoolId}`)
            }
          },
          operationEnvelope: operationEnvelope()
        } as never);
    };
    const mismatchedAmount = await ingestCandidate("wrong-amount", "4999", `manual-bank-${payoutRequestId}`);
    await expect(matchUnitOfWork.matchBankCash({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "3",
      statementIngestion: mismatchedAmount.ref,
      matchAuthority: { kind: "manual_payout", payoutPaid: paid.ref },
      operationEnvelope: operationEnvelope()
    } as never)).rejects.toMatchObject({
      code: "bank_cash_match_persistence_error",
      reason: "manual_payout_binding_invalid"
    });
    const mismatchedReference = await ingestCandidate("wrong-reference", "5000", `wrong-${payoutRequestId}`);
    await expect(matchUnitOfWork.matchBankCash({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "3",
      statementIngestion: mismatchedReference.ref,
      matchAuthority: { kind: "manual_payout", payoutPaid: paid.ref },
      operationEnvelope: operationEnvelope()
    } as never)).rejects.toMatchObject({
      code: "bank_cash_match_persistence_error",
      reason: "manual_payout_binding_invalid"
    });
    const matched = await matchUnitOfWork.matchBankCash({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "3",
      statementIngestion: ingestion.ref,
      matchAuthority: { kind: "manual_payout", payoutPaid: paid.ref },
      operationEnvelope: operationEnvelope()
    } as never);
    expect(matched).toMatchObject({
      bankStatementEntryId: ingestion.bankStatementEntryId,
      matchResult: "manual_payout",
      bankLiquidityRevision: "4"
    });
    await expect(matchUnitOfWork.matchBankCash({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "3",
      statementIngestion: ingestion.ref,
      matchAuthority: { kind: "manual_payout", payoutPaid: paid.ref },
      operationEnvelope: operationEnvelope()
    } as never)).resolves.toMatchObject({ ref: matched.ref, bankLiquidityRevision: "4" });
    await expect(matchUnitOfWork.matchBankCash({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "4",
      statementIngestion: ingestion.ref,
      matchAuthority: { kind: "manual_payout", payoutPaid: paid.ref },
      operationEnvelope: operationEnvelope()
    } as never)).rejects.toMatchObject({
      code: "bank_cash_match_persistence_error",
      reason: "bank_match_conflict"
    });
    await expect(runtime.pool.query(
      `select
         exposure.state as exposure_state, exposure.version::text as exposure_version,
         liquidity.revision::text as liquidity_revision,
         (select count(*)::int from finance_bank_matches) as match_count,
         (select count(*)::int from finance_bank_cash_match_receipts) as receipt_count,
         (select count(*)::int from finance_journal_entries entry join finance_accounts account on account.id = entry.account_id
           where entry.journal_transaction_id = $1 and account.code = 'bank_outbound_clearing' and entry.side = 'debit') as clearing_debit_count,
         (select count(*)::int from finance_journal_entries entry join finance_accounts account on account.id = entry.account_id
           where entry.journal_transaction_id = $1 and account.code = 'bank_cash' and entry.side = 'credit') as cash_credit_count
       from finance_bank_exposures exposure
       join finance_bank_liquidity_heads liquidity on liquidity.bank_cash_pool_id = exposure.bank_cash_pool_id and liquidity.currency = exposure.currency
      where exposure.payout_request_id = $2`,
      [matched.journalTransactionId, payoutRequestId]
    )).resolves.toMatchObject({ rows: [{
      exposure_state: "statement_reflected",
      exposure_version: "4",
      liquidity_revision: "4",
      match_count: 1,
      receipt_count: 1,
      clearing_debit_count: 1,
      cash_credit_count: 1
    }] });
  });

  it("applies a canonical ArcPay refund to the V2 pending payable exactly once", async () => {
    const fixture = await seedCaptureFixture();
    const captureClaim = await createDrizzleCapturedClientOrderWebhookClaimPort({
      database: runtime.database,
      workerId: "online-refund-integration-worker",
      leaseDurationSeconds: 60,
      retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
    }).claimNextCapturedClientOrderWebhook();
    expect(captureClaim).not.toBeNull();
    await createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
      database: runtime.database,
      workerId: "online-refund-integration-worker",
      mutationResolver: createDrizzleOnlineSaleCapturePersistenceResolver()
    }).applyCanonicalOnlineSaleCapture({
      semanticFact: {
        inboxItemId: captureClaim!.inboxItemId,
        expectedInboxVersion: captureClaim!.inboxVersion,
        expectedCheckpointSequence: captureClaim!.expectedCheckpointSequence,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId: fixture.webhookId,
          semanticSourceKind: "payment_transition",
          semanticSourceId: createCapturedProviderPaymentSemanticSourceId(fixture.providerPaymentId),
          economicPaymentIntentId: fixture.intentId,
          economicPaymentSessionId: fixture.sessionId,
          providerPaymentId: fixture.providerPaymentId,
          amountMinor: "10000",
          currency: "RUB",
          purpose: "client_order",
          canonicalFactDigest: fixture.canonicalFactDigest,
          artifact: fixture.canonicalArtifact,
          observedAt: fixture.observedAt
        },
        operationEnvelope: operationEnvelope()
      },
      capture: {
        economicPaymentIntentId: fixture.intentId,
        expectedEconomicPaymentVersion: 2,
        operationEnvelope: operationEnvelope()
      }
    } as never);
    const refundPositions = createDrizzleOnlineWalletRefundPositionReader(runtime.database);
    await expect(
      refundPositions.findRefundPosition({
        providerAccount,
        providerPaymentId: fixture.providerPaymentId
      })
    ).resolves.toEqual({
      economicPaymentIntentId: fixture.intentId,
      previousCumulativeRefundedMinor: "0"
    });

    const refundWebhookId = `refund-webhook-${randomUUID()}`;
    const refundProviderId = `refund-${randomUUID()}`;
    const refundWebhookBytes = new TextEncoder().encode(JSON.stringify({ id: refundWebhookId }));
    const refundCanonicalBytes = new TextEncoder().encode(
      JSON.stringify({ id: fixture.providerPaymentId, refundId: refundProviderId, refundedAmount: 5000 })
    );
    const refundWebhookArtifact = await registerArtifact({
      artifactId: `refund-webhook-artifact-${randomUUID()}`,
      artifactClass: "provider_webhook",
      policyId: "online-capture-webhook-retention",
      bytes: refundWebhookBytes
    });
    const refundCanonicalArtifact = await registerArtifact({
      artifactId: `refund-canonical-artifact-${randomUUID()}`,
      artifactClass: "provider_canonical_read",
      policyId: "online-capture-canonical-retention",
      bytes: refundCanonicalBytes
    });
    const storedRefund = await createDrizzleWebhookIngressStorageUnitOfWork({
      database: runtime.database
    }).storeBeforeAcknowledgement({
      expectedTransportIdentityAbsent: true,
      ingressEvidence: {
        kind: "verified_webhook_ingress_evidence",
        provider: "arc_pay",
        providerAccount,
        webhookId: refundWebhookId,
        providerEventType: "payment.refunded",
        rawBodyDigest: digest(refundWebhookBytes),
        sealedPayloadRef: refundWebhookArtifact.artifactId,
        signatureScheme: "arc_pay_hmac_sha256_v1",
        verifierContractVersion: "arc_pay_webhook_ingress_v1",
        webhookSigningKeyVersionId: "key-v1",
        signedTimestamp: "2020-01-01T12:00:00.000Z",
        signatureEvidenceDigest: sha(`refund-webhook-signature:${refundWebhookId}`),
        verifiedAt: "2020-01-01T12:00:01.000Z",
        receivedAt: "2020-01-01T12:00:02.000Z"
      }
    } as never);
    const refundClaim = await createDrizzleRefundedClientOrderWebhookClaimPort({
      database: runtime.database,
      workerId: "online-refund-integration-worker",
      leaseDurationSeconds: 60,
      retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
    }).claimNextRefundedClientOrderWebhook();
    expect(refundClaim).toMatchObject({
      inboxItemId: storedRefund.inboxItemId,
      providerEventType: "payment.refunded"
    });
    const receipt = await createDrizzleOnlineWalletRefundApplicationUnitOfWork({
      database: runtime.database,
      workerId: "online-refund-integration-worker"
    }).applyCanonicalOnlineWalletRefund({
      semanticFact: {
        inboxItemId: refundClaim!.inboxItemId,
        expectedInboxVersion: refundClaim!.inboxVersion,
        expectedCheckpointSequence: refundClaim!.expectedCheckpointSequence,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId: refundWebhookId,
          semanticSourceKind: "refund",
          semanticSourceId: refundProviderId,
          economicPaymentIntentId: fixture.intentId,
          economicPaymentSessionId: null,
          providerPaymentId: null,
          amountMinor: null,
          currency: null,
          purpose: "client_order",
          canonicalFactDigest: sha(`canonical-refund-fact:${refundProviderId}`),
          artifact: refundCanonicalArtifact,
          observedAt: fixture.observedAt
        },
        operationEnvelope: operationEnvelope()
      },
      refund: {
        providerPaymentId: fixture.providerPaymentId,
        providerRefundId: refundProviderId,
        refundDeltaMinor: "5000",
        previousCumulativeRefundedMinor: "0",
        cumulativeRefundedMinor: "5000",
        occurredAt: fixture.observedAt
      }
    } as never);
    expect(receipt).toMatchObject({
      effect: "applied_once",
      walletRevision: "2",
      blockedPayoutOutcomeMinor: "0"
    });
    await expect(
      refundPositions.findRefundPosition({
        providerAccount,
        providerPaymentId: fixture.providerPaymentId
      })
    ).resolves.toEqual({
      economicPaymentIntentId: fixture.intentId,
      previousCumulativeRefundedMinor: "5000"
    });
    await expect(
      runtime.pool.query(
        `select pending_minor::text as pending_minor, available_minor::text as available_minor,
                reserved_minor::text as reserved_minor, payout_pending_minor::text as payout_pending_minor,
                revision::text as revision
           from finance_online_wallet_heads
          where astrologer_user_id = $1`,
        [fixture.astrologerUserId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          pending_minor: "4800",
          available_minor: "0",
          reserved_minor: "0",
          payout_pending_minor: "0",
          revision: "2"
        }
      ]
    });
    await expect(
      runtime.pool.query(
        `select application.outcome,
                application.commission_reversal_minor::text as commission_reversal_minor,
                application.payable_reversal_minor::text as payable_reversal_minor,
                (select count(*)::int from finance_online_wallet_mutations where operation_kind = 'refund_confirmed') as mutation_count,
                (select count(*)::int from finance_journal_transactions where id like 'online-wallet-refund:%') as journal_count
           from finance_online_wallet_refund_applications application
          where application.provider_refund_id = $1`,
        [refundProviderId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          outcome: "applied",
          commission_reversal_minor: "200",
          payable_reversal_minor: "4800",
          mutation_count: 1,
          journal_count: 1
        }
      ]
    });
  });

  it("terminally applies only an approved V2 refund case, then replays its canonical ArcPay outcome", async () => {
    const workerId = "online-refund-terminal-integration-worker";
    const fixture = await seedCaptureFixture();
    await applyCapturedFixture(fixture, workerId);
    const refundCaseId = `refund-case-${randomUUID()}`;
    const providerRefundId = `refund-${randomUUID()}`;
    const canonicalArtifact = await registerArtifact({
      artifactId: `refund-terminal-canonical-${randomUUID()}`,
      artifactClass: "provider_canonical_read",
      policyId: "online-capture-canonical-retention",
      bytes: new TextEncoder().encode(`terminal-refund:${providerRefundId}`)
    });
    const makeClaim = async (suffix: string, occurredAt: string) => {
      const webhookId = `refund-terminal-webhook-${suffix}-${randomUUID()}`;
      const webhookBytes = new TextEncoder().encode(webhookId);
      const webhookArtifact = await registerArtifact({
        artifactId: `refund-terminal-webhook-artifact-${suffix}-${randomUUID()}`,
        artifactClass: "provider_webhook",
        policyId: "online-capture-webhook-retention",
        bytes: webhookBytes
      });
      await createDrizzleWebhookIngressStorageUnitOfWork({ database: runtime.database })
        .storeBeforeAcknowledgement({
          expectedTransportIdentityAbsent: true,
          ingressEvidence: {
            kind: "verified_webhook_ingress_evidence",
            provider: "arc_pay", providerAccount, webhookId,
            providerEventType: "payment.refunded", rawBodyDigest: digest(webhookBytes),
            sealedPayloadRef: webhookArtifact.artifactId, signatureScheme: "arc_pay_hmac_sha256_v1",
            verifierContractVersion: "arc_pay_webhook_ingress_v1", webhookSigningKeyVersionId: "key-v1",
            signedTimestamp: "2020-01-01T12:00:00.000Z",
            signatureEvidenceDigest: sha(`refund-terminal-signature:${webhookId}`),
            verifiedAt: "2020-01-01T12:00:01.000Z", receivedAt: "2020-01-01T12:00:02.000Z"
          }
        } as never);
      const claim = await createDrizzleRefundedClientOrderWebhookClaimPort({
        database: runtime.database, workerId, leaseDurationSeconds: 60,
        retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
      }).claimNextRefundedClientOrderWebhook();
      if (!claim) throw new Error("refund fixture was not claimable");
      return {
        semanticFact: {
          inboxItemId: claim.inboxItemId, expectedInboxVersion: claim.inboxVersion,
          expectedCheckpointSequence: claim.expectedCheckpointSequence, processorVersion: 1,
          semanticEvidence: {
            kind: "verified_webhook_semantic_evidence", providerAccount, webhookId,
            semanticSourceKind: "refund", semanticSourceId: providerRefundId,
            economicPaymentIntentId: fixture.intentId, economicPaymentSessionId: null,
            providerPaymentId: null, amountMinor: null, currency: null, purpose: "client_order",
            canonicalFactDigest: sha(`refund-terminal-fact:${providerRefundId}`), artifact: canonicalArtifact,
            observedAt: fixture.observedAt
          }, operationEnvelope: operationEnvelope()
        }, refundCaseId, providerPaymentId: fixture.providerPaymentId, providerRefundId,
        previousCumulativeRefundedMinor: "0", cumulativeRefundedMinor: "5000", occurredAt
      } as const;
    };
    const terminal = createDrizzleOnlineWalletRefundTerminalUnitOfWork({ database: runtime.database, workerId });
    const beforeApproval = await makeClaim("before-approval", new Date().toISOString());
    await expect(terminal.applyCanonicalApprovedOnlineWalletRefund(beforeApproval as never)).rejects.toMatchObject({
      code: "online_wallet_refund_terminal_persistence_error", reason: "refund_case_not_approved"
    });

    const candidateId = randomUUID();
    await runtime.pool.query(
      `insert into finance_refund_candidates (id, order_id, client_user_id, statement, status, version)
       select $1, id, client_user_id, 'Terminal refund fixture', 'under_review', 1 from orders where id = $2`,
      [candidateId, fixture.orderId]
    );
    const terminalOccurredAt = new Date().toISOString();
    const economicPaymentRow = (await runtime.pool.query<{ version: string }>(
      "select version::text as version from finance_economic_payment_intents where id = $1", [fixture.intentId]
    )).rows[0];
    const captureRow = (await runtime.pool.query<{
      captureApplicationId: string;
      walletId: string;
    }>(
      `select id as "captureApplicationId", online_wallet_id as "walletId"
         from finance_online_sale_capture_applications where economic_payment_intent_id = $1`,
      [fixture.intentId]
    )).rows[0];
    if (!economicPaymentRow || !captureRow) throw new Error("capture fixture authority is missing");
    const { version: economicPaymentVersion } = economicPaymentRow;
    const { captureApplicationId, walletId } = captureRow;
    const approvalAuthorityDigest = sha(`refund-terminal-approval:${refundCaseId}`);
    const dispatchEnvelope = {
      kind: "refund" as const, providerPaymentId: fixture.providerPaymentId,
      amount: { amountMinor: 5000, currency: "RUB" as const }, externalId: refundCaseId
    };
    const dispatchArtifact = await registerArtifact({
      artifactId: `refund-terminal-dispatch-${randomUUID()}`, artifactClass: "provider_request",
      policyId: "online-capture-provider-request-retention",
      bytes: new TextEncoder().encode("sealed provider refund request"),
      sha256Digest: digestFinanceCanonicalValueV1(dispatchEnvelope)
    });
    await createDrizzleOnlineWalletRefundApprovalUnitOfWork({ database: runtime.database })
      .approveOnlineWalletRefund({
        authority: {
          kind: "verified_online_wallet_refund_approval_authority", refundCaseId,
          refundCandidateId: candidateId, refundCandidateVersion: 1, orderId: fixture.orderId,
          captureApplicationId, walletId, economicPaymentIntentId: fixture.intentId,
          providerAccount, providerPaymentId: fixture.providerPaymentId,
          previousCumulativeRefundedMinor: "0", approvedCumulativeRefundedMinor: "5000",
          approvalAuthorityId: `refund-approval-${refundCaseId}`, approvalAuthorityVersion: "1",
          approvalAuthorityDigest, approvedByActorId: fixture.astrologerUserId, approvedAt: terminalOccurredAt
        }, expectedWalletRevision: "1",
        providerDispatch: {
          providerOperationIntentId: randomUUID(), economicPaymentIntentId: fixture.intentId,
          expectedEconomicPaymentVersion: Number(economicPaymentVersion), expectedProviderOperationSourceVersion: 0,
          providerAccount, dispatchArtifact, replacementAuthority: null,
          idempotencyKey: `refund-idempotency-${randomUUID()}`,
          idempotencyRetentionDeadline: new Date(Date.now() + 60 * 60_000).toISOString(),
          operationEnvelope: operationEnvelope(), operationKind: "refund", economicPaymentSessionId: null,
          dispatchEnvelope
        }
      } as never);
    const applied = await terminal.applyCanonicalApprovedOnlineWalletRefund(
      (await makeClaim("success", terminalOccurredAt)) as never
    );
    expect(applied).toMatchObject({ effect: "applied_once", refundCaseId, walletRevision: "3" });
    const replay = await terminal.applyCanonicalApprovedOnlineWalletRefund((await makeClaim("replay", terminalOccurredAt)) as never);
    expect(replay).toMatchObject({ effect: "semantic_replay", refundCaseId, walletRevision: "3" });
    await expect(runtime.pool.query(
      `select c.status, c.version::text as version, w.refund_pending_minor::text as refund_pending_minor,
              (select count(*)::int from finance_online_wallet_refund_applications a where a.provider_refund_id = $1) as application_count,
              (select count(*)::int from finance_online_wallet_mutations m
                join finance_online_wallet_refund_applications a on a.wallet_mutation_id = m.mutation_id
                where a.id = c.terminal_application_id and m.operation_kind = 'refund_confirmed') as terminal_mutation_count
         from finance_online_wallet_refund_cases c join finance_online_wallet_heads w on w.id = c.wallet_id
        where c.refund_case_id = $2`, [providerRefundId, refundCaseId]
    )).resolves.toMatchObject({ rows: [{ status: "succeeded", version: "2", refund_pending_minor: "0", application_count: 1, terminal_mutation_count: 1 }] });
  });

  it("records an ArcPay chargeback as a V2 provisional provider loss and blocks only its root from a new payout", async () => {
    const fixture = await seedCaptureFixture();
    const captureClaim = await createDrizzleCapturedClientOrderWebhookClaimPort({
      database: runtime.database,
      workerId: "online-chargeback-integration-worker",
      leaseDurationSeconds: 60,
      retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
    }).claimNextCapturedClientOrderWebhook();
    await createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
      database: runtime.database,
      workerId: "online-chargeback-integration-worker",
      mutationResolver: createDrizzleOnlineSaleCapturePersistenceResolver()
    }).applyCanonicalOnlineSaleCapture({
      semanticFact: {
        inboxItemId: captureClaim!.inboxItemId,
        expectedInboxVersion: captureClaim!.inboxVersion,
        expectedCheckpointSequence: captureClaim!.expectedCheckpointSequence,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId: fixture.webhookId,
          semanticSourceKind: "payment_transition",
          semanticSourceId: createCapturedProviderPaymentSemanticSourceId(fixture.providerPaymentId),
          economicPaymentIntentId: fixture.intentId,
          economicPaymentSessionId: fixture.sessionId,
          providerPaymentId: fixture.providerPaymentId,
          amountMinor: "10000",
          currency: "RUB",
          purpose: "client_order",
          canonicalFactDigest: fixture.canonicalFactDigest,
          artifact: fixture.canonicalArtifact,
          observedAt: fixture.observedAt
        },
        operationEnvelope: operationEnvelope()
      },
      capture: {
        economicPaymentIntentId: fixture.intentId,
        expectedEconomicPaymentVersion: 2,
        operationEnvelope: operationEnvelope()
      }
    } as never);

    // The disputed root is first made payable and reserved into a pre-bank payout. The
    // chargeback must return that whole payout to its original root, then freeze only it.
    const completedAt = new Date().toISOString();
    await createDrizzleBookingCommandStore(runtime.database).executeOwnerCompletion(
      {
        actorUserId: fixture.astrologerUserId,
        scope: "bookings.owner.complete",
        key: `chargeback-complete-${fixture.bookingId}`,
        requestHash: sha(`chargeback-complete:${fixture.bookingId}`),
        now: completedAt,
        expiresAt: new Date(Date.parse(completedAt) + 86_400_000).toISOString()
      },
      { bookingId: fixture.bookingId, expectedLifecycleRevision: 1 }
    );
    const release = await createDrizzleOnlineWalletHoldReleaseUnitOfWork({
      database: runtime.database
    }).releaseDueOnlineWalletHolds({ now: completedAt, limit: 10 });
    const released = release.receipts.find((item) => item.effect === "applied_once");
    expect(released).toMatchObject({ effect: "applied_once", walletRevision: "2" });

    const payoutMethodId = randomUUID();
    await runtime.pool.query(
      `insert into payout_methods
         (id, astrologer_user_id, method, currency, display_name, is_default, version)
       values ($1, $2, 'manual_bank_transfer', 'RUB', 'Основной банковский счёт', true, 1)`,
      [payoutMethodId, fixture.astrologerUserId]
    );
    await runtime.pool.query(
      `insert into payout_method_versions
         (payout_method_id, version, destination_kind, beneficiary_fingerprint, redacted_display,
          sealed_destination_ref)
       values ($1, 1, 'bank_account', $2, 'Счёт **** 6789', $3)`,
      [payoutMethodId, sha("chargeback-beneficiary"), "kms://integration/chargeback-destination/v1"]
    );
    const payoutRequestId = `chargeback-payout-${randomUUID()}`;
    const payoutCommand = {
      payoutRequestId,
      walletId: released!.walletId,
      astrologerUserId: fixture.astrologerUserId,
      amountMinor: "5000",
      currency: "RUB" as const,
      destination: {
        kind: "sealed_payout_destination_snapshot" as const,
        payoutMethodId,
        payoutMethodVersion: 1,
        destinationKind: "bank_account" as const,
        beneficiaryFingerprint: sha("chargeback-beneficiary"),
        redactedDisplay: "Счёт **** 6789",
        sealedDestinationRef: "kms://integration/chargeback-destination/v1"
      },
      requestAuthority: {
        authorityId: `chargeback-payout-request:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`chargeback-payout-request:${payoutRequestId}`)
      },
      occurredAt: completedAt
    };
    await expect(
      createDrizzleOnlineWalletPayoutRequestUnitOfWork({ database: runtime.database })
        .createOnlineWalletPayoutRequest(payoutCommand)
    ).resolves.toMatchObject({ effect: "applied_once", payoutRequestId, payoutVersion: "1" });

    const chargebackWebhookId = `chargeback-webhook-${randomUUID()}`;
    const chargebackWebhookArtifact = await registerArtifact({
      artifactId: `chargeback-webhook-artifact-${randomUUID()}`,
      artifactClass: "provider_webhook",
      policyId: "online-capture-webhook-retention",
      bytes: new TextEncoder().encode(JSON.stringify({ id: chargebackWebhookId }))
    });
    const chargebackCanonicalArtifact = await registerArtifact({
      artifactId: `chargeback-canonical-artifact-${randomUUID()}`,
      artifactClass: "provider_canonical_read",
      policyId: "online-capture-canonical-retention",
      bytes: new TextEncoder().encode(
        JSON.stringify({
          payment_id: fixture.providerPaymentId,
          status: "chargeback",
          external_id: fixture.orderId
        })
      )
    });
    const storedChargeback = await createDrizzleWebhookIngressStorageUnitOfWork({
      database: runtime.database
    }).storeBeforeAcknowledgement({
      expectedTransportIdentityAbsent: true,
      ingressEvidence: {
        kind: "verified_webhook_ingress_evidence",
        provider: "arc_pay",
        providerAccount,
        webhookId: chargebackWebhookId,
        providerEventType: "payment.chargeback",
        rawBodyDigest: chargebackWebhookArtifact.sha256Digest,
        sealedPayloadRef: chargebackWebhookArtifact.artifactId,
        signatureScheme: "arc_pay_hmac_sha256_v1",
        verifierContractVersion: "arc_pay_webhook_ingress_v1",
        webhookSigningKeyVersionId: "key-v1",
        signedTimestamp: "2020-01-01T12:00:00.000Z",
        signatureEvidenceDigest: sha(`chargeback-webhook-signature:${chargebackWebhookId}`),
        verifiedAt: "2020-01-01T12:00:01.000Z",
        receivedAt: "2020-01-01T12:00:02.000Z"
      }
    } as never);
    const claim = await createDrizzleChargebackClientOrderWebhookClaimPort({
      database: runtime.database,
      workerId: "online-chargeback-integration-worker",
      leaseDurationSeconds: 60,
      retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
    }).claimNextChargebackClientOrderWebhook();
    expect(claim).toMatchObject({
      inboxItemId: storedChargeback.inboxItemId,
      providerEventType: "payment.chargeback"
    });
    const receipt = await createDrizzleOnlineWalletChargebackCaseUnitOfWork({
      database: runtime.database,
      workerId: "online-chargeback-integration-worker"
    }).applyVerifiedOnlineWalletChargebackNotice({
      semanticFact: {
        inboxItemId: claim!.inboxItemId,
        expectedInboxVersion: claim!.inboxVersion,
        expectedCheckpointSequence: claim!.expectedCheckpointSequence,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId: chargebackWebhookId,
          semanticSourceKind: "chargeback",
          semanticSourceId: chargebackWebhookId,
          economicPaymentIntentId: fixture.intentId,
          economicPaymentSessionId: null,
          providerPaymentId: null,
          amountMinor: null,
          currency: null,
          purpose: "client_order",
          canonicalFactDigest: sha(`chargeback-fact:${chargebackWebhookId}`),
          artifact: chargebackCanonicalArtifact,
          observedAt: fixture.observedAt
        },
        operationEnvelope: operationEnvelope()
      },
      chargeback: {
        providerPaymentId: fixture.providerPaymentId,
        providerSource: { kind: "webhook_event_id", webhookEventId: chargebackWebhookId },
        disputedPrincipalMinor: "10000",
        occurredAt: fixture.observedAt
      }
    } as never);
    expect(receipt).toMatchObject({ effect: "applied_once", walletId: expect.any(String) });
    await expect(
      runtime.pool.query(
        `select case_row.status, case_row.disputed_principal_minor::text as disputed_principal_minor,
                journal.total_debit_minor::text as total_debit_minor,
                journal.total_credit_minor::text as total_credit_minor,
                array_agg(account.code order by entry.entry_index) as account_codes
           from finance_online_wallet_chargeback_cases case_row
           join finance_journal_transactions journal on journal.id = case_row.journal_transaction_id
           join finance_journal_entries entry on entry.journal_transaction_id = journal.id
           join finance_accounts account on account.id = entry.account_id
          where case_row.chargeback_case_id = $1
          group by case_row.status, case_row.disputed_principal_minor,
                   journal.total_debit_minor, journal.total_credit_minor`,
        [receipt.chargebackCaseId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          status: "provisional_loss",
          disputed_principal_minor: "10000",
          total_debit_minor: "10000",
          total_credit_minor: "10000",
          account_codes: ["chargeback_principal_suspense", "arc_provider_clearing"]
        }
      ]
    });
    await expect(
      runtime.pool.query(
        `select request.status, request.version::text as request_version,
                transition.actor_kind, transition.actor_user_id,
                wallet.available_minor::text as available_minor,
                wallet.payout_pending_minor::text as payout_pending_minor,
                wallet.revision::text as wallet_revision
           from finance_online_payout_requests request
           join finance_online_payout_state_transitions transition
             on transition.payout_request_id = request.id and transition.payout_version = request.version
           join finance_online_wallet_heads wallet on wallet.id = request.wallet_id
          where request.id = $1`,
        [payoutRequestId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          status: "cancelled",
          request_version: "2",
          actor_kind: "system",
          actor_user_id: null,
          available_minor: "8640",
          payout_pending_minor: "0",
          wallet_revision: "4"
        }
      ]
    });
    const blockedPayoutRequestId = `chargeback-payout-after-freeze-${randomUUID()}`;
    await expect(
      createDrizzleOnlineWalletPayoutRequestUnitOfWork({ database: runtime.database })
        .createOnlineWalletPayoutRequest({
          ...payoutCommand,
          payoutRequestId: blockedPayoutRequestId,
          amountMinor: "100",
          requestAuthority: {
            authorityId: `chargeback-payout-request:${blockedPayoutRequestId}`,
            authorityVersion: "1",
            authorityDigest: sha(`chargeback-payout-request:${blockedPayoutRequestId}`)
          }
        })
    ).rejects.toMatchObject(
      expect.objectContaining<Partial<OnlineWalletPayoutRequestPersistenceError>>({
        reason: "insufficient_available_balance"
      })
    );
    const outcomeArtifact = await registerArtifact({
      artifactId: `chargeback-outcome-artifact-${randomUUID()}`,
      artifactClass: "provider_canonical_read",
      policyId: "online-capture-canonical-retention",
      bytes: new TextEncoder().encode(JSON.stringify({ payment_id: fixture.providerPaymentId, status: "won" }))
    });
    const [{ revision: walletRevision }] = (await runtime.pool.query(
      `select revision::text as revision from finance_online_wallet_heads where id = $1`, [receipt.walletId]
    )).rows as [{ revision: string }];
    const resolution = createDrizzleOnlineWalletChargebackResolutionUnitOfWork({ database: runtime.database });
    const authority = (outcome: "won" | "lost") => ({
      kind: "verified_chargeback_resolution_authority", chargebackCaseId: receipt.chargebackCaseId,
      expectedChargebackVersion: 1, resolution: outcome, cumulativePrincipalMinor: "10000",
      providerEvidence: { kind: "verified_chargeback_provider_evidence", providerAccount, chargebackCaseId: receipt.chargebackCaseId, providerPaymentId: fixture.providerPaymentId, lifecycleFact: outcome, cumulativePrincipalMinor: "10000", currency: "RUB", artifact: outcomeArtifact, observedAt: fixture.observedAt },
      allocationAuthorityId: `chargeback-resolution:${receipt.chargebackCaseId}`, allocationAuthorityVersion: "1", allocationAuthorityDigest: sha(`chargeback-resolution:${receipt.chargebackCaseId}`), decidedByActorId: fixture.astrologerUserId, decidedAt: fixture.observedAt
    });
    const command = (outcome: "won" | "lost") => ({ chargebackCaseId: receipt.chargebackCaseId, expectedChargebackVersion: 1, walletId: receipt.walletId, expectedWalletRevision: walletRevision, expectedPrincipalPositionVersion: "1", expectedRecoveryPositionVersion: "1", resolutionAuthority: authority(outcome), operationEnvelope: operationEnvelope() });
    await expect(resolution.resolveChargeback(command("lost") as never)).rejects.toMatchObject(
      expect.objectContaining<Partial<OnlineWalletChargebackResolutionPersistenceError>>({ reason: "unallocated_source_position" })
    );
    await expect(resolution.resolveChargeback(command("won") as never)).resolves.toMatchObject({ resolution: "won_reversed", walletRevision });
    await expect(resolution.resolveChargeback(command("won") as never)).resolves.toMatchObject({ resolution: "won_reversed" });
    await expect(runtime.pool.query(
      `select resolution, provider_lifecycle_fact, count(*)::int as resolution_count from finance_online_wallet_chargeback_resolutions where chargeback_case_id = $1 group by resolution, provider_lifecycle_fact`, [receipt.chargebackCaseId]
    )).resolves.toMatchObject({ rows: [{ resolution: "won_reversed", provider_lifecycle_fact: "won", resolution_count: 1 }] });
  });

  async function seedCaptureFixture() {
    const astrologerUserId = randomUUID();
    const clientUserId = randomUUID();
    const productId = randomUUID();
    const policyId = randomUUID();
    const policyVersion = Number.parseInt(randomUUID().replaceAll("-", "").slice(0, 7), 16) + 1;
    const tariffSeriesId = `tariff-${randomUUID()}`;
    const tariffVersionDigest = sha(`tariff-version:${tariffSeriesId}`);
    const orderId = randomUUID();
    const intentId = `economic-intent-${randomUUID()}`;
    const sessionId = `economic-session-${randomUUID()}`;
    const providerOperationIntentId = `provider-operation-${randomUUID()}`;
    const webhookId = `webhook-${randomUUID()}`;
    const providerPaymentId = `payment-${randomUUID()}`;
    const economics = createOrderEconomicsSnapshot({
      orderId,
      astrologerUserId,
      planId: tariffSeriesId,
      planVersionId: `${tariffSeriesId}:1`,
      gross: { amountMinor: 10_000, currency: "RUB" },
      commission: { amountMinor: 400, currency: "RUB" },
      payable: { amountMinor: 9_600, currency: "RUB" },
      commissionBps: 400,
      allocationRevision: "bps_half_up_v1"
    });
    const risk = createRiskPolicySnapshot({
      id: policyId,
      policyVersion,
      effectiveRiskTier: "standard",
      holdAnchor: "booking_completed",
      holdDurationHours: 0,
      reserveBps: 1_000,
      reserveReleaseDelayDays: 0,
      providerSettlementRequired: false,
      payoutMinimum: { amountMinor: 100, currency: "RUB" },
      exceptionAuthority: null,
      effectiveAt: "2020-01-01T00:00:00Z"
    });
    const fulfillment = {
      supported: true,
      registryKey: "single.once.live.solo",
      registryRevision: 1,
      holdAnchor: "booking_completed",
      terminalEvidence: { owner: "booking", status: "completed", contractVersion: 1 },
      cancellationAllocator: {
        owner: "booking",
        port: "BookingCancellationRefundDecisionPort",
        policyVersion: 1
      }
    } as const;
    const scheduleId = randomUUID();
    const reservationId = randomUUID();
    const bookingId = randomUUID();

    await runtime.pool.query("insert into users (id) values ($1), ($2)", [
      astrologerUserId,
      clientUserId
    ]);
    await runtime.pool.query(
      `insert into products
         (id, owner_user_id, type, status, title, price_minor, currency, execution_mode,
          payment_model, duration_minutes, participant_mode)
       values ($1, $2, 'single', 'active', 'Online capture', 10000, 'RUB', 'live', 'once', 60, 'solo')`,
      [productId, astrologerUserId]
    );
    await runtime.pool.query(
      `insert into availability_schedules
         (id, owner_user_id, name, time_zone, is_default, version, start_interval_minutes,
          buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days)
       values ($1, $2, 'Release fixture', 'UTC', true, 1, 60, 0, 0, 0, 365)`,
      [scheduleId, astrologerUserId]
    );
    await runtime.pool.query(
      `insert into schedule_reservations
         (id, owner_user_id, schedule_id, kind, lifecycle, service_start_at, service_end_at,
          occupied_start_at, occupied_end_at, source_aggregate_id, hold_expires_at)
       values ($1, $2, $3, 'booking', 'active', '2020-01-01T10:00:00Z', '2020-01-01T11:00:00Z',
               '2020-01-01T10:00:00Z', '2020-01-01T11:00:00Z', $4, null)`,
      [reservationId, astrologerUserId, scheduleId, bookingId]
    );
    await runtime.pool.query(
      `insert into bookings
         (id, owner_user_id, client_user_id, product_id, reservation_id, source, state,
          lifecycle_revision, hold_expires_at, service_start_at, service_end_at,
          product_title_snapshot, duration_minutes_snapshot, delivery_format_snapshot,
          price_minor_snapshot, currency_snapshot, time_zone_snapshot, policy_snapshot,
          client_data_requirements_snapshot)
       values ($1, $2, $3, $4, $5, 'client_paid', 'pending_payment', 0, null,
               '2020-01-01T10:00:00Z', '2020-01-01T11:00:00Z', 'Online capture', 60, 'video',
               10000, 'RUB', 'UTC',
               '{"bufferBeforeMinutes":0,"bufferAfterMinutes":0,"minimumNoticeMinutes":0}',
               '{"schemaVersion":"booking-client-data-requirements.v1","executionMode":"live","participantMode":"solo","requiredClientData":[],"methods":[]}')`,
      [bookingId, astrologerUserId, clientUserId, productId, reservationId]
    );
    await runtime.pool.query(
      `insert into finance_policies (id, policy_version, risk_tier, hold_duration_hours, is_active)
       values ($1, $2, 'standard', 48, false)`,
      [policyId, policyVersion]
    );
    await runtime.pool.query("insert into platform_tariff_series (id, code) values ($1, $2)", [
      tariffSeriesId,
      tariffSeriesId
    ]);
    await runtime.pool.query(
      `insert into platform_tariff_versions
         (tariff_series_id, version, lifecycle, name, tagline, monthly_price_minor,
          yearly_price_minor, currency, client_sale_commission_bps, display_order,
          canonical_preimage, canonical_digest)
       values ($1, 1, 'draft', 'Capture tariff', 'Capture tariff', 0, 0, 'RUB', 400, 0,
               '{"schemaVersion":"integration.v1"}', $2)`,
      [tariffSeriesId, tariffVersionDigest]
    );
    await runtime.pool.query(
      `insert into orders
         (id, client_user_id, astrologer_user_id, product_id, status, product_title_snapshot,
          gross_amount_minor, gross_currency, platform_fee_amount_minor, platform_fee_currency,
          astrologer_net_amount_minor, astrologer_net_currency, finance_policy_snapshot_id,
          finance_policy_risk_tier, finance_policy_hold_duration_hours, finance_policy_reserve_bps,
          finance_policy_reserve_release_delay_days, tariff_series_id, tariff_version,
          tariff_version_digest, tariff_commission_bps, finance_policy_provider_settlement_required)
       values ($1, $2, $3, $4, 'pending_payment', 'Online capture', 10000, 'RUB', 400, 'RUB',
               9600, 'RUB', $5, 'standard', 0, 1000, 0, $6, 1, $7, 400, false)`,
      [orderId, clientUserId, astrologerUserId, productId, policyId, tariffSeriesId, tariffVersionDigest]
    );
    await runtime.pool.query("update orders set booking_id = $1 where id = $2", [bookingId, orderId]);
    await runtime.pool.query(
      `insert into finance_order_economics_snapshots
         (order_id, astrologer_user_id, plan_id, plan_version_id, gross_amount_minor,
          gross_currency, commission_amount_minor, commission_currency, payable_amount_minor,
          payable_currency, commission_bps, allocation_revision, canonical_digest)
       values ($1, $2, $3, $4, 10000, 'RUB', 400, 'RUB', 9600, 'RUB', 400, 'bps_half_up_v1', $5)`,
      [
        orderId,
        astrologerUserId,
        economics.planId,
        economics.planVersionId,
        hashFinanceCommandPayload(economics)
      ]
    );
    await runtime.pool.query(
      `insert into finance_risk_policy_versions
         (policy_id, policy_version, effective_risk_tier, hold_anchor, hold_duration_hours,
          reserve_bps, reserve_release_delay_days, provider_settlement_required,
          payout_minimum_amount_minor, payout_minimum_currency, exception_authority_id,
          exception_authority_version, effective_at, canonical_digest)
       values ($1, $2, 'standard', 'booking_completed', 0, 1000, 0, false, 100, 'RUB', null, null,
               '2020-01-01T00:00:00Z', $3)`,
      [policyId, policyVersion, hashFinanceCommandPayload(risk)]
    );
    await runtime.pool.query(
      `insert into finance_paid_product_fulfillment_decisions
         (supported, registry_key, registry_revision, hold_anchor, terminal_evidence_owner,
          terminal_evidence_status, terminal_evidence_contract_version,
          cancellation_allocator_owner, cancellation_allocator_port,
          cancellation_allocator_policy_version, canonical_digest)
       values (true, 'single.once.live.solo', 1, 'booking_completed', 'booking', 'completed', 1,
               'booking', 'BookingCancellationRefundDecisionPort', 1, $1)
       on conflict (registry_key, registry_revision) do nothing`,
      [hashFinanceCommandPayload(fulfillment)]
    );
    await createDrizzleEconomicPaymentIntentCreationUnitOfWork({ database: runtime.database })
      .createEconomicPaymentIntent({
        economicPaymentIntentId: intentId,
        sourceId: orderId,
        purpose: "client_order",
        providerAccount,
        amountMinor: "10000",
        currency: "RUB",
        expectedSourceUniquenessVersion: 0
      });
    await createDrizzleEconomicPaymentSessionOpenUnitOfWork({ database: runtime.database })
      .openEconomicPaymentSession({
        economicPaymentIntentId: intentId,
        economicPaymentSessionId: sessionId,
        expectedEconomicPaymentVersion: 1,
        providerAccount
      });
    await runtime.pool.query(
      `insert into finance_client_checkout_authorizations
         (authority_id, order_id, client_user_id, payment_command_id, economic_payment_intent_id,
          economic_payment_session_id, provider_operation_intent_id, risk_policy_id,
          risk_policy_version, risk_policy_digest, fulfillment_decision_id,
          fulfillment_decision_version, fulfillment_decision_digest)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12)`,
      [
        `checkout-authority-${randomUUID()}`,
        orderId,
        clientUserId,
        randomUUID(),
        intentId,
        sessionId,
        providerOperationIntentId,
        policyId,
        policyVersion,
        hashFinanceCommandPayload(risk),
        fulfillment.registryKey,
        hashFinanceCommandPayload(fulfillment)
      ]
    );

    const webhookBytes = new TextEncoder().encode(JSON.stringify({ id: webhookId }));
    const canonicalBytes = new TextEncoder().encode(JSON.stringify({ id: providerPaymentId }));
    const webhookArtifact = await registerArtifact({
      artifactId: `webhook-artifact-${randomUUID()}`,
      artifactClass: "provider_webhook",
      policyId: "online-capture-webhook-retention",
      bytes: webhookBytes
    });
    const canonicalArtifact = await registerArtifact({
      artifactId: `canonical-artifact-${randomUUID()}`,
      artifactClass: "provider_canonical_read",
      policyId: "online-capture-canonical-retention",
      bytes: canonicalBytes
    });
    const stored = await createDrizzleWebhookIngressStorageUnitOfWork({
      database: runtime.database
    }).storeBeforeAcknowledgement({
      expectedTransportIdentityAbsent: true,
      ingressEvidence: {
        kind: "verified_webhook_ingress_evidence",
        provider: "arc_pay",
        providerAccount,
        webhookId,
        providerEventType: "payment.captured",
        rawBodyDigest: digest(webhookBytes),
        sealedPayloadRef: webhookArtifact.artifactId,
        signatureScheme: "arc_pay_hmac_sha256_v1",
        verifierContractVersion: "arc_pay_webhook_ingress_v1",
        webhookSigningKeyVersionId: "key-v1",
        signedTimestamp: "2020-01-01T11:59:00.000Z",
        signatureEvidenceDigest: sha("webhook-signature"),
        verifiedAt: "2020-01-01T11:59:01.000Z",
        receivedAt: "2020-01-01T11:59:02.000Z"
      }
    } as never);
    return {
      astrologerUserId,
      bookingId,
      orderId,
      intentId,
      sessionId,
      inboxItemId: stored.inboxItemId,
      webhookId,
      providerPaymentId,
      observedAt: new Date().toISOString(),
      canonicalFactDigest: sha("canonical-capture-fact"),
      canonicalArtifact
    };
  }

  async function applyCapturedFixture(
    fixture: Awaited<ReturnType<typeof seedCaptureFixture>>,
    workerId: string
  ): Promise<void> {
    const claim = await createDrizzleCapturedClientOrderWebhookClaimPort({
      database: runtime.database,
      workerId,
      leaseDurationSeconds: 60,
      retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
    }).claimNextCapturedClientOrderWebhook();
    if (!claim) throw new Error("capture fixture was not claimable");
    await createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
      database: runtime.database,
      workerId,
      mutationResolver: createDrizzleOnlineSaleCapturePersistenceResolver()
    }).applyCanonicalOnlineSaleCapture({
      semanticFact: {
        inboxItemId: claim.inboxItemId,
        expectedInboxVersion: claim.inboxVersion,
        expectedCheckpointSequence: claim.expectedCheckpointSequence,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId: fixture.webhookId,
          semanticSourceKind: "payment_transition",
          semanticSourceId: createCapturedProviderPaymentSemanticSourceId(fixture.providerPaymentId),
          economicPaymentIntentId: fixture.intentId,
          economicPaymentSessionId: fixture.sessionId,
          providerPaymentId: fixture.providerPaymentId,
          amountMinor: "10000",
          currency: "RUB",
          purpose: "client_order",
          canonicalFactDigest: fixture.canonicalFactDigest,
          artifact: fixture.canonicalArtifact,
          observedAt: fixture.observedAt
        },
        operationEnvelope: operationEnvelope()
      },
      capture: {
        economicPaymentIntentId: fixture.intentId,
        expectedEconomicPaymentVersion: 2,
        operationEnvelope: operationEnvelope()
      }
    } as never);
  }

  async function registerArtifact(input: {
    artifactId: string;
    artifactClass: "provider_webhook" | "provider_canonical_read" | "provider_request";
    policyId: string;
    bytes: Uint8Array;
    sha256Digest?: `sha256:${string}`;
  }) {
    const sha256Digest = input.sha256Digest ?? digest(input.bytes);
    return artifacts.registerSealedArtifact({
      artifact: { artifactId: input.artifactId, sha256Digest, byteLength: input.bytes.byteLength },
      artifactClass: input.artifactClass,
      binding: { kind: "provider", providerAccount },
      contentType: "application/json",
      privateObject: {
        privateObjectKey: `integration/${input.artifactId}`,
        privateObjectVersion: "v1",
        envelopeKeyVersion: "kms-v1",
        sha256Digest,
        byteLength: input.bytes.byteLength,
        contentType: "application/json"
      },
      retentionPolicyId: input.policyId,
      retentionPolicyVersion: "1"
    });
  }

  async function attestLiquiditySnapshot(input: Readonly<{
    bankCashPoolId: string;
    expectedBankLiquidityRevision: string;
    unrestrictedAvailableMinor: string;
    sourceCheckpoint: string;
    asOf: string;
    expiresAt: string;
  }>) {
    const actorUserId = randomUUID();
    const sessionId = randomUUID();
    const attestationId = randomUUID();
    const authorizationId = randomUUID();
    const artifactId = `liquidity-statement-${randomUUID()}`;
    const artifactDigest = sha(`liquidity-artifact:${artifactId}`);
    const statementSourceFingerprint = sha(`statement-source:${input.bankCashPoolId}`);
    const now = new Date();
    const attestationInput = {
      attestationId,
      bankCashPoolId: input.bankCashPoolId,
      currency: "RUB" as const,
      expectedBankLiquidityRevision: input.expectedBankLiquidityRevision,
      unrestrictedAvailableMinor: input.unrestrictedAvailableMinor,
      sourceCheckpoint: input.sourceCheckpoint,
      asOf: input.asOf,
      expiresAt: input.expiresAt,
      evidenceArtifact: {
        artifactId,
        sha256Digest: artifactDigest,
        byteLength: 1024,
        bankCashPoolId: input.bankCashPoolId,
        statementSourceFingerprint
      }
    } as const;
    const payloadHash = hashFinanceCommandPayload(
      createBankLiquiditySnapshotAttestationAuthorizationPayload(attestationInput)
    );
    const retentionPolicyId = `liquidity-retention-${attestationId}`;
    await runtime.pool.query("insert into users (id) values ($1)", [actorUserId]);
    await runtime.pool.query(
      `insert into user_sessions (id, user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [sessionId, actorUserId, `liquidity-session-${sessionId}`, new Date(now.getTime() + 60 * 60_000)]
    );
    await runtime.pool.query(
      `insert into finance_artifact_retention_policies
         (policy_id, policy_version, artifact_class, retain_for_seconds, authority_ref, effective_at)
       values ($1, 1, 'bank_statement', 86400, 'integration-test', $2)`,
      [retentionPolicyId, now]
    );
    await runtime.pool.query(
      `insert into finance_artifacts
         (id, artifact_class, sha256_digest, byte_length, content_type, binding_kind,
          bank_cash_pool_id, currency, statement_source_fingerprint, private_object_key,
          private_object_version, envelope_key_version, retention_policy_id, retention_policy_version,
          retained_until)
       values ($1, 'bank_statement', $2, 1024, 'application/pdf', 'bank_cash_pool',
               $3, 'RUB', $4, $5, 'v1', 'kms-v1', $6, 1, $7)`,
      [
        artifactId,
        artifactDigest,
        input.bankCashPoolId,
        statementSourceFingerprint,
        `private/liquidity/${artifactId}`,
        retentionPolicyId,
        new Date(now.getTime() + 86_400_000)
      ]
    );
    await runtime.pool.query(
      `insert into finance_authorization_grants
         (authorization_id, actor_user_id, session_id, action_kind, aggregate_id, expected_version,
          payload_hash, verified_at, expires_at, status, consumed_at)
       values ($1, $2, $3, 'bank_snapshot_attest', $4, $5, $6, $7, $8, 'consumed', $7)`,
      [
        authorizationId,
        actorUserId,
        sessionId,
        attestationId,
        Number(input.expectedBankLiquidityRevision),
        payloadHash,
        now,
        new Date(now.getTime() + 60_000)
      ]
    );
    return createDrizzleBankLiquiditySnapshotAttestationUnitOfWork({
      database: runtime.database
    }).attestBankLiquiditySnapshot({
      ...attestationInput,
      authorization: {
        authorizationId,
        actorUserId,
        sessionId,
        actionKind: "bank_snapshot_attest",
        aggregateId: attestationId,
        expectedVersion: Number(input.expectedBankLiquidityRevision),
        payloadHash,
        verifiedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
        status: "consumed"
      }
    });
  }
});

function operationEnvelope() {
  return Object.freeze({
    kind: "resolved_finance_operation_envelope" as const,
    policyId: "client_order_capture",
    policyVersion: 1,
    policyDigest: sha("capture-policy"),
    maximumRows: 100,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 64 * 1024
  });
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sha(value: string): `sha256:${string}` {
  return digest(new TextEncoder().encode(value));
}

function integrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run finance integration tests against");
}

function withDatabaseName(connectionString: string, targetDatabaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}
