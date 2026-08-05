import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  createPayableLotOperationReceipt,
  type PayableLotReceiptDecoderEnvelope
} from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { assertFinanceJournalLinkProofMatchesTransaction as assertProofMatchesTransactionWithEnvelope } from "./journal-link-proof";
import {
  createReceiptScopedRecipe,
  receiptDecoderEnvelope,
  walletLinkedProofFixture
} from "./payable-lot-posting-link-test-fixtures";
import { FinancePostingIntegrityError } from "./posting-codec";
import { assertFinanceJournalLinkProofMatchesOperationReceipt as assertProofMatchesReceiptWithEnvelopes } from "./payable-lot-posting-link";
import { expectPostingError, hashProofCore } from "./posting-test-assertions";
import { postingDecoderEnvelope, withPostingDecoderEnvelope } from "./posting-test-primitives";

const assertFinanceJournalLinkProofMatchesTransaction = withPostingDecoderEnvelope(
  assertProofMatchesTransactionWithEnvelope
);

function assertFinanceJournalLinkProofMatchesOperationReceipt(input: {
  proof: unknown;
  operationReceipt: unknown;
  receiptDecoderEnvelope: PayableLotReceiptDecoderEnvelope;
  componentBindings: readonly unknown[];
}): void {
  const { receiptDecoderEnvelope: receiptEnvelope, ...targetInput } = input;
  assertProofMatchesReceiptWithEnvelopes(
    targetInput as never,
    postingDecoderEnvelope,
    receiptEnvelope
  );
}

