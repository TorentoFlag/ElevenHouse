import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createChargebackRecoveryCollectionAuthority } from "../source-lots";
import { assertChargebackRecoveryHistoryFresh } from "./chargeback-recovery-prior-history";
import { receiptDecoderEnvelope } from "./chargeback-confirmed-posting-test-fixtures";
import { buildChargebackRecoveryCollectionPosting } from "./chargeback-recovery-posting";
import {
  chargebackRecoveryPostingFixtures,
  rehashRecoveryAuthority
} from "./chargeback-recovery-posting-test-fixtures";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope } from "./posting-test-primitives";

describe("chargeback recovery prior history", () => {
  it("rejects an exact R1 collection/receipt/source replay disguised as posting version 2", () => {
    const { first } = chargebackRecoveryPostingFixtures();
    const exposure = first.authority.exposures[0]!;
    const authority = rehashRecoveryAuthority({
      ...first.authority,
      version: 2,
      priorAuthorityRef: {
        kind: first.authority.kind,
        authorityId: first.authority.authorityId,
        version: first.authority.version,
        canonicalDigest: first.authority.canonicalDigest
      },
      exposures: [
        {
          ...exposure,
          priorCollectedAmount: exposure.nextCollectedAmount,
          nextCollectedAmount: {
            amountMinor:
              exposure.nextCollectedAmount.amountMinor + exposure.collectionDelta.amountMinor,
            currency: "RUB"
          }
        }
      ]
    });

    expectPostingError(
      () =>
        buildChargebackRecoveryCollectionPosting(
          { ...first, authority, resolvedPriorAuthorities: [first.authority] },
          postingDecoderEnvelope,
          receiptDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("accepts a complete contiguous unique prior history", () => {
    const { second } = chargebackRecoveryPostingFixtures();
    expect(
      buildChargebackRecoveryCollectionPosting(
        second,
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      ).kind
    ).toBe("journal");
  });

  it("rejects non-adjacent reuse of accounting allocation and evidence identities", () => {
    const { first, second } = chargebackRecoveryPostingFixtures();
    const priorSource = second.authority.sourceAuthority;
    const sourceAuthority = createChargebackRecoveryCollectionAuthority({
      ...priorSource,
      authorityId: "recovery-source-authority-3",
      recoveryCollectionId: "recovery-collection-3",
      collectedPayableAmount: { amountMinor: 100, currency: "RUB" },
      accountingAllocationId: first.authority.sourceAuthority.accountingAllocationId,
      canonicalEvidenceId: first.authority.sourceAuthority.canonicalEvidenceId,
      collectedAt: "2026-08-15T00:00:00Z"
    });
    const exposure = second.authority.exposures[0]!;
    const third = rehashRecoveryAuthority({
      ...second.authority,
      authorityId: sourceAuthority.recoveryCollectionId,
      version: 3,
      sourceAuthority,
      sourceAuthorityDigest: hashFinanceCommandPayload(sourceAuthority),
      priorAuthorityRef: {
        kind: second.authority.kind,
        authorityId: second.authority.authorityId,
        version: second.authority.version,
        canonicalDigest: second.authority.canonicalDigest
      },
      operationReceiptId: "recovery-receipt-3",
      collectionTotal: sourceAuthority.collectedPayableAmount,
      exposures: [
        {
          ...exposure,
          priorCollectedAmount: exposure.nextCollectedAmount,
          collectionDelta: sourceAuthority.collectedPayableAmount,
          nextCollectedAmount: { amountMinor: 450, currency: "RUB" }
        }
      ],
      collectionRows: [
        { ...second.authority.collectionRows[0]!, amount: sourceAuthority.collectedPayableAmount }
      ],
      collectedAt: sourceAuthority.collectedAt
    });

    expectPostingError(
      () =>
        assertChargebackRecoveryHistoryFresh([first.authority, second.authority, third] as never),
      "authority_mismatch"
    );
  });
});
