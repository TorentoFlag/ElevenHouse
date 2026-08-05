import { hashFinanceCommandPayload } from "../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readOwnDataDiscriminator,
  sameCanonicalFinancePostingValue
} from "./postings/posting-codec";
import type { FinancePostingDecoderEnvelope } from "./postings/posting-decoder-envelope";
import { readAndAssertRefundCumulativePosition } from "./postings/refund-cumulative-position";
import { projectRefundCumulativeTerminalPosition } from "./postings/refund-cumulative-position";
import { readUnverifiedRefundFundingPosition } from "./postings/refund-funding-position-codec";
import { readUnverifiedRefundFundingTransitionBinding } from "./postings/refund-funding-transition-codec";
import { readRefundPostingAllocationContext } from "./postings/refund-posting-allocation-context";
import {
  assertRefundTerminalEvidenceMatchesAllocation,
  readUnverifiedRefundTerminalEvidenceBinding
} from "./postings/refund-posting-evidence";
import { readRefundTerminalAuthority } from "./postings/refund-posting-evidence-codec";
import type { RefundResultExecutionProposal } from "./ports/refund-result-application-uow";

/**
 * Rehydrates the exact terminal proposal before a persistence adapter can mutate a refund.
 *
 * The provider worker must not recompute allocation or funding from the current wallet graph:
 * approval already reserved a particular historical graph.  This decoder proves the submitted
 * terminal binding is a transition of that graph and that the terminal posting carries the same
 * evidence and cumulative-position decision.
 */
export function admitRefundResultExecutionProposal(
  input: unknown,
  postingDecoderEnvelope: FinancePostingDecoderEnvelope
): RefundResultExecutionProposal {
  const fields = readExactDataRecord(input, executionKeys);
  if (fields.kind !== "refund_result_execution_proposal") mismatch();
  const context = readRefundPostingAllocationContext(
    {
      allocation: fields.allocation,
      resolvedPriorAllocation: fields.resolvedPriorAllocation,
      resolvedCumulativePosition: fields.resolvedCumulativePosition,
      fundingTransitionBinding: fields.fundingTransitionBinding
    },
    postingDecoderEnvelope
  );
  const positions = Object.freeze(
    readExactDataArray(
      fields.resolvedFundingPositions,
      1,
      postingDecoderEnvelope.maxAllocations
    ).map((position) => readUnverifiedRefundFundingPosition(position, postingDecoderEnvelope))
  );
  const terminalAuthority = readRefundTerminalAuthority(fields.terminalAuthority);
  const terminalEvidenceBinding = readUnverifiedRefundTerminalEvidenceBinding(
    fields.terminalEvidenceBinding,
    postingDecoderEnvelope
  );
  assertRefundTerminalEvidenceMatchesAllocation(
    {
      allocation: context.allocation,
      binding: terminalEvidenceBinding,
      terminalAuthority
    },
    postingDecoderEnvelope
  );
  const fundingTransitionBinding = readUnverifiedRefundFundingTransitionBinding(
    fields.fundingTransitionBinding,
    postingDecoderEnvelope
  );
  if (
    fundingTransitionBinding.operation !==
      (terminalAuthority.kind === "refund_confirmed" ? "confirmed" : "failed") ||
    fundingTransitionBinding.priorTransitionBindingRef === null ||
    fundingTransitionBinding.terminalAuthorityRef?.kind !== terminalAuthority.kind ||
    fundingTransitionBinding.terminalAuthorityRef?.authorityId !== terminalAuthority.authorityId ||
    fundingTransitionBinding.terminalAuthorityRef?.version !== terminalAuthority.version ||
    fundingTransitionBinding.terminalAuthorityRef?.canonicalDigest !==
      hashFinanceCommandPayload(terminalAuthority) ||
    fundingTransitionBinding.transitions.length !== positions.length ||
    fundingTransitionBinding.transitions.some((transition) => {
      const position = positions.find(
        (candidate) => candidate.positionId === transition.expectedPositionRef.positionId
      );
      return (
        !position ||
        position.version !== transition.expectedPositionRef.version ||
        position.positionDigest !== transition.expectedPositionRef.canonicalDigest
      );
    })
  ) {
    mismatch();
  }
  const resolvedCumulativePosition = readAndAssertRefundCumulativePosition(
    fields.resolvedCumulativePosition,
    context.allocation,
    postingDecoderEnvelope
  );
  const cumulativePositionDecision = projectRefundCumulativeTerminalPosition(
    context.allocation,
    resolvedCumulativePosition,
    terminalAuthority
  );
  assertTerminalPosting(
    fields.terminalPosting,
    terminalAuthority.kind === "refund_confirmed" ? "confirmed" : "failed",
    fundingTransitionBinding,
    terminalEvidenceBinding,
    cumulativePositionDecision
  );
  const walletJournalMutation = fields.walletJournalMutation;
  if (
    terminalPostingKind(fields.terminalPosting) === "refund_state_only" &&
    walletJournalMutation !== null
  ) {
    mismatch();
  }
  return Object.freeze({
    kind: "refund_result_execution_proposal" as const,
    allocation: context.allocation,
    resolvedPriorAllocation: context.resolvedPriorAllocation,
    resolvedCumulativePosition,
    resolvedFundingPositions: positions,
    fundingTransitionBinding,
    terminalAuthority,
    terminalEvidenceBinding,
    terminalPosting: fields.terminalPosting as RefundResultExecutionProposal["terminalPosting"],
    walletJournalMutation:
      walletJournalMutation as RefundResultExecutionProposal["walletJournalMutation"]
  });
}

