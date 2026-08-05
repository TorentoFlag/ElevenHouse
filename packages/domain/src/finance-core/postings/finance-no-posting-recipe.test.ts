import { describe, expect, it } from "vitest";
import {
  readFinanceNoPostingEventKey,
  serializeFinanceNoPostingEventKey
} from "./finance-no-posting-event-key";
import { createUnverifiedFinanceNoPostingRecipe } from "./posting-recipe";
import { FinancePostingIntegrityError } from "./posting-codec";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope } from "./posting-test-primitives";

const authorityRef = Object.freeze({
  kind: "state-transition-authority",
  authorityId: "state-transition-authority-1",
  version: 1,
  canonicalDigest: `sha256:${"a".repeat(64)}` as const
});

describe("finance no-posting recipe", () => {
  it.each([
    {
      eventKey: { kind: "payout_state", sourceId: "payout-state-event-1", operation: "approved" },
      reason: "payout_state_only"
    },
    {
      eventKey: {
        kind: "payout_state",
        sourceId: "payout-state-event-2",
        operation: "bank_work_initiated"
      },
      reason: "payout_state_only"
    },
    {
      eventKey: {
        kind: "chargeback_state",
        sourceId: "chargeback-event-1",
        operation: "lost_outcome_recorded"
      },
      reason: "chargeback_outcome_only"
    },
    {
      eventKey: {
        kind: "chargeback_state",
        sourceId: "chargeback-event-1",
        operation: "lost_allocation_closed"
      },
      reason: "chargeback_state_only"
    }
  ] as const)(
    "maps $eventKey.kind/$eventKey.operation without authority promotion",
    ({ eventKey, reason }) => {
      const result = createUnverifiedFinanceNoPostingRecipe(
        {
          eventKey,
          reason,
          authorityRef,
          operationSnapshotRef: null
        },
        postingDecoderEnvelope
      );

      expect(result).toEqual({
        kind: "no_posting",
        authorizationStatus: "unverified",
        atomicityStatus: "unverified",
        eventKey,
        reason,
        authorityRef,
        operationSnapshotRef: null
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.eventKey)).toBe(true);
      expect(Object.isFrozen(result.authorityRef)).toBe(true);
    }
  );

  it("uses a collision-free exact codec separate from FinanceSourceKey", () => {
    const approved = { kind: "payout_state", sourceId: "shared-id", operation: "approved" };
    const bankWork = {
      kind: "payout_state",
      sourceId: "shared-id",
      operation: "bank_work_initiated"
    };
    expect(serializeFinanceNoPostingEventKey(approved, postingDecoderEnvelope)).not.toBe(
      serializeFinanceNoPostingEventKey(bankWork, postingDecoderEnvelope)
    );
    expect(readFinanceNoPostingEventKey(approved, postingDecoderEnvelope)).toEqual(approved);
    const lostOutcome = {
      kind: "chargeback_state",
      sourceId: "shared-chargeback",
      operation: "lost_outcome_recorded"
    };
    const lostClosure = {
      kind: "chargeback_state",
      sourceId: "shared-chargeback",
      operation: "lost_allocation_closed"
    };
    expect(serializeFinanceNoPostingEventKey(lostOutcome, postingDecoderEnvelope)).not.toBe(
      serializeFinanceNoPostingEventKey(lostClosure, postingDecoderEnvelope)
    );
  });

  it("rejects a reason that does not match the closed event vocabulary", () => {
    expectPostingError(
      () =>
        createUnverifiedFinanceNoPostingRecipe(
          {
            eventKey: {
              kind: "chargeback_state",
              sourceId: "chargeback-event-1",
              operation: "lost_outcome_recorded"
            },
            reason: "payout_state_only",
            authorityRef,
            operationSnapshotRef: null
          },
          postingDecoderEnvelope
        ),
      "no_posting_reason_mismatch"
    );
    expectPostingError(
      () =>
        createUnverifiedFinanceNoPostingRecipe(
          {
            eventKey: {
              kind: "chargeback_state",
              sourceId: "chargeback-event-closure",
              operation: "lost_allocation_closed"
            },
            reason: "chargeback_outcome_only",
            authorityRef,
            operationSnapshotRef: null
          },
          postingDecoderEnvelope
        ),
      "no_posting_reason_mismatch"
    );
  });

  it("rejects generic or unsupported event identities", () => {
    expectPostingError(
      () =>
        readFinanceNoPostingEventKey(
          { kind: "adjustment", sourceId: "generic-source", operation: "state_changed" },
          postingDecoderEnvelope
        ),
      "source_mismatch"
    );
    expectPostingError(
      () =>
        readFinanceNoPostingEventKey(
          { kind: "chargeback_state", sourceId: "legacy-chargeback", operation: "lost" },
          postingDecoderEnvelope
        ),
      "source_mismatch"
    );
  });

  it("requires the envelope before reading hostile no-posting input", () => {
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
    expect(() =>
      createUnverifiedFinanceNoPostingRecipe(hostile as never, undefined as never)
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "decoder_envelope_required"
      })
    );
    expect(trapCalls).toBe(0);
  });

  it("rejects embedded policy and non-null snapshot authority", () => {
    const input = {
      eventKey: { kind: "payout_state", sourceId: "payout-event-1", operation: "approved" },
      reason: "payout_state_only",
      authorityRef,
      operationSnapshotRef: null
    } as const;
    expectPostingError(
      () =>
        createUnverifiedFinanceNoPostingRecipe(
          { ...input, decoderEnvelope: postingDecoderEnvelope } as never,
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expectPostingError(
      () =>
        createUnverifiedFinanceNoPostingRecipe(
          { ...input, operationSnapshotRef: { selfAuthored: true } } as never,
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });
});
