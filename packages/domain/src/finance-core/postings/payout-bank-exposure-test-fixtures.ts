import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { UnverifiedPayoutBankExposureTransitionBinding } from "./payout-bank-exposure-types";
import { sha } from "./posting-test-primitives";

type ExposureFixture = UnverifiedPayoutBankExposureTransitionBinding;

export function payoutExposureBindingFixture(
  options: {
    readonly previous?: ExposureFixture | null;
    readonly transitionKind?: string;
    readonly exposureVersion?: string;
    readonly status?: string;
    readonly occurredAt?: string;
    readonly overrides?: Readonly<Record<string, unknown>>;
  } = {}
): ExposureFixture {
  const previous = options.previous ?? null;
  const exposureVersion = options.exposureVersion ?? "1";
  const core = {
    kind: "unverified_payout_bank_exposure_transition_binding",
    schemaVersion: 1,
    bindingId: `payout-exposure-binding-${exposureVersion}`,
    authorizationStatus: "unverified",
    atomicityStatus: "unverified",
    digestPurpose: "drift_detection_only",
    bankExposureId: "payout-bank-exposure-1",
    payoutRequestId: "payout-request-1",
    astrologerUserId: "astrologer-1",
    beneficiarySnapshot: {
      snapshotId: "payout-beneficiary-snapshot-1",
      schemaVersion: 1,
      fingerprint: "beneficiary-fingerprint-1",
      canonicalDigest: sha("b")
    },
    bankCashPoolId: "bank-cash-pool-1",
    amount: { amountMinor: 900_000, currency: "RUB" },
    approvedByActorUserId: "finance-approver-1",
    transitionKind: options.transitionKind ?? "approval_committed",
    previousBindingRef:
      previous === null
        ? null
        : {
            bindingId: previous.bindingId,
            exposureVersion: previous.exposureVersion,
            status: previous.status,
            bindingDigest: previous.bindingDigest
          },
    exposureVersion,
    status: options.status ?? "committed",
    transitionAuthorityRef: {
      kind: `payout_${options.transitionKind ?? "approval_committed"}`,
      authorityId: `payout-authority-${exposureVersion}`,
      version: 1,
      canonicalDigest: sha("a")
    },
    occurredAt: options.occurredAt ?? "2026-08-03T10:00:00Z",
    ...options.overrides
  };
  return Object.freeze({
    ...core,
    bindingDigest: hashFinanceCommandPayload(core)
  }) as unknown as ExposureFixture;
}

export function rehashPayoutExposureBinding(
  binding: Readonly<Record<string, unknown>>
): ExposureFixture {
  const core = Object.fromEntries(
    Object.entries(binding).filter(([key]) => key !== "bindingDigest")
  );
  return Object.freeze({
    ...core,
    bindingDigest: hashFinanceCommandPayload(core)
  }) as ExposureFixture;
}

export function exposureBindingReadInput(
  binding: ExposureFixture,
  previousBinding: ExposureFixture | null
) {
  return { binding, previousBinding };
}
