import {
  createClientOrderCapturePurposeDispatchPayload,
  type ClientSubscriptionCaptureAppliedEvent,
  type FinanceClientOrderCaptureDispatchReceipt,
  type FinanceClientOrderCapturePurposeDispatchPayload
} from "../client-order-capture-purpose-dispatch";

type CompletedDispatch = Readonly<{
  receipt: FinanceClientOrderCaptureDispatchReceipt;
  sourceEvent: ClientSubscriptionCaptureAppliedEvent;
}>;

export type FinanceClientOrderCapturePurposeDispatchExecution =
  | (CompletedDispatch & Readonly<{ outcome: "dispatched" }>)
  | (CompletedDispatch & Readonly<{ outcome: "replayed" }>)
  | Readonly<{ outcome: "capture_not_found" }>
  | Readonly<{ outcome: "not_client_subscription" }>
  | Readonly<{ outcome: "authority_conflict" }>
  | Readonly<{ outcome: "source_event_conflict" }>
  | Readonly<{ outcome: "evidence_conflict" }>;

/**
 * The implementation first checks an immutable dispatch receipt, then locks and rehydrates the
 * capture application, order purpose, subscription contract and subscription head. On a first
 * dispatch it allocates every downstream ID once and atomically stores the receipt and IDs-only
 * source event. Ordinary booking/one-off orders return `not_client_subscription` unchanged.
 */
export type FinanceClientOrderCapturePurposeDispatchUnitOfWork = Readonly<{
  rehydrateAndDispatchClientOrderCapture(
    input: FinanceClientOrderCapturePurposeDispatchPayload
  ): Promise<FinanceClientOrderCapturePurposeDispatchExecution>;
}>;

export async function dispatchFinanceClientOrderCapturePurposeEvent(
  unitOfWork: FinanceClientOrderCapturePurposeDispatchUnitOfWork,
  input: unknown
): Promise<FinanceClientOrderCapturePurposeDispatchExecution> {
  return await unitOfWork.rehydrateAndDispatchClientOrderCapture(
    createClientOrderCapturePurposeDispatchPayload(input)
  );
}
