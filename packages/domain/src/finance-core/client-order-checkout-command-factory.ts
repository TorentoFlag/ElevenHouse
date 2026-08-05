import type { FinanceOrder } from "../orders";
import {
  createProviderDispatchEnvelope,
  type ArcPayPaymentMethod,
  type ProviderDispatchEnvelope
} from "./provider-dispatch-envelope";
import {
  FiscalChargePreparationError,
  prepareFiscalChargeSnapshot
} from "./fiscal-charge-preparation";
import {
  resolveFinanceOperationEnvelope,
  type FinanceOperationResourcePolicyVersion
} from "./finance-operation-resource-policy";
import type { ActiveProviderAccountReaderPort } from "./ports/active-provider-account-reader";
import type { FiscalProfileReaderPort } from "./ports/fiscal-profile-reader";
import type { FinanceOperationResourcePolicyReader } from "./ports/finance-operation-resource-policy-reader";
import type {
  ClientOrderCheckoutCaptureAuthority,
  ClientOrderCheckoutCaptureAuthorityReader
} from "./ports/client-order-checkout-capture-authority-reader";
import type { VerifiedFiscalBuyerContactReaderPort } from "./ports/verified-fiscal-buyer-contact-reader";
import type { FiscalBuyerContact } from "./fiscal-profile";
import type {
  FinanceProviderAccountIdentity,
  ResolvedFinanceOperationEnvelope
} from "./ports/finance-port-types";

export class ClientOrderCheckoutCommandFactoryError extends Error {
  readonly code = "FINANCE_CLIENT_ORDER_CHECKOUT_COMMAND_FACTORY_ERROR" as const;

  constructor(
    readonly reason:
      | "order_owner_mismatch"
      | "order_not_payable"
      | "buyer_contact_unverified"
      | "provider_account_missing"
      | "operation_policy_missing"
      | "capture_authority_missing"
      | "fiscal_profile_missing"
      | "invalid_preparation"
  ) {
    super("Client checkout cannot be prepared from authoritative finance facts");
    this.name = "ClientOrderCheckoutCommandFactoryError";
  }
}

export type ClientOrderCheckoutCommandFactory = Readonly<{
  prepare(
    input: Readonly<{
      order: FinanceOrder;
      clientUserId: string;
      environment: "sandbox" | "live";
      buyerContact: FiscalBuyerContact;
      paymentMethods: readonly ArcPayPaymentMethod[];
      successUrl: string;
      failureUrl: string;
      cancelUrl: string;
    }>
  ): Promise<
    Readonly<{
      providerAccount: FinanceProviderAccountIdentity;
      captureAuthority: ClientOrderCheckoutCaptureAuthority;
      operationEnvelope: ResolvedFinanceOperationEnvelope;
      dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "checkout_session_create" }>;
    }>
  >;
}>;

/**
 * Makes all facts that authorize a hosted checkout explicit and server-resolved. The caller still
 * owns request-artifact sealing and the transactional UOW, but cannot manufacture a fiscal line,
 * provider account binding, or resource envelope.
 */
export function createClientOrderCheckoutCommandFactory(
  dependencies: Readonly<{
    providerAccounts: ActiveProviderAccountReaderPort;
    fiscalProfiles: FiscalProfileReaderPort;
    buyerContacts: VerifiedFiscalBuyerContactReaderPort;
    operationPolicies: FinanceOperationResourcePolicyReader;
    captureAuthorities: ClientOrderCheckoutCaptureAuthorityReader;
  }>
): ClientOrderCheckoutCommandFactory {
  return Object.freeze({
    async prepare(input) {
      if (input.order.clientUserId !== input.clientUserId) fail("order_owner_mismatch");
      if (input.order.status !== "pending_payment") fail("order_not_payable");
      const [providerAccount, verifiedContact, policy, captureAuthority] = await Promise.all([
        dependencies.providerAccounts.findActiveProviderAccount({
          provider: "arc_pay",
          environment: input.environment
        }),
        dependencies.buyerContacts.findVerifiedFiscalBuyerContact({
          clientUserId: input.clientUserId,
          candidate: input.buyerContact
        }),
        dependencies.operationPolicies.findPublishedForOperation({
          operationKind: "client_checkout_prepare"
        }),
        dependencies.captureAuthorities.findForCheckout({ orderId: input.order.id })
      ]);
      if (!providerAccount) fail("provider_account_missing");
      if (!verifiedContact) fail("buyer_contact_unverified");
      if (!policy) fail("operation_policy_missing");
      if (!captureAuthority) fail("capture_authority_missing");
      const operationEnvelope = resolvePolicy(policy);
      let fiscalSnapshot;
      try {
        fiscalSnapshot = await prepareFiscalChargeSnapshot({
          reader: dependencies.fiscalProfiles,
          transactionCategory: "client_purchase",
          buyerContact: verifiedContact,
          lines: [
            {
              sourceLineId: input.order.id,
              name: input.order.productTitleSnapshot,
              amountMinor: input.order.grossAmount.amountMinor
            }
          ]
        });
      } catch (error) {
        if (error instanceof FiscalChargePreparationError) fail("fiscal_profile_missing");
        throw error;
      }
      try {
        const dispatchEnvelope = createProviderDispatchEnvelope({
          kind: "checkout_session_create",
          amount: input.order.grossAmount,
          captureMode: "one_stage",
          paymentMethods: input.paymentMethods,
          successUrl: input.successUrl,
          failureUrl: input.failureUrl,
          cancelUrl: input.cancelUrl,
          // ArcPay exposes external_id on the later canonical payment record. It must name
          // the durable economic source, not a transient checkout/browser command.
          externalId: input.order.id,
          orderId: input.order.id,
          fiscalSnapshot
        });
        if (dispatchEnvelope.kind !== "checkout_session_create") fail("invalid_preparation");
        return Object.freeze({
          providerAccount,
          captureAuthority,
          operationEnvelope,
          dispatchEnvelope
        });
      } catch {
        fail("invalid_preparation");
      }
    }
  });
}

function resolvePolicy(
  policy: FinanceOperationResourcePolicyVersion
): ResolvedFinanceOperationEnvelope {
  try {
    return resolveFinanceOperationEnvelope({ policy, operationKind: "client_checkout_prepare" });
  } catch {
    fail("operation_policy_missing");
  }
}

function fail(reason: ClientOrderCheckoutCommandFactoryError["reason"]): never {
  throw new ClientOrderCheckoutCommandFactoryError(reason);
}
