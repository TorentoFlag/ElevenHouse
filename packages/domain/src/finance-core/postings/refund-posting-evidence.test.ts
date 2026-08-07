import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { FinancePostingIntegrityError } from "./posting-codec";
import {
  assertRefundTerminalEvidenceMatchesAllocation,
  readUnverifiedRefundTerminalEvidenceBinding
} from "./refund-posting-evidence";
import {
  buildConfirmedRefundEvidenceInput,
  buildFailedRefundEvidenceInput,
  withBindingDigest
} from "./refund-posting-evidence-test-fixtures";
import { refundPostingDecoderEnvelope } from "./refund-posting-test-fixtures";

describe("refund terminal composite evidence", () => {
  it.each([
    ["confirmed", buildConfirmedRefundEvidenceInput],
    ["failed", buildFailedRefundEvidenceInput]
  ])("rehydrates and matches the exact %s allocation and Task 5 authority", (_label, fixture) => {
    const input = fixture();

    const binding = readUnverifiedRefundTerminalEvidenceBinding(
      input.binding,
      refundPostingDecoderEnvelope
    );

    expect(binding).toMatchObject({
      authorizationStatus: "unverified",
      digestPurpose: "drift_detection_only",
      providerIntent: {
        intentId: "refund-intent-1",
        operationKind: "refund",
        purpose: "client_order"
      }
    });
    expect(binding).not.toBe(input.binding);
    expect(Object.isFrozen(binding.providerIntent.providerAccount)).toBe(true);
    expect(() =>
      assertRefundTerminalEvidenceMatchesAllocation(
        {
          allocation: input.allocation,
          binding: input.binding,
          terminalAuthority: input.terminalAuthority
        },
        refundPostingDecoderEnvelope
      )
    ).not.toThrow();
  });

  it("rejects pending or unknown provider outcomes before any posting decision", () => {
    for (const status of ["pending_dispatch", "provider_unknown"]) {
      const input = mutableRecord(structuredClone(buildConfirmedRefundEvidenceInput().binding));
      record(input.providerIntent).status = status;
      resignProviderIntent(input);

      expectFinanceError(
        () => readUnverifiedRefundTerminalEvidenceBinding(input, refundPostingDecoderEnvelope),
        "evidence_mismatch"
      );
    }
  });

  const mismatchMutations: readonly [string, (value: Record<string, unknown>) => void, string][] = [
    [
      "deprecated provider environment field",
      (value) => {
        const intent = providerIntent(value);
        intent.providerAccount = {
          ...record(intent.providerAccount),
          environment: "sandbox"
        };
      },
      "invalid_shape"
    ],
    [
      "provider payment",
      (value) => (providerIntent(value).providerPaymentId = "other-payment"),
      "scope_mismatch"
    ],
    [
      "provider intent",
      (value) => (providerIntent(value).intentId = "other-intent"),
      "authority_mismatch"
    ],
    [
      "request digest",
      (value) =>
        (providerIntent(value).canonicalRequestDigest = hashFinanceCommandPayload({
          other: true
        })),
      "authority_mismatch"
    ],
    [
      "refund amount",
      (value) => (record(record(record(value.binding).outcome).refundAmount).amountMinor = 2_499),
      "amount_mismatch"
    ],
    [
      "provider cumulative amount",
      (value) =>
        (record(record(record(value.binding).outcome).nextProviderTotalRefunded).amountMinor =
          2_499),
      "amount_mismatch"
    ],
    [
      "provider evidence reference",
      (value) => (record(providerIntent(value).canonicalEvidence).reference = "other-evidence"),
      "evidence_mismatch"
    ]
  ];

  it.each(mismatchMutations)("rejects mismatched %s", (_label, mutate, reason) => {
    const value = mutableRecord(structuredClone(buildConfirmedRefundEvidenceInput()));
    mutate(value);
    resignProviderIntent(record(value.binding));

    expectFinanceError(
      () =>
        assertRefundTerminalEvidenceMatchesAllocation(
          {
            allocation: value.allocation,
            binding: value.binding,
            terminalAuthority: value.terminalAuthority
          },
          refundPostingDecoderEnvelope
        ),
      reason
    );
  });

  it("rejects detached terminal authority even when the binding is self-consistent", () => {
    const value = mutableRecord(structuredClone(buildConfirmedRefundEvidenceInput()));
    const terminalAuthority = record(value.terminalAuthority);
    terminalAuthority.providerRefundId = "other-provider-refund";
    const binding = record(value.binding);
    record(binding.terminalAuthorityRef).canonicalDigest =
      hashFinanceCommandPayload(terminalAuthority);
    value.binding = withBindingDigest(binding);

    expectFinanceError(
      () =>
        assertRefundTerminalEvidenceMatchesAllocation(
          {
            allocation: value.allocation,
            binding: value.binding,
            terminalAuthority: value.terminalAuthority
          },
          refundPostingDecoderEnvelope
        ),
      "evidence_mismatch"
    );
  });

  it("enforces decimal envelopes and rejects nested proxies before traps execute", () => {
    const value = buildConfirmedRefundEvidenceInput().binding;
    expectFinanceError(
      () =>
        readUnverifiedRefundTerminalEvidenceBinding(
          { ...value, version: "123" },
          { ...refundPostingDecoderEnvelope, maxDecimalDigits: 2 }
        ),
      "decoder_envelope_exceeded"
    );

    let trapCount = 0;
    const hostileAccount = new Proxy(value.providerIntent.providerAccount, {
      ownKeys() {
        trapCount += 1;
        throw new Error("must not execute");
      },
      getPrototypeOf() {
        trapCount += 1;
        throw new Error("must not execute");
      }
    });
    const hostile = {
      ...value,
      providerIntent: { ...value.providerIntent, providerAccount: hostileAccount }
    };
    expectFinanceError(
      () => readUnverifiedRefundTerminalEvidenceBinding(hostile, refundPostingDecoderEnvelope),
      "invalid_shape"
    );
    expect(trapCount).toBe(0);
  });

  it("rejects accessors, unknown keys and stale projection or binding digests", () => {
    const accessor = mutableRecord(structuredClone(buildConfirmedRefundEvidenceInput().binding));
    Object.defineProperty(record(accessor.outcome), "providerRefundId", {
      enumerable: true,
      get: () => "arc-refund-1"
    });
    expectFinanceError(
      () => readUnverifiedRefundTerminalEvidenceBinding(accessor, refundPostingDecoderEnvelope),
      "invalid_shape"
    );

    const unknown = {
      ...buildConfirmedRefundEvidenceInput().binding,
      fallbackOutcome: "succeeded"
    };
    expectFinanceError(
      () => readUnverifiedRefundTerminalEvidenceBinding(unknown, refundPostingDecoderEnvelope),
      "invalid_shape"
    );

    const staleProjection = mutableRecord(
      structuredClone(buildConfirmedRefundEvidenceInput().binding)
    );
    record(staleProjection.providerIntent).providerPaymentId = "other-payment";
    staleProjection.bindingDigest = hashFinanceCommandPayload(
      without(staleProjection, "bindingDigest")
    );
    expectFinanceError(
      () =>
        readUnverifiedRefundTerminalEvidenceBinding(staleProjection, refundPostingDecoderEnvelope),
      "evidence_mismatch"
    );

    const staleBinding = {
      ...buildConfirmedRefundEvidenceInput().binding,
      bindingId: "other-binding"
    };
    expectFinanceError(
      () => readUnverifiedRefundTerminalEvidenceBinding(staleBinding, refundPostingDecoderEnvelope),
      "evidence_mismatch"
    );
  });
});

function resignProviderIntent(binding: Record<string, unknown>): void {
  const intent = record(binding.providerIntent);
  intent.projectionDigest = hashFinanceCommandPayload(without(intent, "projectionDigest"));
  const resigned = withBindingDigest(binding);
  Object.assign(binding, resigned);
}

function providerIntent(value: Record<string, unknown>): Record<string, unknown> {
  return record(record(value.binding).providerIntent);
}

function mutableRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function without(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const result = { ...value };
  delete result[key];
  return result;
}

function expectFinanceError(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected finance error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}