const executionKeys = [
  "kind",
  "allocation",
  "resolvedPriorAllocation",
  "resolvedCumulativePosition",
  "resolvedFundingPositions",
  "fundingTransitionBinding",
  "terminalAuthority",
  "terminalEvidenceBinding",
  "terminalPosting",
  "walletJournalMutation"
] as const;

function assertTerminalPosting(
  input: unknown,
  operation: "confirmed" | "failed",
  fundingTransitionBinding: unknown,
  terminalEvidenceBinding: unknown,
  cumulativePositionDecision: unknown
): void {
  const kind = terminalPostingKind(input);
  if (kind === "refund_state_only") {
    const fields = readExactDataRecord(input, [
      "kind",
      "operation",
      "authorizationStatus",
      "atomicityStatus",
      "reason",
      "fundingDisposition",
      "fundingTransitionBinding",
      "cumulativePositionDecision",
      "allocationAuthorityRef",
      "operationReceiptRef",
      "operationSnapshotRef",
      "terminalEvidenceBinding",
      "componentBindings"
    ]);
    if (
      operation !== "failed" ||
      fields.operation !== operation ||
      fields.authorizationStatus !== "unverified" ||
      fields.atomicityStatus !== "unverified" ||
      fields.reason !== "no_payable_lot_reclassification" ||
      fields.fundingDisposition !== "released" ||
      !sameCanonicalFinancePostingValue(
        fields.fundingTransitionBinding,
        fundingTransitionBinding
      ) ||
      !sameCanonicalFinancePostingValue(fields.terminalEvidenceBinding, terminalEvidenceBinding) ||
      !sameCanonicalFinancePostingValue(
        fields.cumulativePositionDecision,
        cumulativePositionDecision
      )
    ) {
      mismatch();
    }
    return;
  }
  const fields = readExactDataRecord(input, [
    "kind",
    "operation",
    "fundingDisposition",
    "fundingTransitionBinding",
    "cumulativePositionDecision",
    "recipe",
    "operationReceiptRef",
    "terminalEvidenceBinding",
    "componentBindings",
    ...(operation === "confirmed" ? (["originalPlatformJournals"] as const) : [])
  ]);
  if (
    fields.operation !== operation ||
    fields.fundingDisposition !== (operation === "confirmed" ? "consumed" : "released") ||
    !sameCanonicalFinancePostingValue(fields.fundingTransitionBinding, fundingTransitionBinding) ||
    !sameCanonicalFinancePostingValue(fields.terminalEvidenceBinding, terminalEvidenceBinding) ||
    !sameCanonicalFinancePostingValue(fields.cumulativePositionDecision, cumulativePositionDecision)
  ) {
    mismatch();
  }
}

function terminalPostingKind(input: unknown): "refund_state_only" | "refund_journal" {
  return readOwnDataDiscriminator(input, "kind", ["refund_state_only", "refund_journal"] as const);
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
