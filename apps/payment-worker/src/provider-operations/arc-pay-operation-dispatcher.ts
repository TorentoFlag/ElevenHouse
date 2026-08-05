import type { ProviderOperationDispatcher } from "./provider-operation-dispatch-relay";

export class ArcPayOperationDispatcherError extends Error {
  readonly code = "ARC_PAY_OPERATION_DISPATCHER_ERROR" as const;

  constructor(readonly reason: "unsupported_operation") {
    super("No safe ArcPay dispatcher is configured for this operation");
  }
}

/**
 * Explicit operation router. It makes incomplete provider capabilities observable instead of
 * treating a new operation kind as HPP or silently dropping it.
 */
export function createArcPayOperationDispatcher(
  input: Readonly<{
    checkout: ProviderOperationDispatcher;
    cardSetup: ProviderOperationDispatcher;
    cardSetupExecute: ProviderOperationDispatcher;
    cardSetupThreeDsMethod: ProviderOperationDispatcher;
    savedCardCharge: ProviderOperationDispatcher;
    savedCardChargeThreeDsMethod: ProviderOperationDispatcher;
    refund: ProviderOperationDispatcher;
  }>
): ProviderOperationDispatcher {
  return Object.freeze({
    async dispatch(workItem) {
      if (workItem.operationKind === "checkout_session_create") return input.checkout.dispatch(workItem);
      if (workItem.operationKind === "card_setup") return input.cardSetup.dispatch(workItem);
      if (workItem.operationKind === "card_setup_execute") return input.cardSetupExecute.dispatch(workItem);
      if (workItem.operationKind === "card_setup_3ds_method_complete") return input.cardSetupThreeDsMethod.dispatch(workItem);
      if (workItem.operationKind === "saved_card_charge") return input.savedCardCharge.dispatch(workItem);
      if (workItem.operationKind === "saved_card_charge_3ds_method_complete") return input.savedCardChargeThreeDsMethod.dispatch(workItem);
      if (workItem.operationKind === "refund") return input.refund.dispatch(workItem);
      throw new ArcPayOperationDispatcherError("unsupported_operation");
    }
  });
}
