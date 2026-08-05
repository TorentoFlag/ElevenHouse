import { describe, expect, it } from "vitest";
import { receiptDecoderEnvelope } from "./chargeback-confirmed-posting-test-fixtures";
import {
  chargebackLostAllocationClosureFixture,
  rehashLostClosureAuthority
} from "./chargeback-lost-closure-test-fixture";
import { buildChargebackLostAllocationClosureNoPosting } from "./chargeback-lost-closure-posting";
import { buildChargebackLostResolutionNoPosting } from "./chargeback-resolution-lost-posting";
import { chargebackLostResolutionFixture } from "./chargeback-resolution-posting-test-fixtures";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope } from "./posting-test-primitives";

describe("chargeback lost allocation closure", () => {
  it("uses a distinct deterministic operation and links the immutable first lost outcome", () => {
    const first = chargebackLostResolutionFixture();
    const initial = buildChargebackLostResolutionNoPosting(
      first,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    const input = chargebackLostAllocationClosureFixture();
    const closed = buildChargebackLostAllocationClosureNoPosting(
      input,
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );

    expect(initial.eventKey).toEqual({
      kind: "chargeback_state",
      sourceId: input.authority.chargebackCaseId,
      operation: "lost_outcome_recorded"
    });
    expect(closed).toMatchObject({
      kind: "no_posting",
      eventKey: {
        kind: "chargeback_state",
        sourceId: input.authority.chargebackCaseId,
        operation: "lost_allocation_closed"
      },
      reason: "chargeback_state_only"
    });
    expect(closed.eventKey).not.toEqual(initial.eventKey);
    expect(input.authority.initialLostOutcomeRef).toEqual(
      input.resolvedPriorLostResolutionAuthority.outcomeEvidenceRef
    );
  });

  it("rejects closure without the exact prior resolution or its original outcome evidence", () => {
    const input = chargebackLostAllocationClosureFixture();
    const authority = rehashLostClosureAuthority({
      ...input.authority,
      priorLostResolutionRef: {
        ...input.authority.priorLostResolutionRef,
        authorityId: "foreign-lost-resolution"
      }
    });
    expectPostingError(
      () =>
        buildChargebackLostAllocationClosureNoPosting(
          { ...input, authority },
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        buildChargebackLostAllocationClosureNoPosting(
          {
            ...input,
            initialLostOutcomeEvidence: {
              ...input.initialLostOutcomeEvidence,
              evidenceId: input.authority.sourceAuthority.canonicalEvidenceId
            }
          },
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });

  it("requires exact Task5 lost_allocation_closed transition evidence", () => {
    const input = chargebackLostAllocationClosureFixture();
    expectPostingError(
      () =>
        buildChargebackLostAllocationClosureNoPosting(
          {
            ...input,
            restrictionTransition: {
              ...input.restrictionTransition,
              operationKey: {
                ...input.restrictionTransition.operationKey,
                operation: "lost_final"
              }
            }
          },
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });
});
