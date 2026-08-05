/**
 * Records an indeterminate transport result for any persisted provider operation.
 *
 * The command does not assert a provider or monetary outcome. It fences the immutable
 * operation head at `provider_unknown`, retains the original idempotency key and requires a
 * canonical provider read (or an idempotent retry inside the provider retention window) before
 * the operation can be resolved.
 */
export type MarkProviderOperationTransportUnknownCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
}>;

export type ProviderOperationTransportUnknownCommitReceipt = Readonly<{
  kind: "provider_operation_transport_unknown_commit_receipt";
  providerOperationIntentId: string;
  providerOperationIntentVersion: number;
  economicPaymentIntentId: string;
  correlatedEconomicPaymentVersion: number;
  operationKind: "checkout_session_create" | "card_setup" | "card_setup_execute" | "saved_card_charge" | "refund" | "void";
}>;

export type ProviderOperationTransportUnknownUnitOfWork = Readonly<{
  markProviderOperationTransportUnknown(
    command: MarkProviderOperationTransportUnknownCommand
  ): Promise<ProviderOperationTransportUnknownCommitReceipt>;
}>;
