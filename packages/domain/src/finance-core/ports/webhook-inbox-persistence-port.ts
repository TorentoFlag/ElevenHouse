import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type {
  FinanceDigest,
  FinanceProviderAccountIdentity,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type {
  VerifiedWebhookIngressEvidence,
  VerifiedWebhookSemanticEvidence
} from "./trusted-finance-evidence";

declare const storedWebhookReceiptBrand: unique symbol;
declare const webhookSemanticCommitReceiptBrand: unique symbol;

export type StoreWebhookBeforeAcknowledgementCommand = Readonly<{
  ingressEvidence: VerifiedWebhookIngressEvidence;
  expectedTransportIdentityAbsent: true;
}>;

export type StoredWebhookReceipt = Readonly<{
  kind: "stored_webhook_receipt";
  inboxItemId: string;
  inboxVersion: number;
  provider: "arc_pay";
  receivingEnvironment: "sandbox" | "live";
  webhookId: string;
  providerAccount: FinanceProviderAccountIdentity;
  dedupeResult: "stored_new" | "transport_replay";
  persistenceTransactionBoundaryRef: string;
  storedAt: string;
  [storedWebhookReceiptBrand]: true;
}>;

export type WebhookIngressStorageUnitOfWork = Readonly<{
  storeBeforeAcknowledgement(
    command: StoreWebhookBeforeAcknowledgementCommand
  ): Promise<StoredWebhookReceipt>;
}>;

/** Canonical provider repair reads happen after inbox storage and outside its DB transaction. */
export type WebhookCanonicalReadPort = Readonly<{
  transactionBoundary: "outside_database_transaction";
  fetchVerifiedSemanticFact(
    input: Readonly<{
      storedWebhook: StoredWebhookReceipt;
      providerAccount: FinanceProviderAccountIdentity;
      expectedEconomicPaymentIntentId: string;
      operationEnvelope: ResolvedFinanceOperationEnvelope;
    }>
  ): Promise<VerifiedWebhookSemanticEvidence>;
}>;

export type ApplyVerifiedWebhookSemanticFactCommand = Readonly<{
  inboxItemId: string;
  expectedInboxVersion: number;
  expectedCheckpointSequence: number;
  processorVersion: number;
  semanticEvidence: VerifiedWebhookSemanticEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type WebhookSemanticCommitReceipt = Readonly<{
  kind: "webhook_semantic_commit_receipt";
  receiptId: string;
  inboxItemId: string;
  inboxVersion: number;
  committedCheckpointSequence: number;
  semanticFactId: string;
  semanticSourceKind: "payment_transition" | "refund" | "chargeback" | "settlement_entry";
  semanticSourceId: string;
  providerAccount: FinanceProviderAccountIdentity;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string | null;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  providerPaymentId: string | null;
  amountMinor: string | null;
  currency: "RUB" | null;
  canonicalFactDigest: FinanceDigest;
  evidenceArtifactId: string;
  evidenceArtifactDigest: FinanceDigest;
  observedAt: string;
  businessEffect: "applied_once" | "semantic_replay" | "quarantined_no_effect";
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt | null;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [webhookSemanticCommitReceiptBrand]: true;
}>;

/**
 * Inbox checkpoint, semantic dedupe, aggregate mutation, optional journal mutation and outbox
 * are committed by this one method after any canonical provider read has completed.
 */
export type WebhookInboxProcessingUnitOfWork = Readonly<{
  applyVerifiedSemanticFact(
    command: ApplyVerifiedWebhookSemanticFactCommand
  ): Promise<WebhookSemanticCommitReceipt>;
}>;
