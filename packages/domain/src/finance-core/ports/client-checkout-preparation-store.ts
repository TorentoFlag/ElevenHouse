import type { ClientCheckoutPreparation } from "../client-checkout-preparation";
import type { FinanceDigest } from "./finance-port-types";

export type ClientCheckoutPreparationReadPort = Readonly<{
  findClientCheckoutPreparation(
    input: Readonly<{
      checkoutPreparationId: string;
      clientUserId: string;
    }>
  ): Promise<ClientCheckoutPreparation | null>;
}>;

export type PublishClientCheckoutReadyCommand = Readonly<{
  checkoutPreparationId: string;
  providerOperationIntentId: string;
  expectedVersion: number;
  providerCheckoutId: string;
  responseArtifactId: string;
  responseArtifactDigest: FinanceDigest;
}>;

export type MarkClientCheckoutProviderSessionUnknownCommand = Readonly<{
  checkoutPreparationId: string;
  providerOperationIntentId: string;
  expectedVersion: number;
}>;

export type FailClientCheckoutPreparationCommand = Readonly<{
  checkoutPreparationId: string;
  providerOperationIntentId: string;
  expectedVersion: number;
  failureCode: string;
}>;

/** Worker-only optimistic-lock transitions after registered ArcPay response evidence. */
export type ClientCheckoutPreparationWorkerUnitOfWork = Readonly<{
  publishClientCheckoutReady(
    command: PublishClientCheckoutReadyCommand
  ): Promise<ClientCheckoutPreparation>;
  markClientCheckoutProviderSessionUnknown(
    command: MarkClientCheckoutProviderSessionUnknownCommand
  ): Promise<ClientCheckoutPreparation>;
  failClientCheckoutPreparation(
    command: FailClientCheckoutPreparationCommand
  ): Promise<ClientCheckoutPreparation>;
}>;
