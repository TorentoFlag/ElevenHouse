import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer,
  serializeError
} from "@elevenhouse/observability";
import {
  createDrizzleCapturedSaleUnitOfWork,
  createDrizzleCapturedClientOrderWebhookClaimPort,
  createDrizzleRefundedClientOrderWebhookClaimPort,
  createDrizzleChargebackClientOrderWebhookClaimPort,
  createDrizzleCapturedClientOrderWebhookCorrelationPort,
  createDrizzleClientOrderHostedCheckoutCaptureReconciliationReader,
  createDrizzleClientCheckoutProviderTransportUnknownUnitOfWork,
  createDrizzleOrderStore,
  createDrizzlePaymentStore,
  createDrizzlePaymentReversalUnitOfWork,
  createDrizzleProviderOperationDispatchReader,
  createDrizzleProviderOperationResultApplicationUnitOfWork,
  createDrizzleSavedCardCredentialActivationUnitOfWork,
  createDrizzleSavedCardSetupResultUnitOfWork,
  createDrizzleSavedCardSetupTerminalFailureUnitOfWork,
  createDrizzleSavedCardSetupCustomerActionUnitOfWork,
  createDrizzleSavedCardSetupPreparationUnitOfWork,
  createDrizzleSavedCardSetupSessionReader,
  createDrizzleFinanceOperationResourcePolicyReader,
  createDrizzleProviderOperationTransportUnknownUnitOfWork,
  createDrizzleReconciliationStore,
  createDrizzleTerminalPaymentUnitOfWork,
  createDrizzleClientCheckoutSessionResultUnitOfWork,
  createDrizzleSavedCardSetupTerminalReconciliationReader,
  createDrizzlePlatformTariffCredentialActivationUnitOfWork,
  createDrizzlePlatformTariffInvoiceCanonicalCaptureUnitOfWork,
  createDrizzlePlatformTariffInvoiceCanonicalFailureUnitOfWork,
  createDrizzlePlatformTariffInvoiceCustomerActionUnitOfWork,
  createDrizzlePlatformTariffInvoiceChargePreparationReader,
  createDrizzlePlatformTariffInvoiceChargePreparationUnitOfWork,
  createDrizzlePlatformTariffInvoiceChargeTerminalReconciliationReader,
  createDrizzlePlatformTariffRenewalInvoiceIssuer,
  createDrizzleActiveProviderAccountReader,
  createDrizzleActiveProviderAccountWebhookContextReader,
  createDrizzleSettlementBatchIngestionUnitOfWork,
  createDrizzleSettlementPaymentMatchUnitOfWork,
  createDrizzleSettlementPaymentReconciliationAdapters,
  createDrizzleSettlementCursorLeaseUnitOfWork,
  createDrizzleSettlementCursorWorkUnitOfWork,
  createDrizzleFiscalProfileReader,
  createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork,
  createDrizzleOnlineWalletHoldReleaseUnitOfWork,
  createDrizzleOnlineWalletRefundTerminalUnitOfWork,
  createDrizzleApprovedOnlineWalletRefundCaseReader,
  createDrizzleOnlineWalletRefundPositionReader,
  createDrizzleOnlineWalletChargebackCaseUnitOfWork,
  createDrizzleOnlineSaleCapturePersistenceResolver,
  createDrizzleVerifiedFiscalBuyerContactReader,
  createDrizzleWebhookIngressStorageUnitOfWork,
  createFinanceArtifactRegistry
} from "@elevenhouse/db/finance";
import { createDrizzleClientSubscriptionCaptureDispatchUnitOfWork } from "@elevenhouse/db/client-subscriptions";
import { createDrizzleOutboxRelayStore } from "@elevenhouse/db/outbox";
import { createDrizzlePlatformTariffAuthorityStore } from "@elevenhouse/db/platform-billing";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { createPlatformTariffInvoiceChargeCommandFactory } from "@elevenhouse/domain/finance-core";
import {
  createFinanceTransientSecretVault,
  createFinanceRestrictedProviderCredentialVault,
  createFilesystemFinancePrivateObjectStorage,
  createS3FinancePrivateObjectStorage,
  type FinancePrivateObjectStorageRuntime
} from "@elevenhouse/finance-infrastructure";
import { createArcPayCanonicalPaymentReader } from "./arc-pay/arc-pay-canonical-payment-reader";
import { createArcPayCheckoutSessionClient } from "./arc-pay/arc-pay-checkout-session-client";
import { createArcPayCardSetupClient } from "./arc-pay/arc-pay-card-setup-client";
import { createArcPayRefundClient } from "./arc-pay/arc-pay-refund-client";
import { createArcPaySavedCardChargeClient } from "./arc-pay/arc-pay-saved-card-charge-client";
import { createArcPayPaymentAttemptResolver } from "./arc-pay/arc-pay-payment-reader";
import { createArcPaySettlementBalanceClient } from "./arc-pay/arc-pay-settlement-balance-client";
import {
  createArcPayExactSettlementClient,
  createArcPayExactSettlementLedgerClient
} from "./arc-pay/arc-pay-settlement-ledger-exact-client";
import {
  createOnlineWalletHoldReleaseProcessor,
  startOnlineWalletHoldReleaseInterval
} from "./holds/online-wallet-hold-release.processor";
import { createPaymentWorkerRuntimeConfig } from "./runtime-config";
import {
  createClientOrderCaptureDispatchProcessor,
  startClientOrderCaptureDispatchInterval
} from "./client-subscriptions/finance-client-order-capture-dispatch-processor";
import {
  createSettlementBalanceObservationProcessor,
  startSettlementBalanceObservationInterval
} from "./reconciliation/settlement-balance-observation.processor";
import { createSettlementBalanceEvidenceSealer } from "./reconciliation/settlement-balance-evidence-sealer";
import {
  createSettlementIngestionProcessor,
  createSettlementLedgerIngestionProcessor,
  startSettlementLedgerIngestionInterval
} from "./reconciliation/settlement-ledger-ingestion.processor";
import {
  createArcPayAvailablePaymentCreditRule,
  createSettlementPaymentReconciliationProcessor,
  startSettlementPaymentReconciliationInterval
} from "./reconciliation/settlement-payment-reconciliation.processor";
import { createHostedCheckoutSessionDispatcher } from "./provider-operations/hosted-checkout-session-dispatcher";
import { createArcPayOperationDispatcher } from "./provider-operations/arc-pay-operation-dispatcher";
import {
  createCardSetupDispatcher,
  createCardSetupExecuteDispatcher,
  createCardSetupThreeDsMethodDispatcher
} from "./provider-operations/card-setup-dispatcher";
import { createSavedCardSetupPreparer } from "./provider-operations/saved-card-setup-preparer";
import {
  createSavedCardSetupPreparationProcessor,
  startSavedCardSetupPreparationInterval
} from "./provider-operations/saved-card-setup-preparation-processor";
import {
  createProviderOperationDispatchProcessor,
  startProviderOperationDispatchInterval
} from "./provider-operations/provider-operation-dispatch-processor";
import {
  createClientOrderHostedCheckoutCaptureReconciliationProcessor,
  startClientOrderHostedCheckoutCaptureReconciliationInterval
} from "./provider-operations/client-order-hosted-checkout-capture-reconciliation-processor";
import {
  createSavedCardSetupTerminalReconciliationProcessor,
  startSavedCardSetupTerminalReconciliationInterval
} from "./provider-operations/saved-card-setup-terminal-reconciliation-processor";
import { createSavedCardSetupTerminalReconciler } from "./provider-operations/saved-card-setup-terminal-reconciler";
import { createSavedCardChargeDispatcher } from "./provider-operations/saved-card-charge-dispatcher";
import { createSavedCardChargeThreeDsMethodDispatcher } from "./provider-operations/saved-card-charge-three-ds-method-dispatcher";
import { createRefundDispatcher } from "./provider-operations/refund-dispatcher";
import { createPlatformTariffInvoiceChargePreparer } from "./provider-operations/platform-tariff-invoice-charge-preparer";
import {
  createPlatformTariffInvoiceChargePreparationProcessor,
  startPlatformTariffInvoiceChargePreparationInterval
} from "./provider-operations/platform-tariff-invoice-charge-preparation-processor";
import {
  createPlatformTariffInvoiceChargeTerminalReconciliationProcessor,
  startPlatformTariffInvoiceChargeTerminalReconciliationInterval
} from "./provider-operations/platform-tariff-invoice-charge-terminal-reconciliation-processor";
import { createPlatformTariffInvoiceChargeTerminalReconciler } from "./provider-operations/platform-tariff-invoice-charge-terminal-reconciler";
import {
  createPlatformTariffRenewalProcessor,
  startPlatformTariffRenewalInterval
} from "./provider-operations/platform-tariff-renewal-processor";
import {
  createPaymentWebhookHandler,
  createPaymentWebhookServer
} from "./webhooks/payment-webhook.server";
import { createCanonicalClientOrderCaptureProcessor } from "./webhooks/canonical-client-order-capture.processor";
import { createCanonicalClientOrderOnlineSaleCaptureCommitAdapter } from "./webhooks/canonical-client-order-online-sale-capture-commit.adapter";
import { createCanonicalClientOrderCaptureEvidenceSealer } from "./webhooks/canonical-client-order-capture-evidence-sealer";
import { createCanonicalClientOrderRefundProcessor } from "./webhooks/canonical-client-order-refund.processor";
import { createCanonicalClientOrderRefundEvidenceSealer } from "./webhooks/canonical-client-order-refund-evidence-sealer";
import { startCanonicalClientOrderRefundInterval } from "./webhooks/canonical-client-order-refund-interval";
import { createCanonicalClientOrderChargebackProcessor } from "./webhooks/canonical-client-order-chargeback.processor";
import { createCanonicalClientOrderChargebackEvidenceSealer } from "./webhooks/canonical-client-order-chargeback-evidence-sealer";
import { startCanonicalClientOrderChargebackInterval } from "./webhooks/canonical-client-order-chargeback-interval";
import { startCanonicalClientOrderCaptureInterval } from "./webhooks/canonical-client-order-capture-interval";
import { createClaimedWebhookArtifactResolver } from "./webhooks/claimed-webhook-artifact-resolver";
import {
  createFinanceWebhookIngress,
  type FinanceWebhookIngress
} from "./webhooks/finance-reversal-webhook-ingress";
import { createPaymentWebhookProcessor } from "./webhooks/payment-webhook.processor";

