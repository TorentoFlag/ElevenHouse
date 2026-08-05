import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";
import {
  buildPlatformTariffInvoiceCapturePosting,
  type PlatformTariffInvoiceCaptureAuthority
} from "./platform-tariff-invoice-posting";

type InvoiceInput = Parameters<typeof buildPlatformTariffInvoiceCapturePosting>[0];
type InvoiceAuthorityCore = Omit<PlatformTariffInvoiceCaptureAuthority, "canonicalDigest">;

describe("platform tariff invoice capture posting", () => {
  it("posts provider clearing to subscription deferred from strict capture evidence", () => {
    const input = invoiceInput();
    const result = build(input);

    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expect(result.transaction).toMatchObject({
      sourceKey: { kind: "platform_invoice", sourceId: "invoice-1", operation: "captured" },
      entries: [
        {
          account: {
            code: "arc_provider_clearing",
            arcProviderAccountId: "arc-live",
            currency: "RUB"
          },
          side: "debit",
          amount: { amountMinor: 2_500, currency: "RUB" }
        },
        {
          account: { code: "platform_subscription_deferred", currency: "RUB" },
          side: "credit",
          amount: { amountMinor: 2_500, currency: "RUB" }
        }
      ]
    });
    expect(result.transaction.entries.every((entry) => allLinksNull(entry.links))).toBe(true);
    expect(result.linkProof).toMatchObject({
      allocationAuthorityRef: {
        kind: "platform_tariff_invoice_capture_authority",
        authorityId: "invoice-authority-1",
        version: 3,
        canonicalDigest: input.authority.canonicalDigest
      },
      sourceEvidenceRef: {
        kind: "canonical_platform_invoice_capture",
        evidenceId: "invoice-capture-evidence-1",
        canonicalDigest: input.authority.evidence.canonicalDigest
      },
      operationSnapshotRef: null
    });
  });

  it("does not accept a wallet receipt or caller-authored snapshot", () => {
    const input = invoiceInput();
    expectPostingError(
      () =>
        buildPlatformTariffInvoiceCapturePosting(
          { ...input, operationReceipt: {} } as never,
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expectPostingError(
      () =>
        buildPlatformTariffInvoiceCapturePosting(
          { ...input, operationSnapshotRef: {} } as never,
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
  });

  it("requires versioned self-consistent authority and evidence", () => {
    const input = invoiceInput();
    expectPostingError(
      () => build({ ...input, authority: { ...input.authority, version: 0 } }),
      "invalid_version"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          authority: {
            ...input.authority,
            evidence: { ...input.authority.evidence, canonicalDigest: sha("e") }
          }
        }),
      "evidence_mismatch"
    );
    expectPostingError(
      () => build({ ...input, authority: { ...input.authority, canonicalDigest: sha("a") } }),
      "authority_mismatch"
    );
  });

  it.each([
    ["source", { invoiceId: "another-invoice" }, "source_mismatch"],
    ["provider", { providerAccountId: "another-provider" }, "scope_mismatch"],
    ["amount", { amount: { amountMinor: 2_501, currency: "RUB" } }, "amount_mismatch"]
  ] as const)("rejects %s correlation drift", (_label, evidenceChange, reason) => {
    const input = invoiceInput();
    const evidence = bindEvidence({ ...input.authority.evidence, ...evidenceChange });
    expectPostingError(() => build(bindAuthority(input, { evidence })), reason);
  });

  it("requires natural invoice source and capture chronology", () => {
    const input = invoiceInput();
    expectPostingError(
      () => build({ ...input, context: { ...input.context, operationId: "command-id" } }),
      "source_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          context: {
            ...input.context,
            sourceKey: { ...input.context.sourceKey, sourceId: "other" }
          }
        }),
      "source_mismatch"
    );
    const lateEvidence = bindEvidence({
      ...input.authority.evidence,
      observedAt: "2026-08-03T10:05:00Z"
    });
    expectPostingError(
      () => build(bindAuthority(input, { evidence: lateEvidence })),
      "invalid_chronology"
    );
  });

  it("normalizes the OOB envelope before touching hostile target input", () => {
    const hostile = hostileProxy({});
    expectPostingError(
      () => buildPlatformTariffInvoiceCapturePosting(hostile.value as never, undefined as never),
      "decoder_envelope_required"
    );
    expect(hostile.trapCalls()).toBe(0);
  });

  it("rejects nested Proxy and accessor without executing traps or getters", () => {
    const input = invoiceInput();
    const hostile = hostileProxy(input.authority.evidence.amount);
    expectPostingError(
      () =>
        build({
          ...input,
          authority: {
            ...input.authority,
            evidence: { ...input.authority.evidence, amount: hostile.value }
          }
        }),
      "invalid_shape"
    );
    expect(hostile.trapCalls()).toBe(0);

    const accessorInput = structuredClone(input);
    let getterCalls = 0;
    Object.defineProperty(accessorInput.authority.evidence, "amount", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error("must not run getter");
      }
    });
    expectPostingError(() => build(accessorInput), "invalid_shape");
    expect(getterCalls).toBe(0);
  });
});

