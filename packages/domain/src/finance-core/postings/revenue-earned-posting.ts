import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { FinanceLedgerAccountCode } from "../ledger-chart";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
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
import {
  readUnverifiedDeferredRevenueSource,
  type UnverifiedDeferredRevenueSource
} from "./revenue-earned-posting-source";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

export type { UnverifiedDeferredRevenueSource } from "./revenue-earned-posting-source";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;
export type RevenueRecognitionKind = "commission" | "subscription";

export type ApprovedRevenueRecognitionEvent = Readonly<{
  kind: "approved_revenue_recognition_event";
  schemaVersion: 1;
  eventId: string;
  version: number;
  approvalStatus: "approved";
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  recognitionKind: RevenueRecognitionKind;
  sourceId: string;
  deferredSource: UnverifiedDeferredRevenueSource;
  approvedAt: string;
  recognizedAt: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

const recognitionAccounts = Object.freeze({
  commission: Object.freeze({
    deferred: "platform_commission_deferred",
    revenue: "platform_commission_revenue",
    sourceKind: "order",
    captureOperation: "sale_captured",
    earnedOperation: "commission_earned"
  }),
  subscription: Object.freeze({
    deferred: "platform_subscription_deferred",
    revenue: "platform_subscription_revenue",
    sourceKind: "platform_invoice",
    captureOperation: "captured",
    earnedOperation: "revenue_earned"
  })
} satisfies Record<
  RevenueRecognitionKind,
  Readonly<{
    deferred: FinanceLedgerAccountCode;
    revenue: FinanceLedgerAccountCode;
    sourceKind: "order" | "platform_invoice";
    captureOperation: "sale_captured" | "captured";
    earnedOperation: "commission_earned" | "revenue_earned";
  }>
>);

export function buildApprovedRevenueEarnedPosting(
  input: Readonly<{
    context: FinanceJournalPostingContext;
    event: ApprovedRevenueRecognitionEvent;
  }>,
  envelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildApprovedRevenueEarnedPosting(
  input: unknown,
  envelopeInput: unknown
): JournalRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const root = readExactDataRecord(input, ["context", "event"]);
  const context = readFinanceJournalPostingContext(root.context, envelope);
  const event = readEvent(root.event, envelope);
  const config = recognitionAccounts[event.recognitionKind];
  assertIdentity(context, event, config);
  assertDeferredSource(event, config);
  if (compareFinancePostingInstants(event.recognizedAt, event.approvedAt) < 0) {
    fail("invalid_chronology");
  }
  const sourceEntry = event.deferredSource.entry;
  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: event.kind,
        authorityId: event.eventId,
        version: event.version,
        canonicalDigest: event.canonicalDigest
      },
      sourceEvidenceRef: {
        kind: event.kind,
        evidenceId: event.eventId,
        canonicalDigest: event.canonicalDigest
      },
      operationSnapshotRef: null,
      entrySourceLinks: [null, null],
      entries: [
        {
          account: sourceEntry.account,
          side: "debit",
          amount: sourceEntry.amount,
          links: sourceEntry.links
        },
        {
          account: { code: config.revenue, currency: "RUB" },
          side: "credit",
          amount: sourceEntry.amount,
          links: sourceEntry.links
        }
      ]
    },
    envelope
  );
}

function readEvent(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): ApprovedRevenueRecognitionEvent {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "eventId",
    "version",
    "approvalStatus",
    "authorizationStatus",
    "digestPurpose",
    "recognitionKind",
    "sourceId",
    "deferredSource",
    "approvedAt",
    "recognizedAt",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "approved_revenue_recognition_event" ||
    fields.schemaVersion !== 1 ||
    fields.approvalStatus !== "approved" ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    (fields.recognitionKind !== "commission" && fields.recognitionKind !== "subscription")
  ) {
    fail("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "approved_revenue_recognition_event" as const,
    schemaVersion: 1 as const,
    eventId: readFinancePostingIdentifier(fields.eventId),
    version: readFinancePostingVersion(fields.version),
    approvalStatus: "approved" as const,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    recognitionKind: fields.recognitionKind,
    sourceId: readFinancePostingIdentifier(fields.sourceId),
    deferredSource: readUnverifiedDeferredRevenueSource(fields.deferredSource, envelope),
    approvedAt: readFinancePostingInstant(fields.approvedAt),
    recognizedAt: readFinancePostingInstant(fields.recognizedAt)
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) fail("authority_mismatch");
  return Object.freeze({ ...core, canonicalDigest });
}

function assertIdentity(
  context: FinanceJournalPostingContext,
  event: ApprovedRevenueRecognitionEvent,
  config: (typeof recognitionAccounts)[RevenueRecognitionKind]
): void {
  if (
    context.operationId !== event.eventId ||
    context.sourceKey.kind !== config.sourceKind ||
    context.sourceKey.operation !== config.earnedOperation ||
    context.sourceKey.sourceId !== event.sourceId ||
    context.occurredAt !== event.recognizedAt
  ) {
    fail("source_mismatch");
  }
}

function assertDeferredSource(
  event: ApprovedRevenueRecognitionEvent,
  config: (typeof recognitionAccounts)[RevenueRecognitionKind]
): void {
  const source = event.deferredSource;
  const entry = source.entry;
  if (
    source.sourceKey.kind !== config.sourceKind ||
    source.sourceKey.operation !== config.captureOperation ||
    source.sourceKey.sourceId !== event.sourceId
  ) {
    fail("source_mismatch");
  }
  if (entry.account.code !== config.deferred || entry.side !== "credit") {
    fail("evidence_mismatch");
  }
  const links = entry.links;
  const validLinks =
    event.recognitionKind === "commission"
      ? links.originalSaleId === event.sourceId &&
        links.componentId !== null &&
        links.payableLotId === null &&
        links.payoutAllocationId === null
      : Object.values(links).every((value) => value === null);
  if (!validLinks) fail("evidence_mismatch");
}

function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
