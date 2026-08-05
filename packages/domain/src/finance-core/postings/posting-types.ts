import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { FinanceSourceKey } from "../finance-source-key";
import type { FinanceJournalEntryLinks, FinanceJournalTransaction } from "../journal";
import type { FinanceLedgerAccountRef, FinanceLedgerSide } from "../ledger-chart";

export type FinancePostingAuthorityRef = Readonly<{
  kind: string;
  authorityId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type FinancePostingEvidenceRef = Readonly<{
  kind: string;
  evidenceId: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type FinancePostingOperationSnapshotRef = Readonly<{
  snapshotId: string;
  operationId: string;
  sourceKey: FinanceSourceKey;
  previousWalletRevision: string;
  nextWalletRevision: string;
  previousLotStateDigest: FinanceAuthorizationPayloadHash;
  nextLotStateDigest: FinanceAuthorizationPayloadHash;
  historyRecordDigest: FinanceAuthorizationPayloadHash;
  snapshotDigest: FinanceAuthorizationPayloadHash;
}>;

export type FinanceJournalLinkProofEdge = Readonly<{
  entryIndex: number;
  account: FinanceLedgerAccountRef;
  side: FinanceLedgerSide;
  amount: Money;
  links: FinanceJournalEntryLinks;
  semanticEdgeId: string | null;
  lotAllocationId: string | null;
}>;

export type FinancePostingEntrySourceLink = Readonly<{
  semanticEdgeId: string;
  lotAllocationId: string;
}>;

export type UnverifiedFinanceComponentSlotResolutionBinding = Readonly<{
  kind: "finance_component_slot_resolution_binding";
  bindingId: string;
  version: string;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  operationReceiptId: string;
  operationReceiptDigest: FinanceAuthorizationPayloadHash;
  slotId: string;
  effectId: string;
  componentId: string;
  requiredAuthorityDigest: FinanceAuthorizationPayloadHash;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type FinanceJournalLinkProof = Readonly<{
  kind: "finance_allocation_link_proof";
  proofId: string;
  version: 1;
  allocationAuthorityRef: FinancePostingAuthorityRef;
  sourceEvidenceRef: FinancePostingEvidenceRef;
  journalTransactionId: string;
  journalSourceKey: FinanceSourceKey;
  operationId: string;
  operationSnapshotRef: FinancePostingOperationSnapshotRef | null;
  edges: readonly FinanceJournalLinkProofEdge[];
  proofDigest: FinanceAuthorizationPayloadHash;
}>;

export type FinanceNoPostingReason =
  | "payout_state_only"
  | "chargeback_outcome_only"
  | "chargeback_state_only";

export type FinanceNoPostingEventKey =
  | Readonly<{
      kind: "payout_state";
      sourceId: string;
      operation: "approved" | "bank_work_initiated";
    }>
  | Readonly<{
      kind: "chargeback_state";
      sourceId: string;
      operation: "lost_outcome_recorded" | "lost_allocation_closed";
    }>;

/**
 * Deterministic accounting recipe only. These values can be compared and
 * persisted for reconciliation, but they do not authorize a wallet mutation
 * or prove that any records were committed atomically.
 */
export type UnverifiedFinancePostingRecipe =
  | Readonly<{
      kind: "journal";
      authorizationStatus: "unverified";
      atomicityStatus: "unverified";
      transaction: FinanceJournalTransaction;
      linkProof: FinanceJournalLinkProof;
    }>
  | Readonly<{
      kind: "no_posting";
      authorizationStatus: "unverified";
      atomicityStatus: "unverified";
      eventKey: FinanceNoPostingEventKey;
      reason: FinanceNoPostingReason;
      authorityRef: FinancePostingAuthorityRef;
      operationSnapshotRef: FinancePostingOperationSnapshotRef | null;
    }>;
