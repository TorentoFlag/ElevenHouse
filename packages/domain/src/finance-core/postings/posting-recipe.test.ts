import { describe, expect, it } from "vitest";
import { createUnverifiedFinanceJournalPostingRecipe as createRecipe } from "./posting-recipe";
import { createSnapshotPosting, snapshotRef } from "./posting-recipe-test-fixtures";
import { expectPostingError } from "./posting-test-assertions";
import { withPostingDecoderEnvelope } from "./posting-test-primitives";

const createUnverifiedFinanceJournalPostingRecipe = withPostingDecoderEnvelope(createRecipe);

const noLinks = {
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
} as const;

function validRawRecipeInput() {
  return {
    context: {
      journalTransactionId: "journal-hostile-entry",
      linkProofId: "proof-hostile-entry",
      operationId: "operation-hostile-entry",
      sourceKey: {
        kind: "bank",
        sourceId: "statement-hostile-entry",
        operation: "unknown_credit_recorded"
      },
      occurredAt: "2026-08-03T10:00:00Z",
      postedAt: "2026-08-03T10:01:00Z"
    },
    authorityRef: {
      kind: "recipe-test",
      authorityId: "authority-hostile-entry",
      version: 1,
      canonicalDigest: `sha256:${"1".repeat(64)}`
    },
    sourceEvidenceRef: {
      kind: "recipe-test-evidence",
      evidenceId: "statement-hostile-entry",
      canonicalDigest: `sha256:${"2".repeat(64)}`
    },
    operationSnapshotRef: null,
    entrySourceLinks: [null, null],
    entries: [
      {
        account: { code: "bank_cash", bankCashPoolId: "bank-pool-rub-1", currency: "RUB" },
        side: "debit",
        amount: { amountMinor: 100, currency: "RUB" },
        links: { ...noLinks }
      },
      {
        account: {
          code: "bank_unmatched_credit_suspense",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 100, currency: "RUB" },
        links: { ...noLinks }
      }
    ]
  };
}