const service = "payment-worker";
const logger = createLogger(service);

async function startPaymentWorker(): Promise<void> {
  const config = createPaymentWorkerRuntimeConfig();
  const postgresRuntime = createPostgresRuntime();
  const paymentStore = createDrizzlePaymentStore(postgresRuntime.database);
  const reconciliationStore = createDrizzleReconciliationStore(postgresRuntime.database);
  const processor = createPaymentWebhookProcessor({
    paymentStore,
    orderStore: createDrizzleOrderStore(postgresRuntime.database),
    capturedSale: createDrizzleCapturedSaleUnitOfWork(postgresRuntime.database),
    terminalPayment: createDrizzleTerminalPaymentUnitOfWork(postgresRuntime.database),
    reversal: createDrizzlePaymentReversalUnitOfWork(postgresRuntime.database),
    reconciliationStore,
    resolvePaymentAttemptId: createArcPayPaymentAttemptResolver(config.arcPay)
      .resolvePaymentAttemptId
  });
  let financeIngress: FinanceWebhookIngress | undefined;
  const readinessServer = createBasicWorkerReadinessServer({ service });

  if (config.financeProviderDispatch) {
    const privateStorage = createFinancePrivateObjectStorage(
      config.financeProviderDispatch.artifactStorage
    );
    await privateStorage.checkReady();
    const artifactRegistry = createFinanceArtifactRegistry(postgresRuntime.database);
    financeIngress = createFinanceWebhookIngress({
      providerAccounts: createDrizzleActiveProviderAccountWebhookContextReader(
        postgresRuntime.database
      ),
      privateObjectStorage: privateStorage,
      artifactRegistry,
      ingressStorage: createDrizzleWebhookIngressStorageUnitOfWork({
        database: postgresRuntime.database
      }),
      webhookSigningKeyVersionId: config.financeProviderDispatch.webhookSigningKeyVersionId,
      webhookArtifactRetention: config.financeProviderDispatch.webhookArtifactRetention
    });
    const transientSecretVault = createFinanceTransientSecretVault(privateStorage);
    const restrictedCredentialVault =
      createFinanceRestrictedProviderCredentialVault(privateStorage);
    const canonicalCaptureWorkerId = `${service}:${process.env.HOSTNAME ?? "local"}:${process.pid}`;
    const canonicalPaymentReader = createArcPayCanonicalPaymentReader(config.arcPay);
    const canonicalCaptureEvidenceSealer = createCanonicalClientOrderCaptureEvidenceSealer({
      privateObjectStorage: privateStorage,
      artifactRegistry,
      retention: config.financeProviderDispatch.canonicalReadArtifactRetention
    });
    const canonicalCaptureCommitAdapter = createCanonicalClientOrderOnlineSaleCaptureCommitAdapter({
      processorVersion: 1,
      capture: createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
        database: postgresRuntime.database,
        workerId: canonicalCaptureWorkerId,
        mutationResolver: createDrizzleOnlineSaleCapturePersistenceResolver()
      })
    });
    const canonicalClientOrderCapture = createCanonicalClientOrderCaptureProcessor({
      claims: createDrizzleCapturedClientOrderWebhookClaimPort({
        database: postgresRuntime.database,
        workerId: canonicalCaptureWorkerId,
        leaseDurationSeconds: config.canonicalClientOrderCapture.leaseDurationSeconds,
        retryPolicy: {
          maximumAttempts: config.canonicalClientOrderCapture.maximumAttempts,
          baseDelayMilliseconds: config.canonicalClientOrderCapture.retryBaseDelayMilliseconds,
          maximumDelayMilliseconds: config.canonicalClientOrderCapture.retryMaximumDelayMilliseconds
        }
      }),
      webhookArtifacts: createClaimedWebhookArtifactResolver({
        artifactRegistry,
        privateObjectStorage: privateStorage
      }),
      canonicalPayments: canonicalPaymentReader,
      correlations: createDrizzleCapturedClientOrderWebhookCorrelationPort(
        postgresRuntime.database
      ),
      evidence: canonicalCaptureEvidenceSealer,
      commit: canonicalCaptureCommitAdapter
    });
    startCanonicalClientOrderCaptureInterval({
      processor: canonicalClientOrderCapture,
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.kind === "committed") {
          logger.info("canonical client-order capture processed", result);
        }
      },
      onError: (error) =>
        logger.error("canonical client-order capture tick failed", { error: serializeError(error) })
    });
    startClientOrderHostedCheckoutCaptureReconciliationInterval({
      processor: createClientOrderHostedCheckoutCaptureReconciliationProcessor({
        candidates: createDrizzleClientOrderHostedCheckoutCaptureReconciliationReader(
          postgresRuntime.database
        ),
        canonicalPayments: canonicalPaymentReader,
        evidence: canonicalCaptureEvidenceSealer,
        commit: canonicalCaptureCommitAdapter,
        batchSize: config.financeProviderDispatch.batchSize
      }),
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.committed > 0 || result.replayed > 0) {
          logger.info("client-order hosted checkout reconciliation tick completed", result);
        }
      },
      onError: (error) =>
        logger.error("client-order hosted checkout reconciliation tick failed", {
          error: serializeError(error)
        })
    });
    startClientOrderCaptureDispatchInterval({
      processor: createClientOrderCaptureDispatchProcessor({
        store: createDrizzleOutboxRelayStore(postgresRuntime.database),
        unitOfWork: createDrizzleClientSubscriptionCaptureDispatchUnitOfWork(
          postgresRuntime.database
        ),
        batchSize: config.financeProviderDispatch.batchSize,
        publishingLockTimeoutMs: config.financeProviderDispatch.publishingLockTimeoutMs
      }),
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.claimed > 0)
          logger.info("client subscription capture dispatch tick completed", result);
      },
      onError: (error) =>
        logger.error("client subscription capture dispatch tick failed", {
          error: serializeError(error)
        })
    });
    const canonicalClientOrderRefund = createCanonicalClientOrderRefundProcessor({
      claims: createDrizzleRefundedClientOrderWebhookClaimPort({
        database: postgresRuntime.database,
        workerId: `${canonicalCaptureWorkerId}:refund`,
        leaseDurationSeconds: config.canonicalClientOrderCapture.leaseDurationSeconds,
        retryPolicy: {
          maximumAttempts: config.canonicalClientOrderCapture.maximumAttempts,
          baseDelayMilliseconds: config.canonicalClientOrderCapture.retryBaseDelayMilliseconds,
          maximumDelayMilliseconds: config.canonicalClientOrderCapture.retryMaximumDelayMilliseconds
        }
      }),
      webhookArtifacts: createClaimedWebhookArtifactResolver({
        artifactRegistry,
        privateObjectStorage: privateStorage
      }),
      canonicalPayments: createArcPayCanonicalPaymentReader(config.arcPay),
      correlations: createDrizzleCapturedClientOrderWebhookCorrelationPort(
        postgresRuntime.database
      ),
      positions: createDrizzleOnlineWalletRefundPositionReader(postgresRuntime.database),
      refundCases: createDrizzleApprovedOnlineWalletRefundCaseReader(postgresRuntime.database),
      policies: createDrizzleFinanceOperationResourcePolicyReader(postgresRuntime.database),
      evidence: createCanonicalClientOrderRefundEvidenceSealer({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        retention: config.financeProviderDispatch.canonicalReadArtifactRetention
      }),
      terminal: createDrizzleOnlineWalletRefundTerminalUnitOfWork({
        database: postgresRuntime.database,
        workerId: `${canonicalCaptureWorkerId}:refund`
      }),
      processorVersion: 1
    });
    startCanonicalClientOrderRefundInterval({
      processor: canonicalClientOrderRefund,
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.kind === "committed" && result.effect === "blocked_payout_outcome") {
          logger.error("canonical client-order refund needs payout recovery review", {
            inboxItemId: result.inboxItemId
          });
        }
      },
      onError: (error) =>
        logger.error("canonical client-order refund tick failed", { error: serializeError(error) })
    });
    const canonicalClientOrderChargeback = createCanonicalClientOrderChargebackProcessor({
      claims: createDrizzleChargebackClientOrderWebhookClaimPort({
        database: postgresRuntime.database,
        workerId: `${canonicalCaptureWorkerId}:chargeback`,
        leaseDurationSeconds: config.canonicalClientOrderCapture.leaseDurationSeconds,
        retryPolicy: {
          maximumAttempts: config.canonicalClientOrderCapture.maximumAttempts,
          baseDelayMilliseconds: config.canonicalClientOrderCapture.retryBaseDelayMilliseconds,
          maximumDelayMilliseconds: config.canonicalClientOrderCapture.retryMaximumDelayMilliseconds
        }
      }),
      webhookArtifacts: createClaimedWebhookArtifactResolver({
        artifactRegistry,
        privateObjectStorage: privateStorage
      }),
      canonicalPayments: createArcPayCanonicalPaymentReader(config.arcPay),
      correlations: createDrizzleCapturedClientOrderWebhookCorrelationPort(
        postgresRuntime.database
      ),
      policies: createDrizzleFinanceOperationResourcePolicyReader(postgresRuntime.database),
      evidence: createCanonicalClientOrderChargebackEvidenceSealer({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        retention: config.financeProviderDispatch.canonicalReadArtifactRetention
      }),
      application: createDrizzleOnlineWalletChargebackCaseUnitOfWork({
        database: postgresRuntime.database,
        workerId: `${canonicalCaptureWorkerId}:chargeback`
      }),
      processorVersion: 1
    });
    startCanonicalClientOrderChargebackInterval({
      processor: canonicalClientOrderChargeback,
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.kind === "committed") {
          logger.error("canonical client-order chargeback provisional loss recorded", result);
        }
      },
      onError: (error) =>
        logger.error("canonical client-order chargeback tick failed", {
          error: serializeError(error)
        })
    });
    const dispatcher = createArcPayOperationDispatcher({
      checkout: createHostedCheckoutSessionDispatcher({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        checkoutClient: createArcPayCheckoutSessionClient(config.arcPay),
        sessionResult: createDrizzleClientCheckoutSessionResultUnitOfWork(postgresRuntime.database),
        transportUnknown: createDrizzleClientCheckoutProviderTransportUnknownUnitOfWork(
          postgresRuntime.database
        ),
        responseArtifactRetention: config.financeProviderDispatch.responseArtifactRetention
      }),
      cardSetup: createCardSetupDispatcher({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        cardSetupClient: createArcPayCardSetupClient(config.arcPay),
        providerResult: createDrizzleProviderOperationResultApplicationUnitOfWork({
          database: postgresRuntime.database
        }),
        setupResult: createDrizzleSavedCardSetupResultUnitOfWork({
          database: postgresRuntime.database
        }),
        transportUnknown: createDrizzleProviderOperationTransportUnknownUnitOfWork(
          postgresRuntime.database
        ),
        responseArtifactRetention: config.financeProviderDispatch.responseArtifactRetention
      }),
      cardSetupExecute: createCardSetupExecuteDispatcher({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        transientSecretVault,
        cardSetupClient: createArcPayCardSetupClient(config.arcPay),
        customerAction: createDrizzleSavedCardSetupCustomerActionUnitOfWork({
          database: postgresRuntime.database
        }),
        failure: createDrizzleSavedCardSetupTerminalFailureUnitOfWork({
          database: postgresRuntime.database
        }),
        transportUnknown: createDrizzleProviderOperationTransportUnknownUnitOfWork(
          postgresRuntime.database
        ),
        responseArtifactRetention: config.financeProviderDispatch.responseArtifactRetention
      }),
      cardSetupThreeDsMethod: createCardSetupThreeDsMethodDispatcher({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        transientSecretVault,
        cardSetupClient: createArcPayCardSetupClient(config.arcPay),
        customerAction: createDrizzleSavedCardSetupCustomerActionUnitOfWork({
          database: postgresRuntime.database
        }),
        failure: createDrizzleSavedCardSetupTerminalFailureUnitOfWork({
          database: postgresRuntime.database
        }),
        transportUnknown: createDrizzleProviderOperationTransportUnknownUnitOfWork(
          postgresRuntime.database
        ),
        responseArtifactRetention: config.financeProviderDispatch.responseArtifactRetention
      }),
      savedCardCharge: createSavedCardChargeDispatcher({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        credentialVault: restrictedCredentialVault,
        savedCardClient: createArcPaySavedCardChargeClient(config.arcPay),
        providerResult: createDrizzleProviderOperationResultApplicationUnitOfWork({
          database: postgresRuntime.database
        }),
        transportUnknown: createDrizzleProviderOperationTransportUnknownUnitOfWork(
          postgresRuntime.database
        ),
        responseArtifactRetention: config.financeProviderDispatch.responseArtifactRetention
      }),
      savedCardChargeThreeDsMethod: createSavedCardChargeThreeDsMethodDispatcher({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        transientSecretVault,
        methodClient: createArcPayCardSetupClient(config.arcPay),
        customerAction: createDrizzlePlatformTariffInvoiceCustomerActionUnitOfWork({
          database: postgresRuntime.database
        }),
        providerResult: createDrizzleProviderOperationResultApplicationUnitOfWork({
          database: postgresRuntime.database
        }),
        transportUnknown: createDrizzleProviderOperationTransportUnknownUnitOfWork(
          postgresRuntime.database
        ),
        responseArtifactRetention: config.financeProviderDispatch.responseArtifactRetention
      }),
      refund: createRefundDispatcher({
        privateObjectStorage: privateStorage,
        artifactRegistry,
        refundClient: createArcPayRefundClient(config.arcPay),
        providerResult: createDrizzleProviderOperationResultApplicationUnitOfWork({
          database: postgresRuntime.database
        }),
        transportUnknown: createDrizzleProviderOperationTransportUnknownUnitOfWork(
          postgresRuntime.database
        ),
        responseArtifactRetention: config.financeProviderDispatch.responseArtifactRetention
      })
    });
    startPlatformTariffInvoiceChargePreparationInterval({
      processor: createPlatformTariffInvoiceChargePreparationProcessor({
        store: createDrizzleOutboxRelayStore(postgresRuntime.database),
        preparer: createPlatformTariffInvoiceChargePreparer({
          preparations: createDrizzlePlatformTariffInvoiceChargePreparationReader(
            postgresRuntime.database
          ),
          tariffs: createDrizzlePlatformTariffAuthorityStore({
            database: postgresRuntime.database
          }),
          commandFactory: createPlatformTariffInvoiceChargeCommandFactory({
            providerAccounts: createDrizzleActiveProviderAccountReader(postgresRuntime.database),
            fiscalProfiles: createDrizzleFiscalProfileReader(postgresRuntime.database),
            buyerContacts: createDrizzleVerifiedFiscalBuyerContactReader(postgresRuntime.database),
            operationPolicies: createDrizzleFinanceOperationResourcePolicyReader(
              postgresRuntime.database
            )
          }),
          preparation: createDrizzlePlatformTariffInvoiceChargePreparationUnitOfWork({
            database: postgresRuntime.database
          }),
          privateObjectStorage: privateStorage,
          requestArtifactRetention: config.financeProviderDispatch.requestArtifactRetention,
          idempotencyRetentionMs: 72 * 60 * 60 * 1_000,
          now: () => new Date()
        }),
        batchSize: config.financeProviderDispatch.batchSize,
        publishingLockTimeoutMs: config.financeProviderDispatch.publishingLockTimeoutMs
      }),
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.claimed > 0)
          logger.info("platform tariff charge preparation tick completed", result);
      },
      onError: (error) =>
        logger.error("platform tariff charge preparation tick failed", {
          error: serializeError(error)
        })
    });
    startPlatformTariffRenewalInterval({
      processor: createPlatformTariffRenewalProcessor({
        issuer: createDrizzlePlatformTariffRenewalInvoiceIssuer({
          database: postgresRuntime.database
        }),
        batchSize: config.financeProviderDispatch.batchSize
      }),
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.issued > 0 || result.skipped > 0)
          logger.info("platform tariff renewal tick completed", result);
      },
      onError: (error) =>
        logger.error("platform tariff renewal tick failed", { error: serializeError(error) })
    });
    startSavedCardSetupPreparationInterval({
      processor: createSavedCardSetupPreparationProcessor({
        store: createDrizzleOutboxRelayStore(postgresRuntime.database),
        preparer: createSavedCardSetupPreparer({
          sessions: createDrizzleSavedCardSetupSessionReader(postgresRuntime.database),
          policyReader: createDrizzleFinanceOperationResourcePolicyReader(postgresRuntime.database),
          preparation: createDrizzleSavedCardSetupPreparationUnitOfWork({
            database: postgresRuntime.database
          }),
          privateObjectStorage: privateStorage,
          requestArtifactRetention: config.financeProviderDispatch.requestArtifactRetention,
          returnOrigin: config.financeProviderDispatch.astrologerBillingReturnOrigin
        }),
        batchSize: config.financeProviderDispatch.batchSize,
        publishingLockTimeoutMs: config.financeProviderDispatch.publishingLockTimeoutMs
      }),
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.prepared > 0 || result.requeued > 0)
          logger.info("saved-card setup preparation tick completed", result);
      },
      onError: (error) =>
        logger.error("saved-card setup preparation tick failed", { error: serializeError(error) })
    });
    startProviderOperationDispatchInterval({
      processor: createProviderOperationDispatchProcessor({
        store: createDrizzleOutboxRelayStore(postgresRuntime.database),
        reader: createDrizzleProviderOperationDispatchReader(postgresRuntime.database),
        dispatcher,
        batchSize: config.financeProviderDispatch.batchSize,
        publishingLockTimeoutMs: config.financeProviderDispatch.publishingLockTimeoutMs
      }),
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.dispatched > 0 || result.requeued > 0) {
          logger.info("finance provider dispatch tick completed", result);
        }
      },
      onError: (error) => {
        logger.error("finance provider dispatch tick failed", { error: serializeError(error) });
      }
    });
    startSavedCardSetupTerminalReconciliationInterval({
      processor: createSavedCardSetupTerminalReconciliationProcessor({
        reader: createDrizzleSavedCardSetupTerminalReconciliationReader(postgresRuntime.database),
        reconciler: createSavedCardSetupTerminalReconciler({
          canonicalReader: createArcPayCanonicalPaymentReader(config.arcPay),
          privateObjectStorage: privateStorage,
          artifactRegistry,
          providerResult: createDrizzleProviderOperationResultApplicationUnitOfWork({
            database: postgresRuntime.database
          }),
          credentialVault: restrictedCredentialVault,
          credentialActivation: createDrizzleSavedCardCredentialActivationUnitOfWork({
            database: postgresRuntime.database
          }),
          tariffActivation: createDrizzlePlatformTariffCredentialActivationUnitOfWork({
            database: postgresRuntime.database
          }),
          responseArtifactRetention: config.financeProviderDispatch.canonicalReadArtifactRetention
        }),
        batchSize: config.financeProviderDispatch.batchSize
      }),
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.scanned > 0)
          logger.info("saved-card setup terminal reconciliation tick completed", result);
      },
      onError: (error) =>
        logger.error("saved-card setup terminal reconciliation tick failed", {
          error: serializeError(error)
        })
    });
    startPlatformTariffInvoiceChargeTerminalReconciliationInterval({
      processor: createPlatformTariffInvoiceChargeTerminalReconciliationProcessor({
        reader: createDrizzlePlatformTariffInvoiceChargeTerminalReconciliationReader(
          postgresRuntime.database
        ),
        reconciler: createPlatformTariffInvoiceChargeTerminalReconciler({
          canonicalReader: createArcPayCanonicalPaymentReader(config.arcPay),
          privateObjectStorage: privateStorage,
          artifactRegistry,
          capture: createDrizzlePlatformTariffInvoiceCanonicalCaptureUnitOfWork({
            database: postgresRuntime.database
          }),
          failure: createDrizzlePlatformTariffInvoiceCanonicalFailureUnitOfWork({
            database: postgresRuntime.database
          }),
          customerAction: createDrizzlePlatformTariffInvoiceCustomerActionUnitOfWork({
            database: postgresRuntime.database
          }),
          responseArtifactRetention: config.financeProviderDispatch.canonicalReadArtifactRetention
        }),
        batchSize: config.financeProviderDispatch.batchSize
      }),
      intervalMs: config.financeProviderDispatch.intervalMs,
      onResult: (result) => {
        if (result.scanned > 0)
          logger.info("platform tariff charge terminal reconciliation tick completed", result);
      },
      onError: (error) =>
        logger.error("platform tariff charge terminal reconciliation tick failed", {
          error: serializeError(error)
        })
    });
    startSettlementLedgerIngestionInterval({
      processor: createSettlementLedgerIngestionProcessor({
        providerAccounts: createDrizzleActiveProviderAccountReader(postgresRuntime.database),
        operationPolicies: createDrizzleFinanceOperationResourcePolicyReader(
          postgresRuntime.database
        ),
        cursors: createDrizzleSettlementCursorWorkUnitOfWork({
          database: postgresRuntime.database
        }),
        leases: createDrizzleSettlementCursorLeaseUnitOfWork({
          database: postgresRuntime.database
        }),
        provider: createArcPayExactSettlementLedgerClient({
          ...config.arcPay,
          privateObjectStorage: privateStorage,
          artifactRegistry,
          retention: config.financeProviderDispatch.settlementPageArtifactRetention
        }),
        ingestion: createDrizzleSettlementBatchIngestionUnitOfWork({
          database: postgresRuntime.database
        }),
        workerId: `${canonicalCaptureWorkerId}:settlement-ledger`,
        initialBackfillStart: () =>
          new Date(Date.now() - config.reconciliation.lookbackMs).toISOString(),
        overlapSeconds: config.settlementIngestion.cursorOverlapSeconds,
        leaseDurationSeconds: config.settlementIngestion.leaseDurationSeconds,
        maximumPageCount: config.settlementIngestion.maximumPageCount
      }),
      intervalMs: config.reconciliation.intervalMs,
      onResult: (result) => {
        if (result.kind === "ingested" || result.kind === "not_configured") {
          logger.info("ArcPay settlement ledger ingestion tick completed", result);
        }
      },
      onError: (error) =>
        logger.error("ArcPay settlement ledger ingestion tick failed", {
          error: serializeError(error)
        })
    });
    const settlementPaymentReconciliation = createDrizzleSettlementPaymentReconciliationAdapters({
      database: postgresRuntime.database
    });
    startSettlementPaymentReconciliationInterval({
      processor: createSettlementPaymentReconciliationProcessor({
        providerAccounts: createDrizzleActiveProviderAccountReader(postgresRuntime.database),
        operationPolicies: createDrizzleFinanceOperationResourcePolicyReader(
          postgresRuntime.database
        ),
        candidates: settlementPaymentReconciliation.candidates,
        settlementSeen: settlementPaymentReconciliation.settlementSeen,
        createMatcher(providerAccount) {
          return createDrizzleSettlementPaymentMatchUnitOfWork({
            database: postgresRuntime.database,
            correlationRules: [
              {
                rule: createArcPayAvailablePaymentCreditRule(providerAccount),
                referenceType: "payment",
                direction: "credit",
                entryType: "payment_credit",
                settlementStatus: "available",
                amountRelation: "same_minor"
              }
            ]
          });
        },
        providerMatched: settlementPaymentReconciliation.providerMatched,
        quarantine: settlementPaymentReconciliation.quarantine
      }),
      intervalMs: config.reconciliation.intervalMs,
      onResult: (result) => {
        if (result.kind === "reconciled" && result.inspected > 0) {
          logger.info("ArcPay settlement payment reconciliation tick completed", result);
        }
      },
      onError: (error) =>
        logger.error("ArcPay settlement payment reconciliation tick failed", {
          error: serializeError(error)
        })
    });
    startSettlementLedgerIngestionInterval({
      processor: createSettlementIngestionProcessor({
        stream: "settlement_payouts",
        providerAccounts: createDrizzleActiveProviderAccountReader(postgresRuntime.database),
        operationPolicies: createDrizzleFinanceOperationResourcePolicyReader(
          postgresRuntime.database
        ),
        cursors: createDrizzleSettlementCursorWorkUnitOfWork({
          database: postgresRuntime.database
        }),
        leases: createDrizzleSettlementCursorLeaseUnitOfWork({
          database: postgresRuntime.database
        }),
        provider: createArcPayExactSettlementClient({
          stream: "settlement_payouts",
          ...config.arcPay,
          privateObjectStorage: privateStorage,
          artifactRegistry,
          retention: config.financeProviderDispatch.settlementPageArtifactRetention
        }),
        ingestion: createDrizzleSettlementBatchIngestionUnitOfWork({
          database: postgresRuntime.database
        }),
        workerId: `${canonicalCaptureWorkerId}:settlement-payouts`,
        initialBackfillStart: () =>
          new Date(Date.now() - config.reconciliation.lookbackMs).toISOString(),
        overlapSeconds: config.settlementIngestion.cursorOverlapSeconds,
        leaseDurationSeconds: config.settlementIngestion.leaseDurationSeconds,
        maximumPageCount: config.settlementIngestion.maximumPageCount
      }),
      intervalMs: config.reconciliation.intervalMs,
      onResult: (result) => {
        if (result.kind === "ingested" || result.kind === "not_configured") {
          logger.info("ArcPay settlement payout ingestion tick completed", result);
        }
      },
      onError: (error) =>
        logger.error("ArcPay settlement payout ingestion tick failed", {
          error: serializeError(error)
        })
    });
    startSettlementBalanceObservationInterval({
      processor: createSettlementBalanceObservationProcessor({
        client: createArcPaySettlementBalanceClient(config.arcPay),
        providerAccounts: createDrizzleActiveProviderAccountReader(postgresRuntime.database),
        evidence: createSettlementBalanceEvidenceSealer({
          privateObjectStorage: privateStorage,
          artifactRegistry,
          retention: config.financeProviderDispatch.canonicalReadArtifactRetention
        })
      }),
      intervalMs: config.reconciliation.intervalMs,
      onResult: (result) => {
        if (result.kind === "observed") logger.info("ArcPay settlement balance observed", result);
      },
      onError: (error) =>
        logger.error("ArcPay settlement balance observation failed", {
          error: serializeError(error)
        })
    });
  }

  const webhookServer = createPaymentWebhookServer({
    handler: createPaymentWebhookHandler({
      webhookSecret: config.arcPay.webhookSecret,
      timestampToleranceSeconds: config.arcPay.timestampToleranceSeconds,
      processor,
      financeIngress,
      onSignatureRejected: ({ headerNames }) =>
        logger.warn("ArcPay webhook signature rejected", { headerNames })
    })
  });

  await listenReadinessServer({
    server: readinessServer,
    host: config.healthHost,
    port: config.healthPort
  });
  await listenServer(webhookServer, config.webhookHost, config.webhookPort);
  startOnlineWalletHoldReleaseInterval({
    processor: createOnlineWalletHoldReleaseProcessor({
      releases: createDrizzleOnlineWalletHoldReleaseUnitOfWork({
        database: postgresRuntime.database
      }),
      limit: config.onlineWalletHoldRelease.batchSize
    }),
    intervalMs: config.onlineWalletHoldRelease.intervalMs,
    onResult: (result) => {
      if (result.released > 0 || result.replayed > 0) {
        logger.info("online wallet holds release tick completed", result);
      }
    },
    onError: (error) => {
      logger.error("online wallet holds release tick failed", { error: serializeError(error) });
    }
  });
  logger.info("payment worker ready", {
    ...createReadinessResponse(service),
    healthHost: config.healthHost,
    healthPort: config.healthPort,
    webhookHost: config.webhookHost,
    webhookPort: config.webhookPort,
    onlineWalletHoldReleaseIntervalMs: config.onlineWalletHoldRelease.intervalMs,
    onlineWalletHoldReleaseBatchSize: config.onlineWalletHoldRelease.batchSize,
    reconciliationIntervalMs: config.financeProviderDispatch ? config.reconciliation.intervalMs : 0,
    reconciliationLookbackMs: config.reconciliation.lookbackMs,
    financeProviderDispatchIntervalMs: config.financeProviderDispatch?.intervalMs ?? 0,
    canonicalClientOrderCaptureIntervalMs: config.financeProviderDispatch?.intervalMs ?? 0
  });
}

function listenServer(
  server: import("node:http").Server,
  host: string,
  port: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function createFinancePrivateObjectStorage(
  config: NonNullable<
    ReturnType<typeof createPaymentWorkerRuntimeConfig>["financeProviderDispatch"]
  >["artifactStorage"]
): FinancePrivateObjectStorageRuntime {
  return config.kind === "filesystem"
    ? createFilesystemFinancePrivateObjectStorage({ rootDirectory: config.rootDirectory })
    : createS3FinancePrivateObjectStorage(config);
}

startPaymentWorker().catch((error: unknown) => {
  logger.error("payment worker readiness server failed", { error: serializeError(error) });
  process.exit(1);
});
