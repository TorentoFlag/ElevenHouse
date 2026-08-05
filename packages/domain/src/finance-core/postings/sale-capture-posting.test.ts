import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createOrderEconomicsSnapshot } from "../order-economics";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { receiptDecoderEnvelope } from "./payable-lot-posting-link-test-fixtures";
import { expectPostingError } from "./posting-test-assertions";
import { postingDecoderEnvelope } from "./posting-test-primitives";
import {
  buildClientSaleCapturePosting,
  type SaleCapturePostingAuthority
} from "./sale-capture-posting";

describe("client sale capture posting", () => {
  it("posts exact G=P+C rows and binds the Task5 receipt, economics and components", () => {
    const input = saleInput();
    const result = build(input);

    expect(result).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expect(result.transaction.entries).toEqual([
      {
        account: {
          code: "arc_provider_clearing",
          arcProviderAccountId: "arc-account-live",
          currency: "RUB"
        },
        side: "debit",
        amount: { amountMinor: 10_000, currency: "RUB" },
        links: {
          originalSaleId: "order-receipt-payout",
          componentId: "component-provider-clearing",
          payableLotId: null,
          payoutAllocationId: null
        }
      },
      {
        account: {
          code: "astrologer_pending",
          astrologerUserId: "astrologer-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 9_600, currency: "RUB" },
        links: {
          originalSaleId: "order-receipt-payout",
          componentId: "component-payable",
          payableLotId: "lot-order-receipt-payout",
          payoutAllocationId: null
        }
      },
      {
        account: { code: "platform_commission_deferred", currency: "RUB" },
        side: "credit",
        amount: { amountMinor: 400, currency: "RUB" },
        links: {
          originalSaleId: "order-receipt-payout",
          componentId: "component-platform-commission",
          payableLotId: null,
          payoutAllocationId: null
        }
      }
    ]);
    expect(result.transaction.sourceKey).toEqual(input.context.sourceKey);
    expect(result.linkProof.sourceEvidenceRef).toEqual({
      kind: "payable_lot_operation_receipt",
      evidenceId: input.operationReceipt.receiptId,
      canonicalDigest: input.operationReceipt.canonicalDigest
    });
    expect(result.linkProof.edges.map((edge) => edge.semanticEdgeId)).toEqual([
      null,
      `${input.operationReceipt.operationId}:effect:1`,
      null
    ]);
    expect(result.linkProof.allocationAuthorityRef).toEqual({
      kind: "sale_capture_posting_authority",
      authorityId: "sale-authority-1",
      version: 1,
      canonicalDigest: input.authority.canonicalDigest
    });
    expect(Object.isFrozen(result.transaction.entries)).toBe(true);
  });

  it("supports an approved zero-commission tariff without inventing a zero journal row", () => {
    const input = saleInput();
    const economics = createOrderEconomicsSnapshot({
      ...input.authority.orderEconomics,
      commission: { amountMinor: 0, currency: "RUB" },
      payable: { amountMinor: 9_600, currency: "RUB" },
      gross: { amountMinor: 9_600, currency: "RUB" },
      commissionBps: 0
    });
    const receipt = receiptWithPayable(9_600);
    const rebound = bindSaleInput(
      { ...input, operationReceipt: receipt },
      { orderEconomics: economics }
    );

    expect(build(rebound).transaction.entries.map((entry) => entry.account.code)).toEqual([
      "arc_provider_clearing",
      "astrologer_pending"
    ]);
  });

  it.each([
    ["payable", { commission: 500, payable: 9_500, commissionBps: 500 }],
    ["order", { orderId: "another-order" }],
    ["owner", { astrologerUserId: "another-astrologer" }]
  ] as const)("rejects %s economics drift from the receipt", (_label, rawChange) => {
    const change: Partial<{
      orderId: string;
      astrologerUserId: string;
      commission: number;
      payable: number;
      commissionBps: number;
    }> = rawChange;
    const input = saleInput();
    const economics = createOrderEconomicsSnapshot({
      ...input.authority.orderEconomics,
      ...(change.orderId ? { orderId: change.orderId } : {}),
      ...(change.astrologerUserId ? { astrologerUserId: change.astrologerUserId } : {}),
      ...(change.commission
        ? {
            commission: { amountMinor: change.commission, currency: "RUB" },
            payable: { amountMinor: change.payable, currency: "RUB" },
            commissionBps: change.commissionBps
          }
        : {})
    });

    expectPostingError(
      () => build(bindSaleInput(input, { orderEconomics: economics })),
      change.orderId
        ? "source_mismatch"
        : change.astrologerUserId
          ? "scope_mismatch"
          : "amount_mismatch"
    );
  });

  it("rejects duplicate authority-issued component identities", () => {
    const input = saleInput();
    expectPostingError(
      () =>
        build(
          bindSaleInput(input, {
            platformCommissionComponentId: "component-payable"
          })
        ),
      "authority_mismatch"
    );
  });

  it("rejects forged bindings, authority digest and operation snapshot", () => {
    const input = saleInput();
    const forgedBindings = structuredClone(input.componentBindings);
    forgedBindings[0]!.componentId = "forged-component";
    expectPostingError(
      () => build({ ...input, componentBindings: forgedBindings }),
      "proof_operation_receipt_mismatch"
    );
    expectPostingError(
      () => build({ ...input, authority: { ...input.authority, canonicalDigest: sha("f") } }),
      "authority_mismatch"
    );
    expectPostingError(
      () =>
        build({
          ...input,
          operationSnapshotRef: {
            ...input.operationSnapshotRef,
            historyRecordDigest: sha("e")
          }
        }),
      "proof_operation_receipt_mismatch"
    );
  });

  it("requires natural order source identity and receipt chronology", () => {
    const input = saleInput();
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
            sourceKey: { ...input.context.sourceKey, sourceId: "another-order" }
          }
        }),
      "source_mismatch"
    );
    expectPostingError(
      () => build({ ...input, context: { ...input.context, occurredAt: "2026-08-02T00:00:00Z" } }),
      "invalid_chronology"
    );
  });

  it("normalizes both OOB envelopes before touching a hostile target", () => {
    const hostile = hostileProxy({});
    expectPostingError(
      () =>
        buildClientSaleCapturePosting(
          hostile.value as never,
          undefined as never,
          receiptDecoderEnvelope
        ),
      "decoder_envelope_required"
    );
    expectPostingError(
      () =>
        buildClientSaleCapturePosting(
          hostile.value as never,
          postingDecoderEnvelope,
          undefined as never
        ),
      "proof_operation_receipt_mismatch"
    );
    expect(hostile.trapCalls()).toBe(0);
  });

  it("rejects nested Proxy, accessor and sparse bindings before executing them", () => {
    const input = saleInput();
    const hostile = hostileProxy(input.authority.orderEconomics);
    expectPostingError(
      () => build({ ...input, authority: { ...input.authority, orderEconomics: hostile.value } }),
      "invalid_shape"
    );
    expect(hostile.trapCalls()).toBe(0);

    const accessorInput = structuredClone(input);
    let getterCalls = 0;
    Object.defineProperty(accessorInput.authority.orderEconomics, "gross", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error("must not run getter");
      }
    });
    expectPostingError(() => build(accessorInput), "invalid_shape");
    expect(getterCalls).toBe(0);

    const sparse = new Array(input.componentBindings.length);
    expectPostingError(() => build({ ...input, componentBindings: sparse }), "invalid_shape");
  });
});

