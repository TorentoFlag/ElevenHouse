import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
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

export type PlatformTariffInvoiceCaptureEvidence = Readonly<{
  kind: "canonical_platform_invoice_capture";
  schemaVersion: 1;
  evidenceId: string;
  version: number;
  invoiceId: string;
  intentId: string;
  intentVersion: number;
  providerAccountId: string;
  providerPaymentId: string;
  amount: Money;
  capturedAt: string;
  observedAt: string;
  digestPurpose: "drift_detection_only";
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type PlatformTariffInvoiceCaptureAuthority = Readonly<{
  kind: "platform_tariff_invoice_capture_authority";
  schemaVersion: 1;
  authorityId: string;
  version: number;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  operationId: string;
  invoiceId: string;
  astrologerUserId: string;
  planId: string;
  planVersionId: string;
  amount: Money;
  providerAccountId: string;
  evidence: PlatformTariffInvoiceCaptureEvidence;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export function buildPlatformTariffInvoiceCapturePosting(
  input: Readonly<{
    context: FinanceJournalPostingContext;
    authority: PlatformTariffInvoiceCaptureAuthority;
  }>,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe;
export function buildPlatformTariffInvoiceCapturePosting(
  input: unknown,
  decoderEnvelopeInput: unknown
): JournalRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const root = readExactDataRecord(input, ["context", "authority"]);
  const context = readFinanceJournalPostingContext(root.context, envelope);
  const authority = readAuthority(root.authority);
  const evidence = authority.evidence;
  assertIdentity(context, authority, evidence);
  assertFinancePostingMoneyEqual(authority.amount, evidence.amount, "amount_mismatch");
  if (authority.providerAccountId !== evidence.providerAccountId) fail("scope_mismatch");
  if (
    compareFinancePostingInstants(evidence.observedAt, evidence.capturedAt) < 0 ||
    compareFinancePostingInstants(context.postedAt, evidence.observedAt) < 0
  ) {
    fail("invalid_chronology");
  }
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
          amount: evidence.amount,
          links: noLinks
        },
        {
          account: { code: "platform_subscription_deferred", currency: "RUB" },
          side: "credit",
          amount: evidence.amount,
          links: noLinks
        }
      ]
    },
    envelope
  );
}

function readAuthority(input: unknown): PlatformTariffInvoiceCaptureAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "authorityId",
    "version",
    "authorizationStatus",
    "digestPurpose",
    "operationId",
    "invoiceId",
    "astrologerUserId",
    "planId",
    "planVersionId",
    "amount",
    "providerAccountId",
    "evidence",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "platform_tariff_invoice_capture_authority" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    fail("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "platform_tariff_invoice_capture_authority" as const,
    schemaVersion: 1 as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationId: readFinancePostingIdentifier(fields.operationId),
    invoiceId: readFinancePostingIdentifier(fields.invoiceId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    planId: readFinancePostingIdentifier(fields.planId),
    planVersionId: readFinancePostingIdentifier(fields.planVersionId),
    amount: readFinancePostingMoney(fields.amount),
    providerAccountId: readFinancePostingIdentifier(fields.providerAccountId),
    evidence: readEvidence(fields.evidence)
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) fail("authority_mismatch");
  return Object.freeze({ ...core, canonicalDigest });
}

function readEvidence(input: unknown): PlatformTariffInvoiceCaptureEvidence {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "evidenceId",
    "version",
    "invoiceId",
    "intentId",
    "intentVersion",
    "providerAccountId",
    "providerPaymentId",
    "amount",
    "capturedAt",
    "observedAt",
    "digestPurpose",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "canonical_platform_invoice_capture" ||
    fields.schemaVersion !== 1 ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    fail("evidence_mismatch");
  }
  const core = Object.freeze({
    kind: "canonical_platform_invoice_capture" as const,
    schemaVersion: 1 as const,
    evidenceId: readFinancePostingIdentifier(fields.evidenceId),
    version: readFinancePostingVersion(fields.version),
    invoiceId: readFinancePostingIdentifier(fields.invoiceId),
    intentId: readFinancePostingIdentifier(fields.intentId),
    intentVersion: readFinancePostingVersion(fields.intentVersion),
    providerAccountId: readFinancePostingIdentifier(fields.providerAccountId),
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

function assertIdentity(
  context: FinanceJournalPostingContext,
  authority: PlatformTariffInvoiceCaptureAuthority,
  evidence: PlatformTariffInvoiceCaptureEvidence
): void {
  if (
    context.operationId !== authority.operationId ||
    context.sourceKey.kind !== "platform_invoice" ||
    context.sourceKey.operation !== "captured" ||
    context.sourceKey.sourceId !== authority.invoiceId ||
    context.sourceKey.sourceId !== evidence.invoiceId
  ) {
    fail("source_mismatch");
  }
  if (context.occurredAt !== evidence.capturedAt) fail("invalid_chronology");
}

function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
