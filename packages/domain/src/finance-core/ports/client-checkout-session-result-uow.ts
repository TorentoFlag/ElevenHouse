import type { ClientCheckoutPreparation } from "../client-checkout-preparation";
import type { FinanceDigest } from "./finance-port-types";
import type {
  ApplyVerifiedProviderResultCommand,
  ProviderOperationResultCommitReceipt
} from "./provider-operation-result-application-uow";

/**
 * Commits the non-monetary HPP-session result and the client-visible action together. This is not
 * a payment capture boundary: provider payment id, amount and currency remain null here.
 */
export type CompleteClientCheckoutSessionCommand = Readonly<{
  providerResult: ApplyVerifiedProviderResultCommand;
  providerCheckoutId: string;
  responseArtifactId: string;
  responseArtifactDigest: FinanceDigest;
}>;

export type ClientCheckoutSessionResultCommitReceipt = Readonly<{
  kind: "client_checkout_session_result_commit_receipt";
  providerResult: ProviderOperationResultCommitReceipt;
  checkoutPreparation: ClientCheckoutPreparation;
}>;

export type ClientCheckoutSessionResultUnitOfWork = Readonly<{
  completeClientCheckoutSession(
    command: CompleteClientCheckoutSessionCommand
  ): Promise<ClientCheckoutSessionResultCommitReceipt>;
}>;