function build(input: ReturnType<typeof saleInput>) {
  return buildClientSaleCapturePosting(input, postingDecoderEnvelope, receiptDecoderEnvelope);
}

function saleInput() {
  return bindSaleInput(baseSaleInput(), {});
}

function baseSaleInput() {
  const receiptCase = buildReceiptTransitionCases().find(({ kind }) => kind === "sale_capture");
  if (!receiptCase) throw new Error("missing sale receipt fixture");
  const operationReceipt = createPayableLotOperationReceipt(receiptCase.transition);
  return {
    context: {
      journalTransactionId: "journal-sale-1",
      linkProofId: "proof-sale-1",
      operationId: operationReceipt.operationId,
      sourceKey: operationReceipt.sourceKey,
      occurredAt: operationReceipt.occurredAt,
      postedAt: operationReceipt.occurredAt
    },
    operationReceipt,
    componentBindings: componentBindings(operationReceipt),
    operationSnapshotRef: {
      snapshotId: "snapshot-sale-1",
      operationId: operationReceipt.operationId,
      sourceKey: operationReceipt.sourceKey,
      previousWalletRevision: "40",
      nextWalletRevision: "41",
      previousLotStateDigest: operationReceipt.previousLotState.digest,
      nextLotStateDigest: operationReceipt.nextLotState.digest,
      historyRecordDigest: operationReceipt.historyRecord.canonicalDigest,
      snapshotDigest: sha("4")
    }
  };
}

function bindSaleInput(
  input: ReturnType<typeof baseSaleInput>,
  change: Partial<Omit<SaleCapturePostingAuthority, "canonicalDigest">>
) {
  const operationReceipt = input.operationReceipt;
  const bindings = input.componentBindings;
  const orderEconomics =
    change.orderEconomics ??
    createOrderEconomicsSnapshot({
      orderId: "order-receipt-payout",
      astrologerUserId: "astrologer-1",
      planId: "start",
      planVersionId: "start-v3",
      gross: { amountMinor: 10_000, currency: "RUB" },
      commission: { amountMinor: 400, currency: "RUB" },
      payable: { amountMinor: 9_600, currency: "RUB" },
      commissionBps: 400,
      allocationRevision: "bps_half_up_v1"
    });
  const core = {
    kind: "sale_capture_posting_authority" as const,
    schemaVersion: 1 as const,
    authorityId: "sale-authority-1",
    version: 1,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationId: operationReceipt.operationId,
    operationReceiptId: operationReceipt.receiptId,
    operationReceiptDigest: operationReceipt.canonicalDigest as `sha256:${string}`,
    componentBindingsDigest: hashFinanceCommandPayload(bindings),
    providerClearingComponentId: "component-provider-clearing",
    platformCommissionComponentId: "component-platform-commission",
    orderEconomics,
    ...change
  } satisfies Omit<SaleCapturePostingAuthority, "canonicalDigest">;
  return {
    ...input,
    operationReceipt,
    componentBindings: bindings,
    authority: { ...core, canonicalDigest: hashFinanceCommandPayload(core) }
  };
}

function componentBindings(receipt: ReturnType<typeof createPayableLotOperationReceipt>) {
  return receipt.requiredExternalLinkSlots.map((slot) => {
    const core = {
      kind: "finance_component_slot_resolution_binding" as const,
      bindingId: `binding-${slot.slotId}`,
      version: "1",
      authorizationStatus: "unverified" as const,
      digestPurpose: "drift_detection_only" as const,
      operationReceiptId: receipt.receiptId,
      operationReceiptDigest: receipt.canonicalDigest,
      slotId: slot.slotId,
      effectId: slot.effectId,
      componentId: "component-payable",
      requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
    };
    return { ...core, bindingDigest: hashFinanceCommandPayload(core) };
  });
}

function receiptWithPayable(amountMinor: number) {
  const input = saleInput().operationReceipt;
  if (input.effects[0]?.amount.amountMinor !== amountMinor) throw new Error("fixture mismatch");
  return input;
}

function sha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
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
