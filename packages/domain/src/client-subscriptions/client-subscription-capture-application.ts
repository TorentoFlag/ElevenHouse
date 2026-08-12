import { clientSubscriptionEventSchema } from "@elevenhouse/contracts";

import {
  createFinanceClientSubscriptionCaptureAppliedEvent,
  rehydrateFinanceClientOrderCaptureDispatchReceipt,
  type ClientSubscriptionCaptureAppliedEvent,
  type FinanceClientOrderCaptureDispatchReceipt
} from "../finance-core/client-order-capture-purpose-dispatch";
import { digestFinanceCanonicalValueV1 } from "../finance-core/finance-canonical-digest";
import { applyInitialCapture, applyRenewalCapture } from "./client-subscription-lifecycle";
import {
  applyClientSubscriptionSourceEvent,
  type ClientSubscriptionSourceEventApplicationExecution,
  type ClientSubscriptionSourceEventApplicationUnitOfWork
} from "./ports/client-subscription-source-event-application-unit-of-work";

export type ClientSubscriptionCaptureDispatchExecution =
  | ClientSubscriptionSourceEventApplicationExecution
  | { readonly outcome: "authority_conflict" };

/**
 * Applies only the purpose-specific capture event after rehydrating its immutable finance receipt.
 * The generic economic-payment event never enters this boundary, and the input event is not a
 * lifecycle output: successful transitions emit only activated/renewed and entitlement facts.
 */
export async function applyClientSubscriptionCaptureDispatch(
  unitOfWork: ClientSubscriptionSourceEventApplicationUnitOfWork,
  input: Readonly<{
    sourceEvent: ClientSubscriptionCaptureAppliedEvent;
    dispatchReceipt: FinanceClientOrderCaptureDispatchReceipt;
  }>
): Promise<ClientSubscriptionCaptureDispatchExecution> {
  const verified = verifySource(input);
  if (!verified) return { outcome: "source_event_conflict" };

  try {
    return await applyClientSubscriptionSourceEvent(
      unitOfWork,
      {
        subscriptionId: verified.receipt.authority.subscriptionId,
        expectedVersion: verified.receipt.authority.subscriptionExpectedVersion,
        sourceEventId: verified.sourceEvent.eventId,
        sourceEventDigest: verified.receipt.sourceEventDigest,
        evidenceId: verified.sourceEvent.data.financeEvidenceId
      },
      (current) => {
        const authority = verified.receipt.authority;
        if (
          current.id !== authority.subscriptionId ||
          current.contract.id !== authority.contractId ||
          current.contract.orderId !== authority.orderId ||
          current.contract.canonicalDigest !== authority.contractCanonicalDigest
        ) {
          throw new CaptureAuthorityConflict();
        }

        const target = verified.receipt.target;
        if (target.kind === "initial") {
          return applyInitialCapture(current, {
            sourceEventId: verified.sourceEvent.eventId,
            evidenceId: verified.sourceEvent.data.financeEvidenceId,
            capturedAt: authority.capturedAt,
            periodId: target.periodId,
            eventIds: [target.activatedEventId, target.entitlementChangedEventId]
          });
        }
        return applyRenewalCapture(current, {
          sourceEventId: verified.sourceEvent.eventId,
          evidenceId: verified.sourceEvent.data.financeEvidenceId,
          renewalRequestId: target.renewalRequestId,
          intendedPeriodId: target.intendedPeriodId,
          capturedAt: authority.capturedAt,
          periodId: target.periodId,
          eventIds: [target.periodRenewedEventId, target.entitlementChangedEventId]
        });
      }
    );
  } catch (error) {
    if (error instanceof CaptureAuthorityConflict) return { outcome: "authority_conflict" };
    throw error;
  }
}

function verifySource(
  input: Readonly<{
    sourceEvent: ClientSubscriptionCaptureAppliedEvent;
    dispatchReceipt: FinanceClientOrderCaptureDispatchReceipt;
  }>
): Readonly<{
  sourceEvent: ClientSubscriptionCaptureAppliedEvent;
  receipt: FinanceClientOrderCaptureDispatchReceipt;
}> | null {
  try {
    const parsed = clientSubscriptionEventSchema.parse(input.sourceEvent);
    if (parsed.eventType !== "client_subscription.capture_applied.v1") return null;
    const receipt = rehydrateFinanceClientOrderCaptureDispatchReceipt(input.dispatchReceipt);
    const expected = createFinanceClientSubscriptionCaptureAppliedEvent(receipt);
    if (
      digestFinanceCanonicalValueV1(parsed) !== receipt.sourceEventDigest ||
      digestFinanceCanonicalValueV1(parsed) !== digestFinanceCanonicalValueV1(expected)
    ) {
      return null;
    }
    return { sourceEvent: parsed, receipt };
  } catch {
    return null;
  }
}

class CaptureAuthorityConflict extends Error {}
