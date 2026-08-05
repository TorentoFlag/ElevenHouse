import type { ProviderDispatchEnvelope } from "../provider-dispatch-envelope";
import type { ClientCheckoutPreparation } from "../client-checkout-preparation";
import type {
  FinanceProviderAccountIdentity,
  RawProviderArtifactRef,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { PersistedProviderDispatchReceipt } from "./provider-operation-intent-creation-uow";
import type { ClientOrderCheckoutCaptureAuthority } from "./client-order-checkout-capture-authority-reader";

/**
 * The one request-side commit boundary for a client Hosted Checkout attempt.
 *
 * It deliberately accepts no amount or currency: those facts are read from the locked order,
 * then copied into the internal economic intent before a provider operation can be queued.
 */
export type PrepareClientOrderCheckoutCommand = Readonly<{
  checkoutPreparationId: string;
  checkoutAuthorizationId: string;
  paymentCommandId: string;
  orderId: string;
  clientUserId: string;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  providerOperationIntentId: string;
  providerAccount: FinanceProviderAccountIdentity;
  dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "checkout_session_create" }>;
  dispatchArtifact: RawProviderArtifactRef;
  idempotencyKey: string;
  idempotencyRetentionDeadline: string;
  captureAuthority: ClientOrderCheckoutCaptureAuthority;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type ClientOrderCheckoutPreparationReceipt = Readonly<{
  kind: "client_order_checkout_preparation_receipt";
  checkoutPreparation: ClientCheckoutPreparation;
  providerDispatch: PersistedProviderDispatchReceipt;
}>;

export type ClientOrderCheckoutPreparationUnitOfWork = Readonly<{
  prepareClientOrderCheckout(
    command: PrepareClientOrderCheckoutCommand
  ): Promise<ClientOrderCheckoutPreparationReceipt>;
}>;
