import type {
  ProviderDispatchEnvelope,
  RestrictedSavedCardCredentialRef
} from "../provider-dispatch-envelope";
import type { ProviderOperationReplacementAuthority } from "../provider-operation-intent";
import type {
  FinanceCurrency,
  FinanceDigest,
  FinanceProviderAccountIdentity,
  RawProviderArtifactRef,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { VerifiedProviderOperationEvidence } from "./trusted-finance-evidence";

declare const persistedProviderDispatchReceiptBrand: unique symbol;
declare const providerDispatchAuthorizationReceiptBrand: unique symbol;

type ProviderDispatchAuthorizationReceiptBase = Readonly<{
  authorityId: string;
  authorityVersion: string;
  authorityDigest: FinanceDigest;
  sourceId: string;
  [providerDispatchAuthorizationReceiptBrand]: true;
}>;

export type ProviderDispatchAuthorizationReceipt =
  | Readonly<
      ProviderDispatchAuthorizationReceiptBase & {
        kind: "client_order_checkout_authorization";
        orderId: string;
        /** Immutable server-issued checkout snapshot revision, not a browser supplied order field. */
        orderSnapshotVersion: number;
        paymentCommandId: string;
      }
    >
  | Readonly<
      ProviderDispatchAuthorizationReceiptBase & {
        kind: "platform_card_setup_authorization";
        setupSessionId: string;
        setupConsentId: string;
        setupConsentVersion: number;
      }
    >
  | Readonly<
      ProviderDispatchAuthorizationReceiptBase & {
        kind: "platform_invoice_charge_authorization";
        invoiceId: string;
        invoiceVersion: number;
        subscriptionId: string;
        subscriptionVersion: number;
        recurringConsentId: string;
        recurringConsentVersion: number;
        savedCardCredentialId: RestrictedSavedCardCredentialRef["credentialId"];
        savedCardCredentialVersion: RestrictedSavedCardCredentialRef["credentialVersion"];
      }
    >
  | Readonly<
      ProviderDispatchAuthorizationReceiptBase & {
        kind: "platform_invoice_3ds_method_authorization";
        invoiceId: string;
        invoiceVersion: number;
        subscriptionId: string;
        customerActionId: string;
        customerActionResponseDigest: FinanceDigest;
        providerPaymentId: string;
      }
    >
  | Readonly<
      ProviderDispatchAuthorizationReceiptBase & {
        kind: "refund_authorization";
        refundId: string;
        refundVersion: number;
        approvedCumulativeAmountMinor: string;
      }
    >
  | Readonly<
      ProviderDispatchAuthorizationReceiptBase & {
        kind: "void_authorization";
        economicPaymentIntentId: string;
        economicPaymentVersion: number;
        authorizedProviderPaymentId: string;
      }
    >;

type PersistProviderOperationBeforeIoCommandBase = Readonly<{
  providerOperationIntentId: string;
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  expectedProviderOperationSourceVersion: number;
  providerAccount: FinanceProviderAccountIdentity;
  dispatchArtifact: RawProviderArtifactRef;
  replacementAuthority: ProviderOperationReplacementAuthority | null;
  idempotencyKey: string;
  idempotencyRetentionDeadline: string;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type PersistProviderOperationBeforeIoCommand =
  | Readonly<
      PersistProviderOperationBeforeIoCommandBase & {
        operationKind: "checkout_session_create";
        economicPaymentSessionId: string;
        dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "checkout_session_create" }>;
        dispatchAuthorization: Extract<
          ProviderDispatchAuthorizationReceipt,
          { kind: "client_order_checkout_authorization" }
        >;
      }
    >
  | Readonly<
      PersistProviderOperationBeforeIoCommandBase & {
        operationKind: "card_setup";
        economicPaymentSessionId: string;
        dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "card_setup" }>;
        dispatchAuthorization: Extract<
          ProviderDispatchAuthorizationReceipt,
          { kind: "platform_card_setup_authorization" }
        >;
      }
    >
  | Readonly<
      PersistProviderOperationBeforeIoCommandBase & {
        operationKind: "card_setup_execute";
        economicPaymentSessionId: string;
        dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "card_setup"; step: "execute" }>;
        dispatchAuthorization: Extract<
          ProviderDispatchAuthorizationReceipt,
          { kind: "platform_card_setup_authorization" }
        >;
      }
    >
  | Readonly<
      PersistProviderOperationBeforeIoCommandBase & {
        operationKind: "card_setup_3ds_method_complete";
        economicPaymentSessionId: string;
        dispatchEnvelope: Extract<
          ProviderDispatchEnvelope,
          { kind: "card_setup"; step: "complete_3ds_method" }
        >;
        dispatchAuthorization: Extract<
          ProviderDispatchAuthorizationReceipt,
          { kind: "platform_card_setup_authorization" }
        >;
      }
    >
  | Readonly<
      PersistProviderOperationBeforeIoCommandBase & {
        operationKind: "saved_card_charge";
        economicPaymentSessionId: string;
        dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "saved_card_charge" }>;
        /**
         * The UoW rejects the command unless the envelope credential ID/version exactly match
         * these authorization fields via assertSavedCardCredentialAuthorizationBinding.
         */
        dispatchAuthorization: Extract<
          ProviderDispatchAuthorizationReceipt,
          { kind: "platform_invoice_charge_authorization" }
        >;
      }
    >
  | Readonly<
      PersistProviderOperationBeforeIoCommandBase & {
        operationKind: "saved_card_charge_3ds_method_complete";
        economicPaymentSessionId: string;
        dispatchEnvelope: Extract<
          ProviderDispatchEnvelope,
          { kind: "saved_card_charge_3ds_method" }
        >;
        dispatchAuthorization: Extract<
          ProviderDispatchAuthorizationReceipt,
          { kind: "platform_invoice_3ds_method_authorization" }
        >;
      }
    >
  | Readonly<
      PersistProviderOperationBeforeIoCommandBase & {
        operationKind: "refund";
        economicPaymentSessionId: null;
        dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "refund" }>;
        dispatchAuthorization: Extract<
          ProviderDispatchAuthorizationReceipt,
          { kind: "refund_authorization" }
        >;
      }
    >
  | Readonly<
      PersistProviderOperationBeforeIoCommandBase & {
        operationKind: "void";
        economicPaymentSessionId: null;
        dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "void" }>;
        dispatchAuthorization: Extract<
          ProviderDispatchAuthorizationReceipt,
          { kind: "void_authorization" }
        >;
      }
    >;

