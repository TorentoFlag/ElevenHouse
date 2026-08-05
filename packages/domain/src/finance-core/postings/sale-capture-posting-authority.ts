import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import { createOrderEconomicsSnapshot, type OrderEconomicsSnapshot } from "../order-economics";
import {
  normalizePayableLotReceiptDecoderEnvelope,
  type PayableLotReceiptDecoderEnvelope
} from "../source-lot-operation-receipt";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion
} from "./posting-codec";

export type SaleCapturePostingAuthority = Readonly<{
  kind: "sale_capture_posting_authority";
  schemaVersion: 1;
  authorityId: string;
  version: number;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  operationId: string;
  operationReceiptId: string;
  operationReceiptDigest: FinanceAuthorizationPayloadHash;
  componentBindingsDigest: FinanceAuthorizationPayloadHash;
  providerClearingComponentId: string;
  platformCommissionComponentId: string;
  orderEconomics: OrderEconomicsSnapshot;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export function readSaleCapturePostingAuthority(input: unknown): SaleCapturePostingAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "authorityId",
    "version",
    "authorizationStatus",
    "digestPurpose",
    "operationId",
    "operationReceiptId",
    "operationReceiptDigest",
    "componentBindingsDigest",
    "providerClearingComponentId",
    "platformCommissionComponentId",
    "orderEconomics",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "sale_capture_posting_authority" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    fail("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "sale_capture_posting_authority" as const,
    schemaVersion: 1 as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationId: readFinancePostingIdentifier(fields.operationId),
    operationReceiptId: readFinancePostingIdentifier(fields.operationReceiptId),
    operationReceiptDigest: readFinancePostingDigest(fields.operationReceiptDigest),
    componentBindingsDigest: readFinancePostingDigest(fields.componentBindingsDigest),
    providerClearingComponentId: readFinancePostingIdentifier(fields.providerClearingComponentId),
    platformCommissionComponentId: readFinancePostingIdentifier(
      fields.platformCommissionComponentId
    ),
    orderEconomics: readEconomics(fields.orderEconomics)
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) fail("authority_mismatch");
  return Object.freeze({ ...core, canonicalDigest });
}

export function normalizeSaleCaptureReceiptEnvelope(
  input: unknown
): PayableLotReceiptDecoderEnvelope {
  try {
    return normalizePayableLotReceiptDecoderEnvelope(
      readExactDataRecord(input, [
        "maxAuthorityRefs",
        "maxEffects",
        "maxLineage",
        "maxComponentSlots",
        "maxDecimalDigits"
      ])
    );
  } catch {
    fail("proof_operation_receipt_mismatch");
  }
}

function readEconomics(input: unknown): OrderEconomicsSnapshot {
  const fields = readExactDataRecord(input, [
    "orderId",
    "astrologerUserId",
    "planId",
    "planVersionId",
    "gross",
    "commission",
    "payable",
    "commissionBps",
    "allocationRevision"
  ]);
  const money = (value: unknown) => {
    const item = readExactDataRecord(value, ["amountMinor", "currency"]);
    return { amountMinor: item.amountMinor, currency: item.currency };
  };
  try {
    return createOrderEconomicsSnapshot({
      ...fields,
      gross: money(fields.gross),
      commission: money(fields.commission),
      payable: money(fields.payable)
    });
  } catch {
    fail("authority_mismatch");
  }
}

function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
