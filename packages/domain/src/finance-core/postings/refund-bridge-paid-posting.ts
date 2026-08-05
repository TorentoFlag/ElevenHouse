import type { FinanceJournalEntryInput } from "../journal";
import { createFinanceLedgerAccountRef } from "../ledger-chart";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import { allocationAuthorityRef, readRefundPostingIdentity } from "./refund-posting-builder-common";
import {
  buildBridgePaidCompositeEvidence,
  matchBridgeAuthority,
  readBridgePaidModelDecision,
  readConfirmedBridgeContext
} from "./refund-posting-bridge-common";
import { readPayoutPaidSourceAuthority } from "./payout-source-authority-codec";

export function buildRefundBridgePayoutPaidPosting(
  input: unknown,
  postingEnvelope: FinancePostingDecoderEnvelope
) {
  const fields = readExactDataRecord(input, [
    "allocation",
    "resolvedPriorAllocation",
    "resolvedCumulativePosition",
    "fundingTransitionBinding",
    "confirmedTerminalAuthority",
    "confirmedEvidenceBinding",
    "modelDecision",
    "payoutPaidAuthority",
    "postingIdentity"
  ]);
  const context = readConfirmedBridgeContext(
    {
      allocation: fields.allocation,
      resolvedPriorAllocation: fields.resolvedPriorAllocation,
      resolvedCumulativePosition: fields.resolvedCumulativePosition,
      fundingTransitionBinding: fields.fundingTransitionBinding,
      confirmedTerminalAuthority: fields.confirmedTerminalAuthority,
      confirmedEvidenceBinding: fields.confirmedEvidenceBinding
    },
    postingEnvelope
  );
  const decision = readBridgePaidModelDecision(fields.modelDecision);
  const payoutPaidAuthority = readPayoutPaidSourceAuthority(fields.payoutPaidAuthority);
  if (
    payoutPaidAuthority.payoutRequestId !== decision.authority.payoutRequestId ||
    payoutPaidAuthority.authorityId !== decision.authority.payoutPaidAuthorityId ||
    payoutPaidAuthority.version !== decision.authority.payoutPaidAuthorityVersion ||
    payoutPaidAuthority.bankReference !== decision.authority.bankReference ||
    compareFinancePostingInstants(decision.authority.decidedAt, payoutPaidAuthority.transferredAt) <
      0
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const component = matchBridgeAuthority(decision.authority, context);
  const evidence = buildBridgePaidCompositeEvidence(context, decision);
  const identity = readRefundPostingIdentity(fields.postingIdentity);
  const entries = bridgePaidEntries(context.allocation, component);
  const recipe = createUnverifiedFinanceJournalPostingRecipe(
    {
      context: {
        journalTransactionId: identity.journalTransactionId,
        linkProofId: identity.linkProofId,
        operationId: decision.authority.authorityId,
        sourceKey: decision.sourceKey,
        occurredAt: decision.authority.decidedAt,
        postedAt: identity.postedAt
      },
      authorityRef: allocationAuthorityRef(context.allocation),
      sourceEvidenceRef: {
        kind: evidence.kind,
        evidenceId: evidence.evidenceId,
        canonicalDigest: evidence.canonicalDigest
      },
      operationSnapshotRef: null,
      entries,
      entrySourceLinks: [null, null]
    },
    postingEnvelope
  );
  return Object.freeze({
    kind: "refund_journal" as const,
    operation: "bridge_payout_paid" as const,
    fundingDisposition: "bridge_closed_to_paid_treatment" as const,
    productionStatus: "model_only" as const,
    returnResolutionStatus: "undefined_fail_closed" as const,
    modelOnlyArtifact: Object.freeze({
      kind: "non_committable_refund_bridge_paid_model" as const,
      commitEligibility: "blocked_missing_return_resolution" as const,
      recipe
    }),
    sourceEvidence: evidence,
    confirmedEvidenceBinding: context.binding,
    operationSnapshotRef: null,
    fundingTransitionBinding: context.fundingTransitionBinding,
    cumulativePositionDecision: context.cumulativePositionDecision
  });
}

function bridgePaidEntries(
  allocation: ReturnType<typeof readConfirmedBridgeContext>["allocation"],
  component: ReturnType<typeof matchBridgeAuthority>
): readonly FinanceJournalEntryInput[] {
  const treatment = component.paidOutcomeTreatment;
  const commonLinks = Object.freeze({
    originalSaleId: allocation.orderId,
    componentId: component.componentId,
    payableLotId: component.payableLotId,
    payoutAllocationId: component.payoutAllocationId
  });
  const treatmentAccount =
    treatment.accountCode === "astrologer_recovery_receivable"
      ? createFinanceLedgerAccountRef({
          code: treatment.accountCode,
          astrologerUserId: allocation.astrologerUserId,
          currency: "RUB"
        })
      : createFinanceLedgerAccountRef({ code: treatment.accountCode, currency: "RUB" });
  return Object.freeze([
    Object.freeze({
      account: treatmentAccount,
      side: "debit" as const,
      amount: component.amount,
      links: commonLinks
    }),
    Object.freeze({
      account: createFinanceLedgerAccountRef({
        code: "payout_inflight_refund_bridge",
        refundId: allocation.refundId,
        payoutRequestId: component.payoutRequestId,
        currency: "RUB"
      }),
      side: "credit" as const,
      amount: component.amount,
      links: commonLinks
    })
  ]);
}
