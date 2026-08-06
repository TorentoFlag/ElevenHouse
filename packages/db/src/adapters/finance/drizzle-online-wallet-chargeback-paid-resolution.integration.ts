import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createHash, randomUUID } from "node:crypto";

import {
  createBankLiquiditySnapshotAttestationAuthorizationPayload,
  createCapturedProviderPaymentSemanticSourceId,
  createOrderEconomicsSnapshot,
  createRiskPolicySnapshot,
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
  createDrizzleCapturedClientOrderWebhookClaimPort,
  createDrizzleChargebackClientOrderWebhookClaimPort
} from "./drizzle-captured-client-order-webhook-claim-port";
import { createDrizzleCashPoolDirectoryBootstrapPort } from "./drizzle-cash-pool-directory-bootstrap";
import { createDrizzleEconomicPaymentIntentCreationUnitOfWork } from "./drizzle-economic-payment-intent-creation-uow";
import { createDrizzleEconomicPaymentSessionOpenUnitOfWork } from "./drizzle-economic-payment-session-open-uow";
import {
  createFinanceArtifactRegistry,
  type FinanceArtifactRegistry
} from "./finance-artifact-registry";
import { createDrizzleBankLiquiditySnapshotAdoptionUnitOfWork } from "./drizzle-bank-liquidity-snapshot-adoption-uow";
import { createDrizzleBankLiquiditySnapshotAttestationUnitOfWork } from "./drizzle-bank-liquidity-snapshot-attestation-uow";
import { createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork } from "./drizzle-online-sale-capture-canonical-webhook-uow";
import { createDrizzleOnlineSaleCapturePersistenceResolver } from "./drizzle-online-sale-capture-persistence-resolver";
import { createDrizzleOnlineWalletChargebackCaseUnitOfWork } from "./drizzle-online-wallet-chargeback-case-uow";
import { createDrizzleOnlineWalletChargebackResolutionUnitOfWork } from "./drizzle-online-wallet-chargeback-resolution-uow";
import { createDrizzleOnlineWalletHoldReleaseUnitOfWork } from "./drizzle-online-wallet-hold-release-uow";
import { createDrizzleOnlineWalletPayoutExecutionUnitOfWork } from "./drizzle-online-wallet-payout-execution-uow";
import { createDrizzleOnlineWalletPayoutRequestUnitOfWork } from "./drizzle-online-wallet-payout-request-uow";
import { createDrizzleOnlineWalletPayoutReviewUnitOfWork } from "./drizzle-online-wallet-payout-review-uow";
import { createDrizzleWebhookIngressStorageUnitOfWork } from "./drizzle-webhook-ingress-storage-uow";
import { createDrizzleBookingCommandStore } from "../scheduling/drizzle-booking-command-store";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_chargeback_paid_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-chargeback-paid",
  providerAccountId: "arc-chargeback-paid-account",
  identityVersion: 1
});

