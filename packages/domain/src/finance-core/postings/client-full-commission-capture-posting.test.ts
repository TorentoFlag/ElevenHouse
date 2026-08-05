import { describe, expect, it } from "vitest";

import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createOrderEconomicsSnapshot } from "../order-economics";
import {
  buildClientFullCommissionCapturePosting,
  type ClientFullCommissionCaptureAuthority
} from "./client-full-commission-capture-posting";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";

type AuthorityCore = Omit<ClientFullCommissionCaptureAuthority, "canonicalDigest">;

describe("client full-commission capture posting", () => {
  it("posts gross provider clearing entirely to platform commission without a wallet row", () => {
    const input = validInput();
    const result = build(input);

    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      transaction: {
        sourceKey: { kind: "order", sourceId: "order-full-commission", operation: "sale_captured" },
        entries: [
          {
            account: {
              code: "arc_provider_clearing",
              arcProviderAccountId: "arc-live",
              currency: "RUB"
            },
            side: "debit",
            amount: { amountMinor: 10_000, currency: "RUB" }
          },
          {
            account: { code: "platform_commission_deferred", currency: "RUB" },
            side: "credit",
            amount: { amountMinor: 10_000, currency: "RUB" }
          }
        ]
      }
    });
    expect(result.transaction.entries.map((entry) => entry.links)).toEqual([
      links("component-provider-clearing"),
      links("component-platform-commission")
    ]);
    expect(
      result.transaction.entries.some((entry) => entry.account.code === "astrologer_pending")
    ).toBe(false);
    expect(result.linkProof).toMatchObject({
      allocationAuthorityRef: {
        kind: "client_full_commission_capture_authority",
        authorityId: "full-commission-authority-1",
        version: 1,
        canonicalDigest: input.authority.canonicalDigest
      },
      sourceEvidenceRef: {
        kind: "canonical_client_order_capture",
        evidenceId: "capture-fact-1",
        canonicalDigest: input.authority.evidence.canonicalDigest
      },
      operationSnapshotRef: null
    });
  });

  it("requires the immutable economics to allocate exactly 10000 bps and zero payable", () => {
    const input = validInput();
    const economics = createOrderEconomicsSnapshot({
      ...input.authority.orderEconomics,
      commission: { amountMinor: 9_999, currency: "RUB" },
      payable: { amountMinor: 1, currency: "RUB" },
      commissionBps: 9_999
    });

    expectPostingError(
      () => build(rebind(input, { orderEconomics: economics })),
      "amount_mismatch"
    );
  });

  it("rejects capture correlation, chronology and component identity drift", () => {
    const input = validInput();
    expectPostingError(
      () =>
        build(
          rebind(input, {
            evidence: { ...input.authority.evidence, providerPaymentId: "another-payment" }
          })
        ),
      "evidence_mismatch"
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
    expectPostingError(
      () =>
        build({
          ...input,
          context: { ...input.context, postedAt: "2026-08-03T09:59:59Z" }
        }),
      "invalid_chronology"
    );
    expectPostingError(
      () => build(rebind(input, { platformCommissionComponentId: "component-provider-clearing" })),
      "authority_mismatch"
    );
  });

  it("rejects wallet-shaped fields, forged digests and a missing decoder envelope", () => {
    const input = validInput();
    expectPostingError(
      () =>
        buildClientFullCommissionCapturePosting(
          { ...input, operationReceipt: {} } as never,
          postingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expectPostingError(
      () => build({ ...input, authority: { ...input.authority, canonicalDigest: sha("f") } }),
      "authority_mismatch"
    );
    expectPostingError(
      () => buildClientFullCommissionCapturePosting(input, undefined as never),
      "decoder_envelope_required"
    );
  });
});

function build(input: ReturnType<typeof validInput>) {
  return buildClientFullCommissionCapturePosting(input, postingDecoderEnvelope);
}

function validInput() {
  const orderEconomics = createOrderEconomicsSnapshot({
    orderId: "order-full-commission",
    astrologerUserId: "astrologer-1",
    planId: "full-platform",
    planVersionId: "full-platform-v1",
    gross: { amountMinor: 10_000, currency: "RUB" },
    commission: { amountMinor: 10_000, currency: "RUB" },
    payable: { amountMinor: 0, currency: "RUB" },
    commissionBps: 10_000,
    allocationRevision: "bps_half_up_v1"
  });
  const evidenceCore = {
    kind: "canonical_client_order_capture" as const,
    schemaVersion: 1 as const,
    evidenceId: "capture-fact-1",
    version: 1,
    orderId: orderEconomics.orderId,
    intentId: "intent-1",
    intentVersion: 5,
    providerAccountSeriesId: "arc-series",
    providerAccountId: "arc-live",
    providerIdentityVersion: 2,
    providerPaymentId: "arc-payment-1",
    amount: orderEconomics.gross,
    capturedAt: "2026-08-03T10:00:00Z",
    observedAt: "2026-08-03T10:00:00Z",
    digestPurpose: "drift_detection_only" as const
  };
  const evidence = { ...evidenceCore, canonicalDigest: hashFinanceCommandPayload(evidenceCore) };
  const authorityCore = {
    kind: "client_full_commission_capture_authority" as const,
    schemaVersion: 1 as const,
    authorityId: "full-commission-authority-1",
    version: 1,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationId: "capture-operation-1",
    providerClearingComponentId: "component-provider-clearing",
    platformCommissionComponentId: "component-platform-commission",
    orderEconomics,
    evidence
  } satisfies AuthorityCore;
  const authority = {
    ...authorityCore,
    canonicalDigest: hashFinanceCommandPayload(authorityCore)
  } satisfies ClientFullCommissionCaptureAuthority;
  return {
    context: {
      journalTransactionId: "journal-full-commission-1",
      linkProofId: "proof-full-commission-1",
      operationId: authority.operationId,
      sourceKey: {
        kind: "order" as const,
        sourceId: orderEconomics.orderId,
        operation: "sale_captured" as const
      },
      occurredAt: evidence.capturedAt,
      postedAt: evidence.observedAt
    },
    authority
  };
}

function rebind(
  input: ReturnType<typeof validInput>,
  change: Partial<Omit<ClientFullCommissionCaptureAuthority, "canonicalDigest">>
) {
  const authorityCore = { ...input.authority, canonicalDigest: undefined, ...change };
  delete authorityCore.canonicalDigest;
  return {
    ...input,
    authority: {
      ...authorityCore,
      canonicalDigest: hashFinanceCommandPayload(authorityCore)
    } as ClientFullCommissionCaptureAuthority
  };
}

function links(componentId: string) {
  return {
    originalSaleId: "order-full-commission",
    componentId,
    payableLotId: null,
    payoutAllocationId: null
  };
}
