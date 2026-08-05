import { describe, expect, it } from "vitest";
import { buildUnknownBankCreditPosting as buildUnknownBankCreditPostingWithEnvelope } from "./bank-and-settlement-postings";
import {
  assertFinanceJournalLinkProofMatchesTransaction as assertProofMatchesTransactionWithEnvelope,
  rehydrateFinanceJournalLinkProof as rehydrateFinanceJournalLinkProofWithEnvelope
} from "./journal-link-proof";
import { validUnknownCreditInput } from "./bank-statement-posting-test-fixtures";
import { expectPostingError, hashProofCore } from "./posting-test-assertions";
import { withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildUnknownBankCreditPosting = withPostingDecoderEnvelope(
  buildUnknownBankCreditPostingWithEnvelope
);
const rehydrateFinanceJournalLinkProof = withPostingDecoderEnvelope(
  rehydrateFinanceJournalLinkProofWithEnvelope
);
const assertFinanceJournalLinkProofMatchesTransaction = withPostingDecoderEnvelope(
  assertProofMatchesTransactionWithEnvelope
);

describe("finance journal link proof", () => {
  it("rehydrates and matches the exact indexed journal transaction", () => {
    const result = buildUnknownBankCreditPosting(validUnknownCreditInput());
    const proof = rehydrateFinanceJournalLinkProof(structuredClone(result.linkProof));

    expect(() =>
      assertFinanceJournalLinkProofMatchesTransaction({
        proof,
        transaction: result.transaction
      })
    ).not.toThrow();
  });

  it("strictly rehydrates the persistable journal link proof", () => {
    const result = buildUnknownBankCreditPosting(validUnknownCreditInput());
    const persisted = JSON.parse(JSON.stringify(result.linkProof)) as unknown;
    const rehydrated = rehydrateFinanceJournalLinkProof(persisted);

    expect(rehydrated).toEqual(result.linkProof);
    expect(Object.isFrozen(rehydrated)).toBe(true);
    expect(Object.isFrozen(rehydrated.allocationAuthorityRef)).toBe(true);
    expect(Object.isFrozen(rehydrated.edges)).toBe(true);
    expect(rehydrated.edges.every(Object.isFrozen)).toBe(true);
  });

  it("rejects a structurally valid but digest-tampered journal link proof", () => {
    const result = buildUnknownBankCreditPosting(validUnknownCreditInput());
    const tampered = JSON.parse(JSON.stringify(result.linkProof)) as {
      allocationAuthorityRef: { authorityId: string };
    };
    tampered.allocationAuthorityRef.authorityId = "substituted-authority";

    expectPostingError(() => rehydrateFinanceJournalLinkProof(tampered), "proof_digest_mismatch");
  });

  it("rejects an unbalanced proof even when its digest is recomputed", () => {
    const result = buildUnknownBankCreditPosting(validUnknownCreditInput());
    const tampered = JSON.parse(JSON.stringify(result.linkProof)) as {
      proofDigest: `sha256:${string}`;
      edges: { amount: { amountMinor: number } }[];
      [key: string]: unknown;
    };
    const firstEdge = tampered.edges[0];
    if (!firstEdge) throw new Error("missing fixture edge");
    firstEdge.amount.amountMinor += 1;
    tampered.proofDigest = hashProofCore(tampered);

    expectPostingError(() => rehydrateFinanceJournalLinkProof(tampered), "unbalanced_proof");
  });

  it("rejects hostile and sparse journal link-proof edges without executing traps", () => {
    const result = buildUnknownBankCreditPosting(validUnknownCreditInput());
    const persisted = JSON.parse(JSON.stringify(result.linkProof)) as { edges: unknown[] };
    let trapCalls = 0;
    persisted.edges[0] = new Proxy(persisted.edges[0] as object, {
      get() {
        trapCalls += 1;
        throw new Error("must not execute");
      },
      getOwnPropertyDescriptor(target, key) {
        trapCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    });
    expectPostingError(() => rehydrateFinanceJournalLinkProof(persisted), "invalid_shape");
    expect(trapCalls).toBe(0);

    const sparse = JSON.parse(JSON.stringify(result.linkProof)) as { edges: unknown[] };
    delete sparse.edges[0];
    expectPostingError(() => rehydrateFinanceJournalLinkProof(sparse), "invalid_shape");
  });

  it.each([
    "transaction_id",
    "source",
    "entry_count",
    "entry_order",
    "account",
    "amount",
    "links"
  ] as const)("rejects recomputed proof/transaction drift in %s", (counterexample) => {
    const result = buildUnknownBankCreditPosting(validUnknownCreditInput());
    const proof = JSON.parse(JSON.stringify(result.linkProof)) as Record<string, unknown> & {
      edges: Array<Record<string, unknown>>;
    };
    const transaction = JSON.parse(JSON.stringify(result.transaction)) as Record<
      string,
      unknown
    > & {
      entries: Array<Record<string, unknown>>;
    };

    if (counterexample === "transaction_id") proof.journalTransactionId = "substituted-journal";
    if (counterexample === "source") {
      transaction.sourceKey = {
        ...(transaction.sourceKey as object),
        sourceId: "substituted-source-fact"
      };
    }
    if (counterexample === "entry_count") {
      transaction.entries.push(
        {
          account: { code: "bank_cash", bankCashPoolId: "bank-pool-rub-1", currency: "RUB" },
          side: "debit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: {
            originalSaleId: null,
            componentId: null,
            payableLotId: null,
            payoutAllocationId: null
          }
        },
        {
          account: { code: "bank_cash", bankCashPoolId: "bank-pool-rub-1", currency: "RUB" },
          side: "credit",
          amount: { amountMinor: 1, currency: "RUB" },
          links: {
            originalSaleId: null,
            componentId: null,
            payableLotId: null,
            payoutAllocationId: null
          }
        }
      );
      transaction.totalDebitMinor = "5000001";
      transaction.totalCreditMinor = "5000001";
    }
    if (counterexample === "entry_order") transaction.entries.reverse();
    if (counterexample === "account") {
      transaction.entries[0] = {
        ...transaction.entries[0],
        account: {
          ...(transaction.entries[0]?.account as object),
          bankCashPoolId: "substituted-bank-pool"
        }
      };
    }
    if (counterexample === "amount") {
      for (const entry of transaction.entries) {
        entry.amount = { amountMinor: 4_999_999, currency: "RUB" };
      }
      transaction.totalDebitMinor = "4999999";
      transaction.totalCreditMinor = "4999999";
    }
    if (counterexample === "links") {
      transaction.entries[0] = {
        ...transaction.entries[0],
        links: {
          originalSaleId: "substituted-sale",
          componentId: null,
          payableLotId: null,
          payoutAllocationId: null
        }
      };
    }
    proof.proofDigest = hashProofCore(proof);

    expectPostingError(
      () => assertFinanceJournalLinkProofMatchesTransaction({ proof, transaction }),
      "proof_transaction_mismatch"
    );
  });
});