describe.sequential("V2 chargeback platform-loss after a fully paid manual payout", () => {
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
      await transaction
        .insert(financeProviderAccountSeries)
        .values({
          seriesId: providerAccount.seriesId,
          provider: "arc_pay",
          activeIdentityVersion: providerAccount.identityVersion,
          headVersion: "1"
        });
      await transaction
        .insert(financeProviderAccounts)
        .values({
          ...providerAccount,
          provider: "arc_pay",
          merchantTenantId: "elevenhouse-chargeback-paid",
          environment: "sandbox",
          terminalScope: "hosted-and-saved-card",
          settlementScope: "company-settlement",
          predecessorProviderAccountId: null,
          predecessorIdentityVersion: null
        });
      await transaction.insert(financeArtifactRetentionPolicies).values([
        {
          policyId: "chargeback-paid-webhook-retention",
          policyVersion: "1",
          artifactClass: "provider_webhook",
          retainForSeconds: "3600",
          authorityRef: "integration-test",
          effectiveAt: new Date("2020-01-01T00:00:00.000Z")
        },
        {
          policyId: "chargeback-paid-canonical-retention",
          policyVersion: "1",
          artifactClass: "provider_canonical_read",
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

  it("records exactly one platform loss after the entire zero-reserve payable source has been paid, without re-debiting the astrologer", async () => {
    const fixture = await seedZeroReserveCapture();
    await applyCapture(fixture);

    const completedAt = new Date().toISOString();
    await createDrizzleBookingCommandStore(runtime.database).executeOwnerCompletion(
      {
        actorUserId: fixture.astrologerUserId,
        scope: "bookings.owner.complete",
        key: `paid-chargeback-complete:${fixture.bookingId}`,
        requestHash: sha(`paid-chargeback-complete:${fixture.bookingId}`),
        now: completedAt,
        expiresAt: new Date(Date.parse(completedAt) + 86_400_000).toISOString()
      },
      { bookingId: fixture.bookingId, expectedLifecycleRevision: 1 }
    );
    const release = await createDrizzleOnlineWalletHoldReleaseUnitOfWork({
      database: runtime.database
    }).releaseDueOnlineWalletHolds({ now: completedAt, limit: 10 });
    const released = release.receipts.find((receipt) => receipt.effect === "applied_once");
    expect(released).toMatchObject({ effect: "applied_once", walletRevision: "2" });
    await expect(
      runtime.pool.query(
        "select available_minor::text as available_minor, reserved_minor::text as reserved_minor from finance_online_wallet_heads where id = $1",
        [released!.walletId]
      )
    ).resolves.toMatchObject({ rows: [{ available_minor: "9600", reserved_minor: "0" }] });

    const payoutMethodId = randomUUID();
    await runtime.pool.query(
      "insert into payout_methods (id, astrologer_user_id, method, currency, display_name, is_default, version) values ($1, $2, 'manual_bank_transfer', 'RUB', 'Chargeback paid fixture', true, 1)",
      [payoutMethodId, fixture.astrologerUserId]
    );
    await runtime.pool.query(
      "insert into payout_method_versions (payout_method_id, version, destination_kind, beneficiary_fingerprint, redacted_display, sealed_destination_ref) values ($1, 1, 'bank_account', $2, 'Account **** 1188', $3)",
      [
        payoutMethodId,
        sha("chargeback-paid-beneficiary"),
        "kms://integration/chargeback-paid-destination/v1"
      ]
    );
    const payoutRequestId = `chargeback-paid-payout:${randomUUID()}`;
    const payout = await createDrizzleOnlineWalletPayoutRequestUnitOfWork({
      database: runtime.database
    }).createOnlineWalletPayoutRequest({
      payoutRequestId,
      walletId: released!.walletId,
      astrologerUserId: fixture.astrologerUserId,
      amountMinor: "9600",
      currency: "RUB",
      destination: {
        kind: "sealed_payout_destination_snapshot",
        payoutMethodId,
        payoutMethodVersion: 1,
        destinationKind: "bank_account",
        beneficiaryFingerprint: sha("chargeback-paid-beneficiary"),
        redactedDisplay: "Account **** 1188",
        sealedDestinationRef: "kms://integration/chargeback-paid-destination/v1"
      },
      requestAuthority: {
        authorityId: `payout-request:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-request:${payoutRequestId}`)
      },
      occurredAt: completedAt
    } as never);
    expect(payout).toMatchObject({
      effect: "applied_once",
      walletRevision: "3",
      payoutVersion: "1"
    });

    const reviewerId = randomUUID();
    const approverId = randomUUID();
    const executorId = randomUUID();
    const confirmerId = randomUUID();
    await runtime.pool.query("insert into users (id) values ($1), ($2), ($3), ($4)", [
      reviewerId,
      approverId,
      executorId,
      confirmerId
    ]);
    await createDrizzleOnlineWalletPayoutReviewUnitOfWork({
      database: runtime.database
    }).transitionOnlineWalletPayout({
      payoutRequestId,
      expectedPayoutVersion: "1",
      nextStatus: "under_review",
      actorUserId: reviewerId,
      adminNote: "Full payable review",
      authority: {
        authorityId: `payout-review:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-review:${payoutRequestId}`)
      },
      occurredAt: completedAt
    });

    const bankCashPoolId = `chargeback-paid-pool:${randomUUID()}`;
    await createDrizzleCashPoolDirectoryBootstrapPort({
      database: runtime.database
    }).ensureEmptySystemCashPoolReference({
      bankCashPoolId,
      currency: "RUB",
      bankAccountFingerprint: sha(`bank-account:${bankCashPoolId}`),
      statementSourceFingerprint: sha(`statement-source:${bankCashPoolId}`)
    });
    const attested = await attestLiquiditySnapshot({
      bankCashPoolId,
      expectedBankLiquidityRevision: "0",
      unrestrictedAvailableMinor: "10000",
      sourceCheckpoint: `statement:${bankCashPoolId}:1`
    });
    const adopted = await createDrizzleBankLiquiditySnapshotAdoptionUnitOfWork({
      database: runtime.database
    }).adoptVerifiedLiquiditySnapshot({
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "0",
      evidence: attested.evidence,
      operationEnvelope: operationEnvelope()
    } as never);
    const approved = await createDrizzleOnlineWalletPayoutReviewUnitOfWork({
      database: runtime.database
    }).approveOnlineWalletPayout({
      payoutRequestId,
      expectedPayoutVersion: "2",
      expectedBeneficiaryFingerprint: sha("chargeback-paid-beneficiary"),
      bankCashPoolId,
      currency: "RUB",
      expectedBankLiquidityRevision: "1",
      adoptedLiquiditySnapshot: adopted.ref,
      actorUserId: approverId,
      authority: {
        authorityId: `payout-approval:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-approval:${payoutRequestId}`)
      },
      occurredAt: new Date().toISOString(),
      operationEnvelope: operationEnvelope()
    } as never);
    expect(approved).toMatchObject({
      effect: "applied_once",
      payoutVersion: "3",
      bankExposureVersion: "1"
    });

    const approvalRow = (
      await runtime.pool.query<{ receipt_id: string; canonical_digest: `sha256:${string}` }>(
        "select receipt_id, canonical_digest from finance_online_payout_approval_receipts where payout_request_id = $1",
        [payoutRequestId]
      )
    ).rows[0];
    expect(approvalRow).toBeDefined();
    const payoutExecution = createDrizzleOnlineWalletPayoutExecutionUnitOfWork({
      database: runtime.database
    });
    await payoutExecution.startOnlineWalletPayoutManualExecution({
      payoutRequestId,
      expectedPayoutVersion: "3",
      expectedBankExposureVersion: "1",
      approval: {
        kind: "online_wallet_payout_approval_receipt",
        receiptId: approvalRow!.receipt_id,
        canonicalDigest: approvalRow!.canonical_digest
      },
      executorActorUserId: executorId,
      authority: {
        authorityId: `payout-execute:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-execute:${payoutRequestId}`)
      },
      occurredAt: new Date().toISOString()
    } as never);
    const transfer = await registerBankTransferEvidence(bankCashPoolId);
    const paid = await payoutExecution.confirmOnlineWalletPayoutPaid({
      payoutRequestId,
      expectedPayoutVersion: "4",
      expectedWalletRevision: "3",
      expectedBankExposureVersion: "2",
      approval: {
        kind: "online_wallet_payout_approval_receipt",
        receiptId: approvalRow!.receipt_id,
        canonicalDigest: approvalRow!.canonical_digest
      },
      bankReference: `manual-paid:${payoutRequestId}`,
      transferredAt: new Date().toISOString(),
      evidenceArtifactId: transfer.id,
      evidenceArtifactDigest: transfer.digest,
      confirmerActorUserId: confirmerId,
      authority: {
        authorityId: `payout-paid:${payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: sha(`payout-paid:${payoutRequestId}`)
      },
      occurredAt: new Date(Date.now() + 1).toISOString()
    } as never);
    expect(paid).toMatchObject({
      effect: "applied_once",
      payoutVersion: "5",
      walletRevision: "4",
      bankExposureState: "paid_unreflected"
    });
    await expect(
      runtime.pool.query(
        "select available_minor::text as available_minor, reserved_minor::text as reserved_minor, payout_pending_minor::text as payout_pending_minor, revision::text as revision from finance_online_wallet_heads where id = $1",
        [released!.walletId]
      )
    ).resolves.toMatchObject({
      rows: [
        { available_minor: "0", reserved_minor: "0", payout_pending_minor: "0", revision: "4" }
      ]
    });

    const chargeback = await applyProvisionalChargeback(fixture);
    const outcomeArtifact = await registerArtifact({
      artifactId: `chargeback-paid-outcome:${randomUUID()}`,
      artifactClass: "provider_canonical_read",
      bytes: new TextEncoder().encode("lost")
    });
    const command = {
      chargebackCaseId: chargeback.chargebackCaseId,
      expectedChargebackVersion: 1,
      walletId: chargeback.walletId,
      expectedWalletRevision: "4",
      expectedPrincipalPositionVersion: "1",
      expectedRecoveryPositionVersion: "1",
      resolutionAuthority: {
        kind: "verified_chargeback_resolution_authority",
        chargebackCaseId: chargeback.chargebackCaseId,
        expectedChargebackVersion: 1,
        resolution: "lost",
        cumulativePrincipalMinor: "10000",
        providerEvidence: {
          kind: "verified_chargeback_provider_evidence",
          providerAccount,
          chargebackCaseId: chargeback.chargebackCaseId,
          providerPaymentId: fixture.providerPaymentId,
          lifecycleFact: "lost",
          cumulativePrincipalMinor: "10000",
          currency: "RUB",
          artifact: outcomeArtifact,
          observedAt: fixture.observedAt
        },
        allocationAuthorityId: `chargeback-loss:${chargeback.chargebackCaseId}`,
        allocationAuthorityVersion: "1",
        allocationAuthorityDigest: sha(`chargeback-loss:${chargeback.chargebackCaseId}`),
        decidedByActorId: approverId,
        decidedAt: fixture.observedAt
      },
      operationEnvelope: operationEnvelope()
    } as const;
    const beforeResolution = await walletMutationAndBalance(chargeback.walletId);
    const resolution = createDrizzleOnlineWalletChargebackResolutionUnitOfWork({
      database: runtime.database
    });
    const first = await resolution.resolveChargeback(command as never);
    const replay = await resolution.resolveChargeback(command as never);
    expect(first).toMatchObject({
      resolution: "lost_after_paid_platform_loss",
      walletRevision: "4"
    });
    expect(replay).toMatchObject({
      resolution: "lost_after_paid_platform_loss",
      journalTransactionId: first.journalTransactionId
    });
    await expect(walletMutationAndBalance(chargeback.walletId)).resolves.toEqual(beforeResolution);
    await expect(
      runtime.pool.query(
        `select resolution.resolution, count(*)::int as resolution_count,
              (select count(*)::int from finance_journal_transactions journal where journal.id = resolution.journal_transaction_id) as journal_count,
              (select array_agg(account.code order by entry.entry_index) from finance_journal_entries entry join finance_accounts account on account.id = entry.account_id where entry.journal_transaction_id = resolution.journal_transaction_id) as account_codes
         from finance_online_wallet_chargeback_resolutions resolution
        where resolution.chargeback_case_id = $1
        group by resolution.resolution, resolution.journal_transaction_id`,
        [chargeback.chargebackCaseId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          resolution: "lost_after_paid_platform_loss",
          resolution_count: 1,
          journal_count: 1,
          account_codes: ["platform_chargeback_loss", "chargeback_principal_suspense"]
        }
      ]
    });
  });

  async function walletMutationAndBalance(walletId: string) {
    const result = await runtime.pool.query<{
      mutation_count: number;
      available_minor: string;
      reserved_minor: string;
      payout_pending_minor: string;
      revision: string;
    }>(
      `select (select count(*)::int from finance_online_wallet_mutations where wallet_id = $1) as mutation_count, available_minor::text as available_minor, reserved_minor::text as reserved_minor, payout_pending_minor::text as payout_pending_minor, revision::text as revision from finance_online_wallet_heads where id = $1`,
      [walletId]
    );
    return result.rows[0];
  }

  async function applyCapture(fixture: Awaited<ReturnType<typeof seedZeroReserveCapture>>) {
    const claim = await createDrizzleCapturedClientOrderWebhookClaimPort({
      database: runtime.database,
      workerId: "chargeback-paid-capture",
      leaseDurationSeconds: 60,
      retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
    }).claimNextCapturedClientOrderWebhook();
    if (!claim) throw new Error("captured fixture was not claimable");
    await createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
      database: runtime.database,
      workerId: "chargeback-paid-capture",
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
          semanticSourceId: createCapturedProviderPaymentSemanticSourceId(
            fixture.providerPaymentId
          ),
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

  async function applyProvisionalChargeback(
    fixture: Awaited<ReturnType<typeof seedZeroReserveCapture>>
  ) {
    const webhookId = `chargeback-paid-webhook:${randomUUID()}`;
    const webhookBytes = new TextEncoder().encode(webhookId);
    const webhookArtifact = await registerArtifact({
      artifactId: `chargeback-paid-webhook-artifact:${randomUUID()}`,
      artifactClass: "provider_webhook",
      bytes: webhookBytes
    });
    const canonicalArtifact = await registerArtifact({
      artifactId: `chargeback-paid-canonical-artifact:${randomUUID()}`,
      artifactClass: "provider_canonical_read",
      bytes: new TextEncoder().encode("chargeback")
    });
    const stored = await createDrizzleWebhookIngressStorageUnitOfWork({
      database: runtime.database
    }).storeBeforeAcknowledgement({
      expectedTransportIdentityAbsent: true,
      ingressEvidence: {
        kind: "verified_webhook_ingress_evidence",
        provider: "arc_pay",
        providerAccount,
        receivingEnvironment: "sandbox",
        webhookId,
        providerEventType: "payment.chargeback",
        rawBodyDigest: digest(webhookBytes),
        sealedPayloadRef: webhookArtifact.artifactId,
        signatureScheme: "arc_pay_hmac_sha256_v1",
        verifierContractVersion: "arc_pay_webhook_ingress_v1",
        webhookSigningKeyVersionId: "key-v1",
        signedTimestamp: "2020-01-01T12:00:00.000Z",
        signatureEvidenceDigest: sha(`chargeback-paid-signature:${webhookId}`),
        verifiedAt: "2020-01-01T12:00:01.000Z",
        receivedAt: "2020-01-01T12:00:02.000Z"
      }
    } as never);
    const claim = await createDrizzleChargebackClientOrderWebhookClaimPort({
      database: runtime.database,
      workerId: "chargeback-paid-chargeback",
      leaseDurationSeconds: 60,
      retryPolicy: { maximumAttempts: 3, baseDelayMilliseconds: 100, maximumDelayMilliseconds: 500 }
    }).claimNextChargebackClientOrderWebhook();
    if (!claim || claim.inboxItemId !== stored.inboxItemId)
      throw new Error("chargeback fixture was not claimable");
    return createDrizzleOnlineWalletChargebackCaseUnitOfWork({
      database: runtime.database,
      workerId: "chargeback-paid-chargeback"
    }).applyVerifiedOnlineWalletChargebackNotice({
      semanticFact: {
        inboxItemId: claim.inboxItemId,
        expectedInboxVersion: claim.inboxVersion,
        expectedCheckpointSequence: claim.expectedCheckpointSequence,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId,
          semanticSourceKind: "chargeback",
          semanticSourceId: webhookId,
          economicPaymentIntentId: fixture.intentId,
          economicPaymentSessionId: null,
          providerPaymentId: null,
          amountMinor: null,
          currency: null,
          purpose: "client_order",
          canonicalFactDigest: sha(`chargeback-paid-fact:${webhookId}`),
          artifact: canonicalArtifact,
          observedAt: fixture.observedAt
        },
        operationEnvelope: operationEnvelope()
      },
      chargeback: {
        providerPaymentId: fixture.providerPaymentId,
        providerSource: { kind: "webhook_event_id", webhookEventId: webhookId },
        disputedPrincipalMinor: "10000",
        occurredAt: fixture.observedAt
      }
    } as never);
  }

  async function seedZeroReserveCapture() {
    const astrologerUserId = randomUUID();
    const clientUserId = randomUUID();
    const productId = randomUUID();
    const policyId = randomUUID();
    const policyVersion = Number.parseInt(randomUUID().replaceAll("-", "").slice(0, 7), 16) + 1;
    const tariffSeriesId = `chargeback-paid-tariff:${randomUUID()}`;
    const tariffVersionDigest = sha(`tariff:${tariffSeriesId}`);
    const orderId = randomUUID();
    const intentId = `chargeback-paid-intent:${randomUUID()}`;
    const sessionId = `chargeback-paid-session:${randomUUID()}`;
    const providerOperationIntentId = `chargeback-paid-provider-operation:${randomUUID()}`;
    const webhookId = `chargeback-paid-capture:${randomUUID()}`;
    const providerPaymentId = `chargeback-paid-payment:${randomUUID()}`;
    const scheduleId = randomUUID();
    const reservationId = randomUUID();
    const bookingId = randomUUID();
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
      reserveBps: 0,
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
    await runtime.pool.query("insert into users (id) values ($1), ($2)", [
      astrologerUserId,
      clientUserId
    ]);
    await runtime.pool.query(
      "insert into products (id, owner_user_id, type, status, title, price_minor, currency, execution_mode, payment_model, duration_minutes, participant_mode) values ($1, $2, 'single', 'active', 'Chargeback paid capture', 10000, 'RUB', 'live', 'once', 60, 'solo')",
      [productId, astrologerUserId]
    );
    await runtime.pool.query(
      "insert into availability_schedules (id, owner_user_id, name, time_zone, is_default, version, start_interval_minutes, buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days) values ($1, $2, 'Chargeback paid', 'UTC', true, 1, 60, 0, 0, 0, 365)",
      [scheduleId, astrologerUserId]
    );
    await runtime.pool.query(
      "insert into schedule_reservations (id, owner_user_id, schedule_id, kind, lifecycle, service_start_at, service_end_at, occupied_start_at, occupied_end_at, source_aggregate_id, hold_expires_at) values ($1, $2, $3, 'booking', 'active', '2020-01-01T10:00:00Z', '2020-01-01T11:00:00Z', '2020-01-01T10:00:00Z', '2020-01-01T11:00:00Z', $4, null)",
      [reservationId, astrologerUserId, scheduleId, bookingId]
    );
    await runtime.pool.query(
      'insert into bookings (id, owner_user_id, client_user_id, product_id, reservation_id, source, state, lifecycle_revision, hold_expires_at, service_start_at, service_end_at, product_title_snapshot, duration_minutes_snapshot, delivery_format_snapshot, price_minor_snapshot, currency_snapshot, time_zone_snapshot, policy_snapshot, client_data_requirements_snapshot) values ($1, $2, $3, $4, $5, \'client_paid\', \'pending_payment\', 0, null, \'2020-01-01T10:00:00Z\', \'2020-01-01T11:00:00Z\', \'Chargeback paid capture\', 60, \'video\', 10000, \'RUB\', \'UTC\', \'{"bufferBeforeMinutes":0,"bufferAfterMinutes":0,"minimumNoticeMinutes":0}\', \'{"schemaVersion":"booking-client-data-requirements.v1","executionMode":"live","participantMode":"solo","requiredClientData":[],"methods":[]}\')',
      [bookingId, astrologerUserId, clientUserId, productId, reservationId]
    );
    await runtime.pool.query(
      "insert into finance_policies (id, policy_version, risk_tier, hold_duration_hours, is_active) values ($1, $2, 'standard', 48, false)",
      [policyId, policyVersion]
    );
    await runtime.pool.query("insert into platform_tariff_series (id, code) values ($1, $2)", [
      tariffSeriesId,
      tariffSeriesId
    ]);
    await runtime.pool.query(
      "insert into platform_tariff_versions (tariff_series_id, version, lifecycle, name, tagline, monthly_price_minor, yearly_price_minor, currency, client_sale_commission_bps, display_order, canonical_preimage, canonical_digest) values ($1, 1, 'draft', 'Chargeback paid', 'Chargeback paid', 0, 0, 'RUB', 400, 0, '{\"schemaVersion\":\"integration.v1\"}', $2)",
      [tariffSeriesId, tariffVersionDigest]
    );
    await runtime.pool.query(
      "insert into orders (id, client_user_id, astrologer_user_id, product_id, status, product_title_snapshot, gross_amount_minor, gross_currency, platform_fee_amount_minor, platform_fee_currency, astrologer_net_amount_minor, astrologer_net_currency, finance_policy_snapshot_id, finance_policy_risk_tier, finance_policy_hold_duration_hours, finance_policy_reserve_bps, finance_policy_reserve_release_delay_days, tariff_series_id, tariff_version, tariff_version_digest, tariff_commission_bps, finance_policy_provider_settlement_required) values ($1, $2, $3, $4, 'pending_payment', 'Chargeback paid capture', 10000, 'RUB', 400, 'RUB', 9600, 'RUB', $5, 'standard', 0, 0, 0, $6, 1, $7, 400, false)",
      [
        orderId,
        clientUserId,
        astrologerUserId,
        productId,
        policyId,
        tariffSeriesId,
        tariffVersionDigest
      ]
    );
    await runtime.pool.query("update orders set booking_id = $1 where id = $2", [
      bookingId,
      orderId
    ]);
    await runtime.pool.query(
      "insert into finance_order_economics_snapshots (order_id, astrologer_user_id, plan_id, plan_version_id, gross_amount_minor, gross_currency, commission_amount_minor, commission_currency, payable_amount_minor, payable_currency, commission_bps, allocation_revision, canonical_digest) values ($1, $2, $3, $4, 10000, 'RUB', 400, 'RUB', 9600, 'RUB', 400, 'bps_half_up_v1', $5)",
      [
        orderId,
        astrologerUserId,
        economics.planId,
        economics.planVersionId,
        hashFinanceCommandPayload(economics)
      ]
    );
    await runtime.pool.query(
      "insert into finance_risk_policy_versions (policy_id, policy_version, effective_risk_tier, hold_anchor, hold_duration_hours, reserve_bps, reserve_release_delay_days, provider_settlement_required, payout_minimum_amount_minor, payout_minimum_currency, exception_authority_id, exception_authority_version, effective_at, canonical_digest) values ($1, $2, 'standard', 'booking_completed', 0, 0, 0, false, 100, 'RUB', null, null, '2020-01-01T00:00:00Z', $3)",
      [policyId, policyVersion, hashFinanceCommandPayload(risk)]
    );
    const fulfillmentDigest = hashFinanceCommandPayload(fulfillment);
    await runtime.pool.query(
      "insert into finance_paid_product_fulfillment_decisions (supported, registry_key, registry_revision, hold_anchor, terminal_evidence_owner, terminal_evidence_status, terminal_evidence_contract_version, cancellation_allocator_owner, cancellation_allocator_port, cancellation_allocator_policy_version, canonical_digest) values (true, 'single.once.live.solo', 1, 'booking_completed', 'booking', 'completed', 1, 'booking', 'BookingCancellationRefundDecisionPort', 1, $1) on conflict (registry_key, registry_revision) do nothing",
      [fulfillmentDigest]
    );
    await createDrizzleEconomicPaymentIntentCreationUnitOfWork({
      database: runtime.database
    }).createEconomicPaymentIntent({
      economicPaymentIntentId: intentId,
      sourceId: orderId,
      purpose: "client_order",
      providerAccount,
      amountMinor: "10000",
      currency: "RUB",
      expectedSourceUniquenessVersion: 0
    });
    await createDrizzleEconomicPaymentSessionOpenUnitOfWork({
      database: runtime.database
    }).openEconomicPaymentSession({
      economicPaymentIntentId: intentId,
      economicPaymentSessionId: sessionId,
      expectedEconomicPaymentVersion: 1,
      providerAccount
    });
    await runtime.pool.query(
      "insert into finance_client_checkout_authorizations (authority_id, order_id, client_user_id, payment_command_id, economic_payment_intent_id, economic_payment_session_id, provider_operation_intent_id, risk_policy_id, risk_policy_version, risk_policy_digest, fulfillment_decision_id, fulfillment_decision_version, fulfillment_decision_digest) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'single.once.live.solo', 1, $11)",
      [
        `checkout:${randomUUID()}`,
        orderId,
        clientUserId,
        randomUUID(),
        intentId,
        sessionId,
        providerOperationIntentId,
        policyId,
        policyVersion,
        hashFinanceCommandPayload(risk),
        fulfillmentDigest
      ]
    );
    const webhookBytes = new TextEncoder().encode(webhookId);
    const webhookArtifact = await registerArtifact({
      artifactId: `capture-webhook:${randomUUID()}`,
      artifactClass: "provider_webhook",
      bytes: webhookBytes
    });
    const canonicalArtifact = await registerArtifact({
      artifactId: `capture-canonical:${randomUUID()}`,
      artifactClass: "provider_canonical_read",
      bytes: new TextEncoder().encode(providerPaymentId)
    });
    await createDrizzleWebhookIngressStorageUnitOfWork({
      database: runtime.database
    }).storeBeforeAcknowledgement({
      expectedTransportIdentityAbsent: true,
      ingressEvidence: {
        kind: "verified_webhook_ingress_evidence",
        provider: "arc_pay",
        providerAccount,
        receivingEnvironment: "sandbox",
        webhookId,
        providerEventType: "payment.captured",
        rawBodyDigest: digest(webhookBytes),
        sealedPayloadRef: webhookArtifact.artifactId,
        signatureScheme: "arc_pay_hmac_sha256_v1",
        verifierContractVersion: "arc_pay_webhook_ingress_v1",
        webhookSigningKeyVersionId: "key-v1",
        signedTimestamp: "2020-01-01T11:59:00.000Z",
        signatureEvidenceDigest: sha(`capture-signature:${webhookId}`),
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
      webhookId,
      providerPaymentId,
      observedAt: new Date().toISOString(),
      canonicalFactDigest: sha(`capture-fact:${providerPaymentId}`),
      canonicalArtifact
    };
  }

  async function registerArtifact(
    input: Readonly<{
      artifactId: string;
      artifactClass: "provider_webhook" | "provider_canonical_read";
      bytes: Uint8Array;
    }>
  ) {
    const sha256Digest = digest(input.bytes);
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
      retentionPolicyId:
        input.artifactClass === "provider_webhook"
          ? "chargeback-paid-webhook-retention"
          : "chargeback-paid-canonical-retention",
      retentionPolicyVersion: "1"
    });
  }

  async function registerBankTransferEvidence(bankCashPoolId: string) {
    const id = `chargeback-paid-transfer:${randomUUID()}`;
    const digestValue = sha(`transfer:${id}`);
    const policyId = `chargeback-paid-transfer-retention:${randomUUID()}`;
    await runtime.pool.query(
      "insert into finance_artifact_retention_policies (policy_id, policy_version, artifact_class, retain_for_seconds, authority_ref, effective_at) values ($1, 1, 'bank_transfer_evidence', 86400, 'integration-test', '2020-01-01T00:00:00.000Z')",
      [policyId]
    );
    await runtime.pool.query(
      "insert into finance_artifacts (id, artifact_class, sha256_digest, byte_length, content_type, binding_kind, bank_cash_pool_id, currency, statement_source_fingerprint, private_object_key, private_object_version, envelope_key_version, retention_policy_id, retention_policy_version, retained_until) values ($1, 'bank_transfer_evidence', $2, 1024, 'application/pdf', 'bank_cash_pool', $3, 'RUB', $4, $5, 'v1', 'kms-v1', $6, 1, '2030-01-01T00:00:00.000Z')",
      [
        id,
        digestValue,
        bankCashPoolId,
        sha(`statement-source:${bankCashPoolId}`),
        `private/${id}`,
        policyId
      ]
    );
    return { id, digest: digestValue };
  }

  async function attestLiquiditySnapshot(
    input: Readonly<{
      bankCashPoolId: string;
      expectedBankLiquidityRevision: string;
      unrestrictedAvailableMinor: string;
      sourceCheckpoint: string;
    }>
  ) {
    const actorUserId = randomUUID();
    const sessionId = randomUUID();
    const attestationId = randomUUID();
    const authorizationId = randomUUID();
    const artifactId = `chargeback-paid-liquidity:${randomUUID()}`;
    const artifactDigest = sha(`liquidity:${artifactId}`);
    const now = new Date();
    const attestationInput = {
      attestationId,
      bankCashPoolId: input.bankCashPoolId,
      currency: "RUB" as const,
      expectedBankLiquidityRevision: input.expectedBankLiquidityRevision,
      unrestrictedAvailableMinor: input.unrestrictedAvailableMinor,
      sourceCheckpoint: input.sourceCheckpoint,
      asOf: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      evidenceArtifact: {
        artifactId,
        sha256Digest: artifactDigest,
        byteLength: 1024,
        bankCashPoolId: input.bankCashPoolId,
        statementSourceFingerprint: sha(`statement-source:${input.bankCashPoolId}`)
      }
    } as const;
    const payloadHash = hashFinanceCommandPayload(
      createBankLiquiditySnapshotAttestationAuthorizationPayload(attestationInput)
    );
    const policyId = `chargeback-paid-liquidity-retention:${attestationId}`;
    await runtime.pool.query("insert into users (id) values ($1)", [actorUserId]);
    await runtime.pool.query(
      "insert into user_sessions (id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)",
      [sessionId, actorUserId, `session:${sessionId}`, new Date(now.getTime() + 60 * 60_000)]
    );
    await runtime.pool.query(
      "insert into finance_artifact_retention_policies (policy_id, policy_version, artifact_class, retain_for_seconds, authority_ref, effective_at) values ($1, 1, 'bank_statement', 86400, 'integration-test', $2)",
      [policyId, now]
    );
    await runtime.pool.query(
      "insert into finance_artifacts (id, artifact_class, sha256_digest, byte_length, content_type, binding_kind, bank_cash_pool_id, currency, statement_source_fingerprint, private_object_key, private_object_version, envelope_key_version, retention_policy_id, retention_policy_version, retained_until) values ($1, 'bank_statement', $2, 1024, 'application/pdf', 'bank_cash_pool', $3, 'RUB', $4, $5, 'v1', 'kms-v1', $6, 1, $7)",
      [
        artifactId,
        artifactDigest,
        input.bankCashPoolId,
        attestationInput.evidenceArtifact.statementSourceFingerprint,
        `private/${artifactId}`,
        policyId,
        new Date(now.getTime() + 86_400_000)
      ]
    );
    await runtime.pool.query(
      "insert into finance_authorization_grants (authorization_id, actor_user_id, session_id, action_kind, aggregate_id, expected_version, payload_hash, verified_at, expires_at, status, consumed_at) values ($1, $2, $3, 'bank_snapshot_attest', $4, $5, $6, $7, $8, 'consumed', $7)",
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
  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "run finance integration tests against"
  );
}
function withDatabaseName(connectionString: string, targetDatabaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}
