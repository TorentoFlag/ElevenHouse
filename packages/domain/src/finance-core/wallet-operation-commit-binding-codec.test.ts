import { describe, expect, it } from "vitest";
import * as projection from "./wallet-operation-projection";
import {
  compareUnverifiedWalletOperation,
  rehydrateWalletOperationCommitBindingRecord
} from "./wallet-operation-boundary.fixture";
import {
  rehydrateWalletOperationCommitBindingRecord as rehydrateBindingWithBoundary,
  toFinanceJournalLinkProofRef,
  toPayableLotOperationReceiptRef,
  WalletOperationProjectionIntegrityError,
  type FinanceJournalLinkProofRef,
  type PayableLotOperationReceiptRef,
  type VerifiedWalletOperationCommitReceipt
} from "./wallet-operation-projection";
import {
  balances,
  payoutFixture,
  projectionLimitPolicy,
  walletProjectionDecoderEnvelope
} from "./wallet-operation-projection.fixture";
import type { FinanceJournalLinkProof } from "./postings/posting-types";
import type { PayableLotOperationReceipt } from "./source-lot-operation-receipt-types";

describe("unverified wallet-operation commit-binding codec", () => {
  it("round-trips an immutable unverified binding and rejects binding digest tampering", () => {
    const baseline = payoutFixture();
    const persisted = JSON.parse(JSON.stringify(baseline.commitBinding)) as Record<string, unknown>;

    const rehydrated = rehydrateWalletOperationCommitBindingRecord(persisted);

    expect(rehydrated).toEqual(baseline.commitBinding);
    expect(rehydrated.authorizationStatus).toBe("unverified");
    expect(rehydrated.atomicityStatus).toBe("unverified");
    expect(rehydrated.unverifiedLimitPolicy).toEqual(
      baseline.operationSnapshot.unverifiedLimitPolicy
    );
    expect(Object.isFrozen(rehydrated)).toBe(true);
    expect(Object.isFrozen(rehydrated.sourceKey)).toBe(true);
    expect(Object.isFrozen(rehydrated.unverifiedLimitPolicy)).toBe(true);
    expect(() =>
      rehydrateWalletOperationCommitBindingRecord({
        ...persisted,
        nextWalletRevision: "99"
      })
    ).toThrowError(WalletOperationProjectionIntegrityError);
    expect(() =>
      rehydrateWalletOperationCommitBindingRecord({
        ...persisted,
        authorizationStatus: "authorized"
      })
    ).toThrowError(WalletOperationProjectionIntegrityError);
    expect(() =>
      rehydrateWalletOperationCommitBindingRecord({
        ...persisted,
        atomicityStatus: "verified"
      })
    ).toThrowError(WalletOperationProjectionIntegrityError);
  });

  it("requires the binding's embedded policy to equal the out-of-band resolved policy", () => {
    const baseline = payoutFixture();
    const differentlyResolvedPolicy = projectionLimitPolicy({ version: "4" });

    expectIntegrityReason(
      () =>
        rehydrateBindingWithBoundary(
          baseline.commitBinding,
          walletProjectionDecoderEnvelope,
          differentlyResolvedPolicy
        ),
      "resolved_policy_mismatch"
    );
  });

  it("rejects hostile comparison, binding, and journal inputs", () => {
    const baseline = payoutFixture();
    let walletGetterInvoked = false;
    const hostileWallet = { ...baseline.previousWallet };
    Object.defineProperty(hostileWallet, "balances", {
      enumerable: true,
      get() {
        walletGetterInvoked = true;
        return balances();
      }
    });
    const hostileBinding = JSON.parse(JSON.stringify(baseline.commitBinding)) as Record<
      string,
      unknown
    >;
    Object.defineProperty(hostileBinding, "operationId", {
      enumerable: true,
      get() {
        return "payout-request-1";
      }
    });
    const hostileJournal = new Proxy(baseline.journalTransaction, {
      getPrototypeOf() {
        throw new Error("hostile prototype trap");
      }
    });

    expect(() =>
      compareUnverifiedWalletOperation({ ...baseline, previousWallet: hostileWallet })
    ).toThrowError(WalletOperationProjectionIntegrityError);
    expect(walletGetterInvoked).toBe(false);
    expect(() =>
      compareUnverifiedWalletOperation({ ...baseline, commitBinding: hostileBinding })
    ).toThrowError(WalletOperationProjectionIntegrityError);
    expect(() =>
      compareUnverifiedWalletOperation({ ...baseline, journalTransaction: hostileJournal })
    ).toThrowError(WalletOperationProjectionIntegrityError);
  });

  it("exposes future trusted receipt references only as types, with no self-authoring factory", () => {
    type TrustedReceiptContract = Pick<
      VerifiedWalletOperationCommitReceipt,
      | "bindingRecordId"
      | "bindingDigest"
      | "payableLotOperationReceiptRef"
      | "financeJournalLinkProofRef"
      | "walletId"
      | "previousWalletRevision"
      | "nextWalletRevision"
      | "mutationSequence"
      | "persistenceTransactionBoundaryRef"
      | "issuedAt"
    >;
    type ReceiptRefContract =
      | TrustedReceiptContract["payableLotOperationReceiptRef"]
      | TrustedReceiptContract["financeJournalLinkProofRef"]
      | PayableLotOperationReceiptRef
      | FinanceJournalLinkProofRef;
    const typeOnlyAssertion = (receipt: ReceiptRefContract): ReceiptRefContract => receipt;

    expect(typeOnlyAssertion).toBeTypeOf("function");
    expect(projection).not.toHaveProperty("createVerifiedWalletOperationCommitReceipt");
  });

  it("maps exact artifact schema and digest fields into future trusted receipt refs", () => {
    const proof = {
      kind: "finance_allocation_link_proof",
      proofId: "proof-1",
      version: 1,
      proofDigest: `sha256:${"a".repeat(64)}`
    } as FinanceJournalLinkProof;
    const receipt = {
      kind: "payable_lot_operation_receipt",
      receiptId: "receipt-1",
      schemaVersion: 1,
      canonicalDigest: `sha256:${"b".repeat(64)}`
    } as PayableLotOperationReceipt;

    const proofRef = toFinanceJournalLinkProofRef(proof);
    const receiptRef = toPayableLotOperationReceiptRef(receipt);
    const exactProofRef: FinanceJournalLinkProofRef = proofRef;
    const exactReceiptRef: PayableLotOperationReceiptRef = receiptRef;
    const actualKind: FinanceJournalLinkProof["kind"] = exactProofRef.kind;

    expect(actualKind).toBe("finance_allocation_link_proof");
    expect(exactProofRef).toEqual({
      kind: "finance_allocation_link_proof",
      proofId: "proof-1",
      version: 1,
      proofDigest: `sha256:${"a".repeat(64)}`
    });
    expect(exactReceiptRef).toEqual({
      kind: "payable_lot_operation_receipt",
      receiptId: "receipt-1",
      schemaVersion: 1,
      canonicalDigest: `sha256:${"b".repeat(64)}`
    });
  });
});

function expectIntegrityReason(
  action: () => unknown,
  reason: WalletOperationProjectionIntegrityError["reason"]
): void {
  try {
    action();
    throw new Error("Expected wallet operation integrity failure");
  } catch (error) {
    expect(error).toBeInstanceOf(WalletOperationProjectionIntegrityError);
    expect((error as WalletOperationProjectionIntegrityError).reason).toBe(reason);
  }
}
