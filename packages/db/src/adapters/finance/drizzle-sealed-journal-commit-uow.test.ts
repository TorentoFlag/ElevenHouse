import { describe, expect, it } from "vitest";

import {
  createFinanceJournalTransaction,
  createFinanceLedgerAccountRef,
  createFinanceSourceKey,
  digestFinanceCanonicalValueV1,
  type FinanceJournalLinkProof,
  type SealedJournalMutationCommand
} from "@elevenhouse/domain/finance-core";
import {
  prepareSealedJournalMutation,
  SealedJournalCommitPersistenceError
} from "./drizzle-sealed-journal-commit-uow";

describe("transaction-scoped journal-only commit preparation", () => {
  it("accepts one exact journal recipe/proof and a server-resolved decoder envelope", () => {
    const command = validCommand();
    const prepared = prepareSealedJournalMutation(command);

    expect(prepared).toEqual({
      operationId: command.operationId,
      transaction: command.postingRecipe.transaction,
      proof: command.journalLinkProof,
      decoderEnvelope: command.operationEnvelope.journalPosting.decoderEnvelope
    });
    expect(Object.isFrozen(prepared)).toBe(true);
  });

  it.each(["operation", "proof", "recipe_proof", "policy", "extra"] as const)(
    "rejects %s command drift before persistence",
    (counterexample) => {
      const command = structuredClone(validCommand()) as unknown as Record<string, unknown>;
      if (counterexample === "operation") command.operationId = "another-operation";
      if (counterexample === "proof") {
        command.journalLinkProof = {
          ...(command.journalLinkProof as Record<string, unknown>),
          operationId: "another-operation"
        };
      }
      if (counterexample === "recipe_proof") {
        const recipe = command.postingRecipe as Record<string, unknown>;
        recipe.linkProof = {
          ...(recipe.linkProof as Record<string, unknown>),
          proofDigest: sha("f")
        };
      }
      if (counterexample === "policy") {
        const envelope = command.operationEnvelope as Record<string, unknown>;
        envelope.policyDigest = "not-a-digest";
      }
      if (counterexample === "extra") command.untrustedScope = {};

      expect(() => prepareSealedJournalMutation(command as never)).toThrow(
        SealedJournalCommitPersistenceError
      );
    }
  );
});

function validCommand(): SealedJournalMutationCommand {
  const fixture = postingFixture("invoice-journal-only", "journal-only-1", "proof-only-1");
  const decoderEnvelope = Object.freeze({
    maxJournalEntries: 16,
    maxProofEdges: 16,
    maxComponentBindings: 16,
    maxAllocations: 16,
    maxDecimalDigits: 38
  });
  return {
    operationId: fixture.proof.operationId,
    postingRecipe: {
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      transaction: fixture.transaction,
      linkProof: fixture.proof
    },
    journalLinkProof: fixture.proof,
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "finance-journal-policy",
      policyVersion: 1,
      policyDigest: sha("1"),
      maximumRows: 64,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2_097_152,
      journalPosting: { decoderEnvelope }
    } as SealedJournalMutationCommand["operationEnvelope"]
  };
}

function sha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function postingFixture(sourceId: string, transactionId: string, proofId: string) {
  const sourceKey = createFinanceSourceKey({
    kind: "platform_invoice",
    sourceId,
    operation: "captured"
  });
  const transaction = createFinanceJournalTransaction({
    id: transactionId,
    sourceKey,
    occurredAt: "2026-08-03T23:00:00Z",
    postedAt: "2026-08-03T23:00:01Z",
    reversesTransactionId: null,
    entries: [
      {
        account: createFinanceLedgerAccountRef({
          code: "arc_provider_clearing",
          arcProviderAccountId: "arc-account-1",
          currency: "RUB"
        }),
        side: "debit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: noLinks
      },
      {
        account: createFinanceLedgerAccountRef({
          code: "platform_subscription_deferred",
          currency: "RUB"
        }),
        side: "credit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: noLinks
      }
    ]
  });
  const proofCore = Object.freeze({
    kind: "finance_allocation_link_proof" as const,
    proofId,
    version: 1 as const,
    allocationAuthorityRef: Object.freeze({
      kind: "platform_tariff_invoice_capture_authority",
      authorityId: `authority-${transaction.id}`,
      version: 1,
      canonicalDigest: digestFinanceCanonicalValueV1({ authority: transaction.id })
    }),
    sourceEvidenceRef: Object.freeze({
      kind: "canonical_platform_invoice_capture",
      evidenceId: `evidence-${transaction.id}`,
      canonicalDigest: digestFinanceCanonicalValueV1({ evidence: transaction.id })
    }),
    journalTransactionId: transaction.id,
    journalSourceKey: transaction.sourceKey,
    operationId: `operation-${transaction.id}`,
    operationSnapshotRef: null,
    edges: Object.freeze(
      transaction.entries.map((entry, entryIndex) =>
        Object.freeze({
          entryIndex,
          account: entry.account,
          side: entry.side,
          amount: entry.amount,
          links: entry.links,
          semanticEdgeId: null,
          lotAllocationId: null
        })
      )
    )
  });
  const proof = Object.freeze({
    ...proofCore,
    proofDigest: digestFinanceCanonicalValueV1(proofCore)
  }) as FinanceJournalLinkProof;
  return { transaction, proof };
}

const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});
