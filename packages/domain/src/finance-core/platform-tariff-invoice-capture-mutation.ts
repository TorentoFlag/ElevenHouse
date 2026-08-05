import { hashFinanceCommandPayload } from "../finance-authorization/canonical-command-payload";
import type { CaptureFinancialMutationProposal } from "./ports/verified-capture-application-uow";
import type { ProviderOperationResultCommitReceipt } from "./ports/provider-operation-result-application-uow";
import type {
  ResolvedFinanceJournalOperationEnvelope,
  ResolvedFinanceOperationEnvelope
} from "./ports/finance-port-types";
import { buildPlatformTariffInvoiceCapturePosting } from "./postings/platform-tariff-invoice-posting";

export class PlatformTariffInvoiceCaptureMutationError extends Error {
  readonly code = "PLATFORM_TARIFF_INVOICE_CAPTURE_MUTATION_ERROR" as const;

  constructor(readonly reason: "invalid_capture_result" | "invalid_tariff_snapshot") {
    super("Platform tariff invoice capture mutation could not be derived safely");
  }
}

/**
 * Converts a canonical, persisted provider capture into the only financial effect of a tariff
 * invoice. It deliberately creates no astrologer payable/wallet entries: tariff revenue belongs
 * to ElevenHouse, while the acquirer clearing position is settled separately.
 */
export function createPlatformTariffInvoiceCaptureMutation(input: Readonly<{
  invoice: Readonly<{
    invoiceId: string;
    ownerUserId: string;
    tariffSeriesId: string;
    tariffVersion: number;
  }>;
  providerResult: ProviderOperationResultCommitReceipt;
  /** ArcPay's canonical resource time, not the local poll time. */
  capturedAt: string;
  postedAt: string;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>): Extract<CaptureFinancialMutationProposal, { readonly kind: "journal_only" }> {
  const providerResult = input.providerResult;
  if (
    providerResult.outcome !== "succeeded" ||
    providerResult.purpose !== "platform_invoice" ||
    providerResult.operationKind !== "saved_card_charge" ||
    providerResult.providerPaymentId === null ||
    providerResult.amountMinor === null ||
    providerResult.currency !== "RUB" ||
    providerResult.sourceId !== input.invoice.invoiceId
  ) fail("invalid_capture_result");
  if (!Number.isSafeInteger(input.invoice.tariffVersion) || input.invoice.tariffVersion < 1) {
    fail("invalid_tariff_snapshot");
  }
  const amount = Object.freeze({ amountMinor: positiveSafeMinor(providerResult.amountMinor), currency: "RUB" as const });
  const capturedAt = canonicalInstant(input.capturedAt);
  const observedAt = canonicalInstant(providerResult.observedAt);
  const evidenceCore = Object.freeze({
    kind: "canonical_platform_invoice_capture" as const,
    schemaVersion: 1 as const,
    evidenceId: `platform-tariff-capture-evidence:${providerResult.providerOperationResultId}`,
    version: 1,
    invoiceId: input.invoice.invoiceId,
    intentId: providerResult.economicPaymentIntentId,
    intentVersion: providerResult.correlatedEconomicPaymentVersion,
    providerAccountId: providerResult.providerAccount.providerAccountId,
    providerPaymentId: providerResult.providerPaymentId,
    amount,
    capturedAt,
    observedAt,
    digestPurpose: "drift_detection_only" as const
  });
  const evidence = Object.freeze({ ...evidenceCore, canonicalDigest: hashFinanceCommandPayload(evidenceCore) });
  const operationId = providerResult.providerOperationId;
  const authorityCore = Object.freeze({
    kind: "platform_tariff_invoice_capture_authority" as const,
    schemaVersion: 1 as const,
    authorityId: `platform-tariff-capture-authority:${providerResult.providerOperationResultId}`,
    version: 1,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationId,
    invoiceId: input.invoice.invoiceId,
    astrologerUserId: input.invoice.ownerUserId,
    planId: input.invoice.tariffSeriesId,
    planVersionId: `${input.invoice.tariffSeriesId}@${input.invoice.tariffVersion}`,
    amount,
    providerAccountId: providerResult.providerAccount.providerAccountId,
    evidence
  });
  const authority = Object.freeze({ ...authorityCore, canonicalDigest: hashFinanceCommandPayload(authorityCore) });
  const context = Object.freeze({
    journalTransactionId: `platform-tariff-capture-journal:${providerResult.providerOperationResultId}`,
    linkProofId: `platform-tariff-capture-proof:${providerResult.providerOperationResultId}`,
    operationId,
    sourceKey: Object.freeze({ kind: "platform_invoice" as const, sourceId: input.invoice.invoiceId, operation: "captured" as const }),
    occurredAt: capturedAt,
    postedAt: input.postedAt
  });
  const operationEnvelope = journalEnvelope(input.operationEnvelope);
  const postingRecipe = buildPlatformTariffInvoiceCapturePosting(
    Object.freeze({ context, authority }),
    operationEnvelope.journalPosting.decoderEnvelope
  );
  return Object.freeze({
    kind: "journal_only" as const,
    command: Object.freeze({ operationId, postingRecipe, journalLinkProof: postingRecipe.linkProof, operationEnvelope })
  });
}

/** Fixed topology: two journal entries, one proof edge, and no allocations/components. */
function journalEnvelope(operationEnvelope: ResolvedFinanceOperationEnvelope): ResolvedFinanceJournalOperationEnvelope {
  return Object.freeze({
    ...operationEnvelope,
    journalPosting: Object.freeze({
      decoderEnvelope: Object.freeze({
        maxJournalEntries: 2,
        maxProofEdges: 2,
        maxComponentBindings: 1,
        maxAllocations: 1,
        maxDecimalDigits: operationEnvelope.maximumDecimalDigits
      })
    })
  }) as ResolvedFinanceJournalOperationEnvelope;
}

function positiveSafeMinor(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) fail("invalid_capture_result");
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) fail("invalid_capture_result");
  return amount;
}

function canonicalInstant(value: string): string {
  if (typeof value !== "string") fail("invalid_capture_result");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) fail("invalid_capture_result");
  return parsed.toISOString().replace(".000Z", "Z");
}

function fail(reason: PlatformTariffInvoiceCaptureMutationError["reason"]): never {
  throw new PlatformTariffInvoiceCaptureMutationError(reason);
}
