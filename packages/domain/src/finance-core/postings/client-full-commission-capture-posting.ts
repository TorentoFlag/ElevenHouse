import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import { createOrderEconomicsSnapshot, type OrderEconomicsSnapshot } from "../order-economics";
import {
  assertFinancePostingInstantEqual,
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  readFinanceJournalPostingContext,
  type FinanceJournalPostingContext
} from "./posting-event-identity";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export type ClientFullCommissionCaptureEvidence = Readonly<{
  kind: "canonical_client_order_capture";
  schemaVersion: 1;
  evidenceId: string;
  version: number;
  orderId: string;
  intentId: string;
  intentVersion: number;
  providerAccountSeriesId: string;
  providerAccountId: string;
  providerIdentityVersion: number;
  providerPaymentId: string;
  amount: Money;
  capturedAt: string;
  observedAt: string;
  digestPurpose: "drift_detection_only";
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ClientFullCommissionCaptureAuthority = Readonly<{
  kind: "client_full_commission_capture_authority";
  schemaVersion: 1;
  authorityId: string;
  version: number;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  operationId: string;
  providerClearingComponentId: string;
  platformCommissionComponentId: string;
  orderEconomics: OrderEconomicsSnapshot;
  evidence: ClientFullCommissionCaptureEvidence;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export function buildClientFullCommissionCapturePosting(
  input: Readonly<{
    context: FinanceJournalPostingContext;
    authority: ClientFullCommissionCaptureAuthority;
  }>,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildClientFullCommissionCapturePosting(
  input: unknown,
  decoderEnvelopeInput: unknown
): JournalRecipe {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const root = readExactDataRecord(input, ["context", "authority"]);
  const context = readFinanceJournalPostingContext(root.context, decoderEnvelope);
  const authority = readAuthority(root.authority);
  const { evidence, orderEconomics } = authority;

  if (
    orderEconomics.commissionBps !== 10_000 ||
    orderEconomics.payable.amountMinor !== 0 ||
    orderEconomics.commission.amountMinor !== orderEconomics.gross.amountMinor
  ) {
    fail("amount_mismatch");
  }
  assertFinancePostingMoneyEqual(orderEconomics.gross, evidence.amount, "amount_mismatch");
  assertIdentity(context, authority);
  if (
    evidence.orderId !== orderEconomics.orderId ||
    authority.providerClearingComponentId === authority.platformCommissionComponentId
  ) {
    fail("authority_mismatch");
  }
  if (
    compareFinancePostingInstants(evidence.observedAt, evidence.capturedAt) < 0 ||
    compareFinancePostingInstants(context.postedAt, evidence.observedAt) < 0
  ) {
    fail("invalid_chronology");
  }

  const links = (componentId: string) =>
    Object.freeze({
      originalSaleId: orderEconomics.orderId,
      componentId,
      payableLotId: null,
      payoutAllocationId: null
    });
  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: authority.kind,
        authorityId: authority.authorityId,
        version: authority.version,
        canonicalDigest: authority.canonicalDigest
      },
      sourceEvidenceRef: {
        kind: evidence.kind,
        evidenceId: evidence.evidenceId,
        canonicalDigest: evidence.canonicalDigest
      },
      operationSnapshotRef: null,
      entrySourceLinks: [null, null],
      entries: [
        {
          account: {
            code: "arc_provider_clearing",
            arcProviderAccountId: evidence.providerAccountId,
            currency: "RUB"
          },
          side: "debit",
          amount: orderEconomics.gross,
          links: links(authority.providerClearingComponentId)
        },
        {
          account: { code: "platform_commission_deferred", currency: "RUB" },
          side: "credit",
          amount: orderEconomics.commission,
          links: links(authority.platformCommissionComponentId)
        }
      ]
    },
    decoderEnvelope
  );
}

function readAuthority(input: unknown): ClientFullCommissionCaptureAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "authorityId",
    "version",
    "authorizationStatus",
    "digestPurpose",
    "operationId",
    "providerClearingComponentId",
    "platformCommissionComponentId",
    "orderEconomics",
    "evidence",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "client_full_commission_capture_authority" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    fail("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "client_full_commission_capture_authority" as const,
    schemaVersion: 1 as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationId: readFinancePostingIdentifier(fields.operationId),
    providerClearingComponentId: readFinancePostingIdentifier(fields.providerClearingComponentId),
    platformCommissionComponentId: readFinancePostingIdentifier(
      fields.platformCommissionComponentId
    ),
    orderEconomics: readEconomics(fields.orderEconomics),
    evidence: readEvidence(fields.evidence)
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) fail("authority_mismatch");
  return Object.freeze({ ...core, canonicalDigest });
}

function readEvidence(input: unknown): ClientFullCommissionCaptureEvidence {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "evidenceId",
    "version",
    "orderId",
    "intentId",
    "intentVersion",
    "providerAccountSeriesId",
    "providerAccountId",
    "providerIdentityVersion",
    "providerPaymentId",
    "amount",
    "capturedAt",
    "observedAt",
    "digestPurpose",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "canonical_client_order_capture" ||
    fields.schemaVersion !== 1 ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    fail("evidence_mismatch");
  }
  const core = Object.freeze({
    kind: "canonical_client_order_capture" as const,
    schemaVersion: 1 as const,
    evidenceId: readFinancePostingIdentifier(fields.evidenceId),
    version: readFinancePostingVersion(fields.version),
    orderId: readFinancePostingIdentifier(fields.orderId),
    intentId: readFinancePostingIdentifier(fields.intentId),
    intentVersion: readFinancePostingVersion(fields.intentVersion),
    providerAccountSeriesId: readFinancePostingIdentifier(fields.providerAccountSeriesId),
    providerAccountId: readFinancePostingIdentifier(fields.providerAccountId),
    providerIdentityVersion: readFinancePostingVersion(fields.providerIdentityVersion),
    providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId),
    amount: readFinancePostingMoney(fields.amount),
    capturedAt: readFinancePostingInstant(fields.capturedAt),
    observedAt: readFinancePostingInstant(fields.observedAt),
    digestPurpose: "drift_detection_only" as const
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) fail("evidence_mismatch");
  return Object.freeze({ ...core, canonicalDigest });
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

function assertIdentity(
  context: FinanceJournalPostingContext,
  authority: ClientFullCommissionCaptureAuthority
): void {
  const { evidence, orderEconomics } = authority;
  if (
    context.operationId !== authority.operationId ||
    context.sourceKey.kind !== "order" ||
    context.sourceKey.operation !== "sale_captured" ||
    context.sourceKey.sourceId !== orderEconomics.orderId ||
    evidence.orderId !== context.sourceKey.sourceId
  ) {
    fail("source_mismatch");
  }
  assertFinancePostingInstantEqual(context.occurredAt, evidence.capturedAt, "invalid_chronology");
}

function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