describe("payable-lot posting link", () => {
  it("preserves a typed failure at the strict receipt-link boundary", () => {
    expect(() =>
      assertFinanceJournalLinkProofMatchesOperationReceipt({
        proof: null,
        operationReceipt: null,
        receiptDecoderEnvelope: {
          maxAuthorityRefs: 1,
          maxEffects: 1,
          maxLineage: 1,
          maxComponentSlots: 1,
          maxDecimalDigits: 1
        },
        componentBindings: []
      })
    ).toThrowError(FinancePostingIntegrityError);
  });

  it("lets transaction matching preserve and operation-receipt matching verify non-null metadata", () => {
    const { proof, transaction, operationReceipt, componentBindings } = walletLinkedProofFixture();

    expect(() =>
      assertFinanceJournalLinkProofMatchesTransaction({ proof, transaction })
    ).not.toThrow();
    expect(() =>
      assertFinanceJournalLinkProofMatchesOperationReceipt({
        proof,
        operationReceipt,
        receiptDecoderEnvelope,
        componentBindings
      })
    ).not.toThrow();
  });

  it("keeps wallet revisions independent from payable-lot state versions", () => {
    const fixture = walletLinkedProofFixture();
    expect(fixture.proof.operationSnapshotRef).toMatchObject({
      previousWalletRevision: "40",
      nextWalletRevision: "41"
    });
    expect(fixture.proof.operationSnapshotRef?.previousWalletRevision).not.toBe(
      fixture.operationReceipt.previousLotState.version
    );

    expect(() =>
      assertFinanceJournalLinkProofMatchesOperationReceipt({
        proof: fixture.proof,
        operationReceipt: fixture.operationReceipt,
        receiptDecoderEnvelope,
        componentBindings: fixture.componentBindings
      })
    ).not.toThrow();
  });

  it.each(["semantic_edge_id", "lot_allocation_id"] as const)(
    "detects source-operation receipt drift in %s without misclassifying journal equality",
    (counterexample) => {
      const fixture = walletLinkedProofFixture(
        counterexample === "semantic_edge_id"
          ? { semanticEdgeId: "forged-semantic-edge" }
          : { lotAllocationId: "forged-lot-allocation" }
      );
      const { proof, transaction, operationReceipt, componentBindings } = fixture;

      expect(() =>
        assertFinanceJournalLinkProofMatchesTransaction({ proof, transaction })
      ).not.toThrow();
      expectPostingError(
        () =>
          assertFinanceJournalLinkProofMatchesOperationReceipt({
            proof,
            operationReceipt,
            receiptDecoderEnvelope,
            componentBindings
          }),
        "proof_operation_receipt_mismatch"
      );
    }
  );

  it.each(["bucket_account", "astrologer_scope", "component_resolution"] as const)(
    "rejects receipt-linked proof drift in %s",
    (counterexample) => {
      const fixture = walletLinkedProofFixture({
        ...(counterexample === "bucket_account" ? { accountCode: "astrologer_available" } : {}),
        ...(counterexample === "astrologer_scope" ? { astrologerUserId: "astrologer-2" } : {}),
        ...(counterexample === "component_resolution"
          ? { componentBindingComponentId: "another-component" }
          : {})
      });
      expectPostingError(
        () =>
          assertFinanceJournalLinkProofMatchesOperationReceipt({
            proof: fixture.proof,
            operationReceipt: fixture.operationReceipt,
            receiptDecoderEnvelope,
            componentBindings: fixture.componentBindings
          }),
        "proof_operation_receipt_mismatch"
      );
    }
  );

  it("uses strict Task5 receipt rehydration and rejects body drift under the old digest", () => {
    const fixture = walletLinkedProofFixture();
    const operationReceipt = JSON.parse(JSON.stringify(fixture.operationReceipt)) as {
      effects: { amount: { amountMinor: number } }[];
    };
    const firstEffect = operationReceipt.effects[0];
    if (!firstEffect) throw new Error("missing source receipt effect");
    firstEffect.amount.amountMinor += 1;

    expectPostingError(
      () =>
        assertFinanceJournalLinkProofMatchesOperationReceipt({
          proof: fixture.proof,
          operationReceipt,
          receiptDecoderEnvelope,
          componentBindings: fixture.componentBindings
        }),
      "proof_operation_receipt_mismatch"
    );
  });

  it("accepts a canonical zero-effect receipt while still binding its operation snapshot", () => {
    const receiptCase = buildReceiptTransitionCases().find(
      (candidate) => candidate.kind === "chargeback_confirmed"
    );
    if (!receiptCase) throw new Error("missing zero-effect receipt fixture");
    const operationReceipt = createPayableLotOperationReceipt(receiptCase.transition);
    if (operationReceipt.effects.length !== 0) throw new Error("expected zero effects");
    const result = createReceiptScopedRecipe(operationReceipt, [], [null, null]);

    expect(() =>
      assertFinanceJournalLinkProofMatchesOperationReceipt({
        proof: result.linkProof,
        operationReceipt,
        receiptDecoderEnvelope,
        componentBindings: []
      })
    ).not.toThrow();
  });

  it.each(["kind", "evidence_id", "canonical_digest"] as const)(
    "rejects a locally rehashed proof with source-evidence drift in %s",
    (counterexample) => {
      const fixture = walletLinkedProofFixture();
      const proof = structuredClone(fixture.proof) as unknown as Record<string, unknown> & {
        sourceEvidenceRef: Record<string, unknown>;
        proofDigest: `sha256:${string}`;
      };
      if (counterexample === "kind") proof.sourceEvidenceRef.kind = "generic-evidence";
      if (counterexample === "evidence_id") {
        proof.sourceEvidenceRef.evidenceId = "another-receipt";
      }
      if (counterexample === "canonical_digest") {
        proof.sourceEvidenceRef.canonicalDigest = `sha256:${"0".repeat(64)}`;
      }
      proof.proofDigest = hashProofCore(proof);

      expectPostingError(
        () =>
          assertFinanceJournalLinkProofMatchesOperationReceipt({
            proof,
            operationReceipt: fixture.operationReceipt,
            receiptDecoderEnvelope,
            componentBindings: fixture.componentBindings
          }),
        "proof_operation_receipt_mismatch"
      );
    }
  );

  it.each([
    "operation",
    "source",
    "history_digest",
    "previous_state_digest",
    "next_state_digest"
  ] as const)("rejects a locally rehashed operation snapshot with %s drift", (counterexample) => {
    const fixture = walletLinkedProofFixture();
    const proof = structuredClone(fixture.proof) as unknown as Record<string, unknown> & {
      operationSnapshotRef: Record<string, unknown> & {
        sourceKey: Record<string, unknown>;
      };
      proofDigest: `sha256:${string}`;
    };
    const snapshot = proof.operationSnapshotRef;
    if (counterexample === "operation") snapshot.operationId = "another-operation";
    if (counterexample === "source") snapshot.sourceKey.sourceId = "another-source";
    if (counterexample === "history_digest") {
      snapshot.historyRecordDigest = `sha256:${"0".repeat(64)}`;
    }
    if (counterexample === "previous_state_digest") {
      snapshot.previousLotStateDigest = `sha256:${"1".repeat(64)}`;
    }
    if (counterexample === "next_state_digest") {
      snapshot.nextLotStateDigest = `sha256:${"2".repeat(64)}`;
    }
    proof.proofDigest = hashProofCore(proof);

    expectPostingError(
      () =>
        assertFinanceJournalLinkProofMatchesOperationReceipt({
          proof,
          operationReceipt: fixture.operationReceipt,
          receiptDecoderEnvelope,
          componentBindings: fixture.componentBindings
        }),
      "proof_operation_receipt_mismatch"
    );
  });

  it("binds source evidence and snapshot state for a zero-effect receipt", () => {
    const receiptCase = buildReceiptTransitionCases().find(
      (candidate) => candidate.kind === "chargeback_confirmed"
    );
    if (!receiptCase) throw new Error("missing zero-effect receipt fixture");
    const operationReceipt = createPayableLotOperationReceipt(receiptCase.transition);
    const result = createReceiptScopedRecipe(operationReceipt, [], [null, null]);
    const proof = structuredClone(result.linkProof) as unknown as Record<string, unknown> & {
      sourceEvidenceRef: Record<string, unknown>;
      proofDigest: `sha256:${string}`;
    };
    proof.sourceEvidenceRef.evidenceId = "another-zero-effect-receipt";
    proof.proofDigest = hashProofCore(proof);

    expectPostingError(
      () =>
        assertFinanceJournalLinkProofMatchesOperationReceipt({
          proof,
          operationReceipt,
          receiptDecoderEnvelope,
          componentBindings: []
        }),
      "proof_operation_receipt_mismatch"
    );
  });

  it.each(["missing", "extra", "duplicate", "locally_rehashed_slot"] as const)(
    "rejects %s component bindings instead of accepting partial correspondence",
    (counterexample) => {
      const fixture = walletLinkedProofFixture();
      const original = fixture.componentBindings[0];
      if (!original) throw new Error("missing component binding fixture");
      const rehash = (binding: Record<string, unknown>) => {
        const core = Object.fromEntries(
          Object.entries(binding).filter(([key]) => key !== "bindingDigest")
        );
        return { ...binding, bindingDigest: hashFinanceCommandPayload(core) };
      };
      const additional = rehash({
        ...original,
        bindingId: "additional-binding",
        slotId: "additional-slot",
        effectId: "additional-effect"
      });
      const rehashedSlot = rehash({ ...original, slotId: "locally-rehashed-slot" });
      const componentBindings =
        counterexample === "missing"
          ? []
          : counterexample === "extra"
            ? [original, additional]
            : counterexample === "duplicate"
              ? [original, original]
              : [rehashedSlot];

      expectPostingError(
        () =>
          assertFinanceJournalLinkProofMatchesOperationReceipt({
            proof: fixture.proof,
            operationReceipt: fixture.operationReceipt,
            receiptDecoderEnvelope,
            componentBindings
          }),
        "proof_operation_receipt_mismatch"
      );
    }
  );

  it("requires both out-of-band envelopes before reading hostile target input", () => {
    let trapCalls = 0;
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          trapCalls += 1;
          throw new Error("must not read target input");
        }
      }
    );
    expectPostingError(
      () =>
        assertProofMatchesReceiptWithEnvelopes(
          hostile as never,
          undefined as never,
          receiptDecoderEnvelope
        ),
      "decoder_envelope_required"
    );
    expectPostingError(
      () =>
        assertProofMatchesReceiptWithEnvelopes(
          hostile as never,
          postingDecoderEnvelope,
          undefined as never
        ),
      "proof_operation_receipt_mismatch"
    );
    expect(trapCalls).toBe(0);
  });

  it("rejects an embedded posting policy even when separate envelopes are valid", () => {
    const fixture = walletLinkedProofFixture();
    expectPostingError(
      () =>
        assertProofMatchesReceiptWithEnvelopes(
          {
            proof: fixture.proof,
            operationReceipt: fixture.operationReceipt,
            componentBindings: fixture.componentBindings,
            postingDecoderEnvelope
          } as never,
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "invalid_shape"
    );
  });

  it.each([
    ["missing", undefined],
    ["non-positive cap", { ...receiptDecoderEnvelope, maxEffects: 0 }],
    ["caller-authored extra field", { ...receiptDecoderEnvelope, maxSerializedBytes: 1_000_000 }]
  ])("rejects a %s receipt decoder envelope without applying defaults", (_name, envelope) => {
    const fixture = walletLinkedProofFixture();
    expectPostingError(
      () =>
        assertFinanceJournalLinkProofMatchesOperationReceipt({
          proof: fixture.proof,
          operationReceipt: fixture.operationReceipt,
          receiptDecoderEnvelope: envelope as PayableLotReceiptDecoderEnvelope,
          componentBindings: fixture.componentBindings
        }),
      "proof_operation_receipt_mismatch"
    );
  });

  it("rejects a Proxy receipt envelope before executing reflective traps", () => {
    const fixture = walletLinkedProofFixture();
    let trapCalls = 0;
    const hostileEnvelope = new Proxy(receiptDecoderEnvelope, {
      ownKeys(target) {
        trapCalls += 1;
        return Reflect.ownKeys(target);
      }
    });
    expectPostingError(
      () =>
        assertProofMatchesReceiptWithEnvelopes(
          {
            proof: fixture.proof,
            operationReceipt: fixture.operationReceipt,
            componentBindings: fixture.componentBindings
          },
          postingDecoderEnvelope,
          hostileEnvelope
        ),
      "proof_operation_receipt_mismatch"
    );
    expect(trapCalls).toBe(0);
  });
});