describe("finance posting recipe", () => {
  it("keeps a deterministic balanced recipe explicitly unverified", () => {
    const result = createUnverifiedFinanceJournalPostingRecipe({
      context: {
        journalTransactionId: "journal-recipe-1",
        linkProofId: "proof-recipe-1",
        operationId: "operation-recipe-1",
        sourceKey: {
          kind: "bank",
          sourceId: "statement-recipe-1",
          operation: "unknown_credit_recorded"
        },
        occurredAt: "2026-08-03T10:00:00Z",
        postedAt: "2026-08-03T10:01:00Z"
      },
      authorityRef: {
        kind: "recipe-test",
        authorityId: "authority-recipe-1",
        version: 1,
        canonicalDigest: `sha256:${"1".repeat(64)}`
      },
      sourceEvidenceRef: {
        kind: "recipe-test-evidence",
        evidenceId: "statement-recipe-1",
        canonicalDigest: `sha256:${"2".repeat(64)}`
      },
      operationSnapshotRef: null,
      entrySourceLinks: [null, null],
      entries: [
        {
          account: { code: "bank_cash", bankCashPoolId: "bank-pool-rub-1", currency: "RUB" },
          side: "debit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: noLinks
        },
        {
          account: {
            code: "bank_unmatched_credit_suspense",
            bankCashPoolId: "bank-pool-rub-1",
            currency: "RUB"
          },
          side: "credit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: noLinks
        }
      ]
    });

    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
  });

  it("clones and freezes a snapshot ref with canonical revisions beyond Number safety", () => {
    const operationSnapshotRef = {
      snapshotId: "wallet-operation-snapshot-1",
      operationId: "snapshot-operation-1",
      sourceKey: {
        kind: "bank" as const,
        sourceId: "snapshot-operation-1",
        operation: "unknown_credit_recorded" as const
      },
      previousWalletRevision: "9007199254740993",
      nextWalletRevision: "9007199254740994",
      previousLotStateDigest: `sha256:${"3".repeat(64)}` as const,
      nextLotStateDigest: `sha256:${"4".repeat(64)}` as const,
      historyRecordDigest: `sha256:${"1".repeat(64)}` as const,
      snapshotDigest: `sha256:${"2".repeat(64)}` as const
    };

    const result = createUnverifiedFinanceJournalPostingRecipe({
      context: {
        journalTransactionId: "journal-snapshot-1",
        linkProofId: "proof-snapshot-1",
        operationId: "snapshot-operation-1",
        sourceKey: operationSnapshotRef.sourceKey,
        occurredAt: "2026-08-03T10:00:00Z",
        postedAt: "2026-08-03T10:01:00Z"
      },
      authorityRef: {
        kind: "snapshot-test",
        authorityId: "snapshot-authority-1",
        version: 1,
        canonicalDigest: `sha256:${"5".repeat(64)}`
      },
      sourceEvidenceRef: {
        kind: "snapshot-test-evidence",
        evidenceId: "snapshot-evidence-1",
        canonicalDigest: `sha256:${"6".repeat(64)}`
      },
      operationSnapshotRef,
      entrySourceLinks: [null, null],
      entries: [
        {
          account: { code: "bank_cash", bankCashPoolId: "bank-pool-rub-1", currency: "RUB" },
          side: "debit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: noLinks
        },
        {
          account: {
            code: "bank_unmatched_credit_suspense",
            bankCashPoolId: "bank-pool-rub-1",
            currency: "RUB"
          },
          side: "credit",
          amount: { amountMinor: 100, currency: "RUB" },
          links: noLinks
        }
      ]
    });

    expect(result.linkProof.operationSnapshotRef).toEqual(operationSnapshotRef);
    expect(result.linkProof.operationSnapshotRef).not.toBe(operationSnapshotRef);
    expect(Object.isFrozen(result.linkProof.operationSnapshotRef)).toBe(true);
    expect(Object.isFrozen(result.linkProof.operationSnapshotRef?.sourceKey)).toBe(true);
  });

  it.each([
    ["number", 7, "8", "invalid_version"],
    ["leading zero", "07", "8", "invalid_version"],
    ["skipped CAS", "7", "9", "authority_mismatch"]
  ] as const)(
    "rejects a snapshot ref with %s revisions",
    (_name, previousWalletRevision, nextWalletRevision, reason) => {
      expectPostingError(
        () => createSnapshotPosting({ previousWalletRevision, nextWalletRevision }),
        reason
      );
    }
  );

  it("rejects a hostile snapshot ref without executing traps", () => {
    let trapCalls = 0;
    const hostile = new Proxy(snapshotRef("7", "8"), {
      ownKeys() {
        trapCalls += 1;
        throw new Error("must not execute");
      }
    });

    expectPostingError(() => createSnapshotPosting(hostile), "invalid_shape");
    expect(trapCalls).toBe(0);
  });

  it.each(["entry", "account", "amount", "links"] as const)(
    "rejects a hostile raw recipe %s without executing nested traps",
    (location) => {
      const input = validRawRecipeInput();
      const firstEntry = input.entries[0] as unknown as Record<string, unknown>;
      const target = location === "entry" ? firstEntry : (firstEntry[location] as object);
      let trapCalls = 0;
      const hostile = new Proxy(target, {
        getPrototypeOf(value) {
          trapCalls += 1;
          return Reflect.getPrototypeOf(value);
        },
        ownKeys(value) {
          trapCalls += 1;
          return Reflect.ownKeys(value);
        },
        getOwnPropertyDescriptor(value, property) {
          trapCalls += 1;
          return Reflect.getOwnPropertyDescriptor(value, property);
        }
      });
      if (location === "entry") {
        (input.entries as unknown[])[0] = hostile;
      } else {
        firstEntry[location] = hostile;
      }

      expectPostingError(
        () => createUnverifiedFinanceJournalPostingRecipe(input as never),
        "invalid_shape"
      );
      expect(trapCalls).toBe(0);
    }
  );
});
