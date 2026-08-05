import type { FinanceJournalEntryInput } from "../journal";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { assertFinanceJournalLinkProofMatchesOperationReceipt } from "./payable-lot-posting-link";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingInstant
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import type { FinancePostingAuthorityRef, FinancePostingEntrySourceLink } from "./posting-types";
import type { RefundReceiptPostingProjection } from "./refund-posting-receipt-mapping";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";

export type RefundPostingIdentity = Readonly<{
  journalTransactionId: string;
  linkProofId: string;
  postedAt: string;
}>;

export function readRefundPostingIdentity(input: unknown): RefundPostingIdentity {
  const fields = readExactDataRecord(input, ["journalTransactionId", "linkProofId", "postedAt"]);
  return Object.freeze({
    journalTransactionId: readFinancePostingIdentifier(fields.journalTransactionId),
    linkProofId: readFinancePostingIdentifier(fields.linkProofId),
    postedAt: readFinancePostingInstant(fields.postedAt)
  });
}

export function assertRefundPostingIdentityChronology(
  identity: RefundPostingIdentity,
  occurredAt: string
): void {
  if (compareFinancePostingInstants(identity.postedAt, occurredAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
}

export function allocationAuthorityRef(
  allocation: RefundPostingAllocationAuthorityV1
): FinancePostingAuthorityRef {
  return Object.freeze({
    kind: allocation.kind,
    authorityId: allocation.authorityId,
    version: allocation.version,
    canonicalDigest: allocation.allocationDigest
  });
}

export function projectRefundFundingReservations(
  allocation: RefundPostingAllocationAuthorityV1,
  action: "retain_locked" | "consume" | "release"
) {
  const fundedComponents = [
    ...allocation.alreadyPaidComponents,
    ...allocation.inFlightPayoutComponents,
    ...allocation.platformCommissionComponents
  ];
  return Object.freeze(
    fundedComponents.map((component) =>
      Object.freeze({
        componentId: component.componentId,
        reservationRef: component.fundingReservationRef,
        action
      })
    )
  );
}

export function createReceiptBoundRefundRecipe(input: {
  projection: RefundReceiptPostingProjection;
  allocation: RefundPostingAllocationAuthorityV1;
  identity: RefundPostingIdentity;
  extraEntries?: readonly FinanceJournalEntryInput[];
  postingEnvelope: FinancePostingDecoderEnvelope;
  receiptEnvelope: PayableLotReceiptDecoderEnvelope;
}) {
  const extraEntries = input.extraEntries ?? [];
  const entries = Object.freeze([
    ...input.projection.rows.map((row) => row.entry),
    ...extraEntries
  ]);
  const entrySourceLinks = Object.freeze([
    ...input.projection.rows.map((row) => row.sourceLink),
    ...extraEntries.map(() => null)
  ] satisfies readonly (FinancePostingEntrySourceLink | null)[]);
  const recipe = createUnverifiedFinanceJournalPostingRecipe(
    {
      context: {
        journalTransactionId: input.identity.journalTransactionId,
        linkProofId: input.identity.linkProofId,
        operationId: input.projection.receipt.operationId,
        sourceKey: input.projection.receipt.sourceKey,
        occurredAt: input.projection.receipt.occurredAt,
        postedAt: input.identity.postedAt
      },
      authorityRef: allocationAuthorityRef(input.allocation),
      sourceEvidenceRef: input.projection.sourceEvidenceRef,
      operationSnapshotRef: input.projection.operationSnapshotRef,
      entries,
      entrySourceLinks
    },
    input.postingEnvelope
  );
  assertFinanceJournalLinkProofMatchesOperationReceipt(
    {
      proof: recipe.linkProof,
      operationReceipt: input.projection.receipt,
      componentBindings: input.projection.componentBindings
    },
    input.postingEnvelope,
    input.receiptEnvelope
  );
  return recipe;
}
