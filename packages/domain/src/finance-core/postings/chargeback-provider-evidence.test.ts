import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readUnverifiedChargebackProviderEvidenceBinding
} from "./chargeback-provider-evidence";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";

const sourceAuthority = Object.freeze({
  kind: "chargeback_confirmed" as const,
  authorityId: "chargeback-confirmed-authority",
  version: 1,
  confirmationId: "chargeback-confirmation-1",
  restrictionId: "chargeback-restriction-1",
  confirmationKind: "initial" as const,
  amountBasis: "cumulative" as const,
  priorRestrictionVersion: null,
  chargebackCaseId: "chargeback-1",
  orderId: "order-1",
  astrologerUserId: "astrologer-1",
  providerAccount: Object.freeze({
    seriesId: "arc-series-live",
    providerAccountId: "arc-live-1",
    identityVersion: 1
  }),
  providerPaymentId: "payment-1",
  priorCumulativeDisputedAmount: { amountMinor: 0, currency: "RUB" as const },
  nextCumulativeDisputedAmount: { amountMinor: 5_000, currency: "RUB" as const },
  disputedDelta: { amountMinor: 5_000, currency: "RUB" as const },
  canonicalEvidenceId: "chargeback-evidence-1",
  confirmedAt: "2026-08-03T10:00:00Z"
});

function bindingInput(overrides: Record<string, unknown> = {}) {
  const providerEvidenceCore = Object.freeze({
    kind: "arc_payment_chargeback" as const,
    evidenceId: sourceAuthority.canonicalEvidenceId,
    providerAccountId: sourceAuthority.providerAccount.providerAccountId,
    providerPaymentId: sourceAuthority.providerPaymentId,
    amount: sourceAuthority.disputedDelta,
    observedAt: sourceAuthority.confirmedAt
  });
  const core = Object.freeze({
    kind: "unverified_chargeback_provider_evidence_binding" as const,
    schemaVersion: 1 as const,
    bindingId: sourceAuthority.confirmationId,
    version: sourceAuthority.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    principalComponentId: "component-chargeback-principal",
    componentRegistryAuthorityRef: Object.freeze({
      kind: "finance_component_registry" as const,
      authorityId: "component-registry-chargeback-principal",
      version: 1,
      canonicalDigest: sha("a")
    }),
    sourceAuthority,
    sourceAuthorityDigest: hashFinanceCommandPayload(sourceAuthority),
    operationReceiptId: "receipt-chargeback-confirmed",
    operationReceiptDigest: sha("b"),
    providerEvidence: Object.freeze({
      ...providerEvidenceCore,
      canonicalDigest: hashFinanceCommandPayload(providerEvidenceCore)
    }),
    ...overrides
  });
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}

function expectPostingError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected posting integrity error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}

describe("chargeback provider evidence binding", () => {
  it("binds the canonical ArcPay principal fact to Task5 authority and receipt identity", () => {
    const input = bindingInput();
    const decoded = readUnverifiedChargebackProviderEvidenceBinding(input, postingDecoderEnvelope);
    expect(decoded).toEqual(input);
    expect(decoded.authorizationStatus).toBe("unverified");
    expect(decoded.atomicityStatus).toBe("unverified");
    expect(Object.isFrozen(decoded.providerEvidence)).toBe(true);
  });

  it.each([
    ["binding identity", { bindingId: "caller-command-id" }],
    [
      "provider account",
      { providerEvidence: { ...bindingInput().providerEvidence, providerAccountId: "arc-other" } }
    ],
    [
      "provider payment",
      {
        providerEvidence: { ...bindingInput().providerEvidence, providerPaymentId: "payment-other" }
      }
    ],
    [
      "principal amount",
      {
        providerEvidence: {
          ...bindingInput().providerEvidence,
          amount: { amountMinor: 4_999, currency: "RUB" }
        }
      }
    ],
    [
      "evidence identity",
      { providerEvidence: { ...bindingInput().providerEvidence, evidenceId: "evidence-other" } }
    ],
    [
      "observation time",
      {
        providerEvidence: { ...bindingInput().providerEvidence, observedAt: "2026-08-03T10:01:00Z" }
      }
    ]
  ])("rejects mismatched %s", (_label, override) => {
    expectPostingError(
      () =>
        readUnverifiedChargebackProviderEvidenceBinding(
          bindingInput(override),
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });

  it("requires the exact provider and component-registry vocabularies", () => {
    expectPostingError(
      () =>
        readUnverifiedChargebackProviderEvidenceBinding(
          bindingInput({
            providerEvidence: { ...bindingInput().providerEvidence, kind: "provider_unknown" }
          }),
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
    expectPostingError(
      () =>
        readUnverifiedChargebackProviderEvidenceBinding(
          bindingInput({
            componentRegistryAuthorityRef: {
              ...bindingInput().componentRegistryAuthorityRef,
              kind: "caller_component"
            }
          }),
          postingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("rejects a nested Proxy before executing its get trap", () => {
    let trapCalls = 0;
    const providerEvidence = new Proxy(bindingInput().providerEvidence, {
      get(target, property, receiver) {
        trapCalls += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    expectPostingError(
      () =>
        readUnverifiedChargebackProviderEvidenceBinding(
          bindingInput({ providerEvidence }),
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(trapCalls).toBe(0);
  });

  it("detects source-authority and binding digest drift", () => {
    expectPostingError(
      () =>
        readUnverifiedChargebackProviderEvidenceBinding(
          bindingInput({ sourceAuthorityDigest: sha("d") }),
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
    expectPostingError(
      () =>
        readUnverifiedChargebackProviderEvidenceBinding(
          { ...bindingInput(), bindingDigest: sha("e") },
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });

  it("rejects a self-consistent outer binding when the provider fact digest is forged", () => {
    const input = bindingInput();
    expectPostingError(
      () =>
        readUnverifiedChargebackProviderEvidenceBinding(
          bindingInput({
            providerEvidence: {
              ...input.providerEvidence,
              canonicalDigest: sha("c")
            }
          }),
          postingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });
});