/** Proves the exact dispatch envelope and economic session were committed before provider I/O. */
export type PersistedProviderDispatchReceipt = Readonly<{
  kind: "persisted_provider_dispatch_receipt";
  providerOperationIntentId: string;
  providerOperationIntentVersion: number;
  economicPaymentIntentId: string;
  economicPaymentVersion: number;
  economicPaymentSessionId: string | null;
  sourceId: string;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  amountMinor: string;
  currency: FinanceCurrency;
  providerAccount: FinanceProviderAccountIdentity;
  canonicalRequestDigest: FinanceDigest;
  dispatchAuthorizationId: string;
  dispatchAuthorizationDigest: FinanceDigest;
  idempotencyKey: string;
  sealedDispatchPayloadRef: string;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [persistedProviderDispatchReceiptBrand]: true;
}>;

export type ProviderOperationIntentCreationUnitOfWork = Readonly<{
  persistBeforeProviderIo(
    command: PersistProviderOperationBeforeIoCommand
  ): Promise<PersistedProviderDispatchReceipt>;
}>;

/**
 * Execute/read methods are not transaction callbacks. They consume a persistence-issued receipt
 * and run only after the operation-intent transaction has committed.
 */
export type ProviderOperationIoPort = Readonly<{
  transactionBoundary: "outside_database_transaction";
  executePersistedOperation(
    dispatch: PersistedProviderDispatchReceipt
  ): Promise<VerifiedProviderOperationEvidence>;
  fetchCanonicalOperationResult(
    input: Readonly<{
      dispatch: PersistedProviderDispatchReceipt;
      providerOperationId: string;
      operationEnvelope: ResolvedFinanceOperationEnvelope;
    }>
  ): Promise<VerifiedProviderOperationEvidence>;
}>;