function build(input: InvoiceInput) {
  return buildPlatformTariffInvoiceCapturePosting(input, postingDecoderEnvelope);
}

function invoiceInput(): InvoiceInput {
  const evidence = bindEvidence({
    kind: "canonical_platform_invoice_capture" as const,
    schemaVersion: 1 as const,
    evidenceId: "invoice-capture-evidence-1",
    version: 2,
    invoiceId: "invoice-1",
    intentId: "intent-invoice-1",
    intentVersion: 4,
    providerAccountId: "arc-live",
    providerPaymentId: "arc-payment-invoice-1",
    amount: { amountMinor: 2_500, currency: "RUB" as const },
    capturedAt: "2026-08-03T10:00:00Z",
    observedAt: "2026-08-03T10:00:01Z",
    digestPurpose: "drift_detection_only" as const
  });
  const base = {
    context: {
      journalTransactionId: "journal-invoice-1",
      linkProofId: "proof-invoice-1",
      operationId: "invoice-operation-1",
      sourceKey: {
        kind: "platform_invoice" as const,
        sourceId: "invoice-1",
        operation: "captured" as const
      },
      occurredAt: evidence.capturedAt,
      postedAt: evidence.observedAt
    }
  };
  return bindAuthority(base, { evidence });
}

function bindEvidence(
  input:
    | PlatformTariffInvoiceCaptureAuthority["evidence"]
    | Omit<PlatformTariffInvoiceCaptureAuthority["evidence"], "canonicalDigest">
) {
  const { canonicalDigest: discardedDigest, ...core } =
    input as PlatformTariffInvoiceCaptureAuthority["evidence"];
  void discardedDigest;
  return { ...core, canonicalDigest: hashFinanceCommandPayload(core) };
}

function bindAuthority(
  input: { context: InvoiceInput["context"] },
  change: Partial<InvoiceAuthorityCore> & Pick<InvoiceAuthorityCore, "evidence">
): InvoiceInput {
  const core = {
    kind: "platform_tariff_invoice_capture_authority" as const,
    schemaVersion: 1 as const,
    authorityId: "invoice-authority-1",
    version: 3,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationId: "invoice-operation-1",
    invoiceId: "invoice-1",
    astrologerUserId: "astrologer-1",
    planId: "pro",
    planVersionId: "pro-v7",
    amount: { amountMinor: 2_500, currency: "RUB" as const },
    providerAccountId: "arc-live",
    ...change
  } satisfies InvoiceAuthorityCore;
  return { ...input, authority: { ...core, canonicalDigest: hashFinanceCommandPayload(core) } };
}

function allLinksNull(links: Record<string, string | null>) {
  return Object.values(links).every((value) => value === null);
}

function hostileProxy<T extends object>(target: T) {
  let trapCalls = 0;
  const trap = () => {
    trapCalls += 1;
    throw new Error("must not execute Proxy trap");
  };
  return {
    value: new Proxy(target, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap
    }),
    trapCalls: () => trapCalls
  };
}
