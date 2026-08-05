import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  PayoutStatusEvidenceError,
  type CreatePayoutMethodInput,
  type CreatePayoutRequestInput,
  type ListPayoutRequestsInput,
  type Money,
  type PayoutMethodRecord,
  type PayoutRequestRecord,
  type PayoutStore,
  type UpdatePayoutRequestStatusInput
} from "@elevenhouse/domain";
import { hasAsciiControlCharacter } from "@elevenhouse/domain/finance-core";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeArtifactTombstones,
  financeArtifacts,
  payoutMethodVersions,
  payoutMethods,
  payoutRequests
} from "../../schema";
import type { FinanceDatabase } from "./drizzle-finance-command-store";

type PayoutMethodRow = typeof payoutMethods.$inferSelect;
type PayoutMethodVersionRow = typeof payoutMethodVersions.$inferSelect;
type PayoutRequestRow = typeof payoutRequests.$inferSelect;

export function createDrizzlePayoutStore(database: ElevenHouseDatabase): PayoutStore {
  return {
    createMethod: (input) => createPayoutMethod(database, input),
    findDefaultMethod: (astrologerUserId) => findDefaultPayoutMethod(database, astrologerUserId),
    createRequest: (input) => createPayoutRequest(database, input),
    updateRequestStatus: (input) => updatePayoutRequestStatus(database, input),
    findRequestById: (payoutRequestId) => findPayoutRequestById(database, payoutRequestId),
    listRequests: (input) => listPayoutRequests(database, input)
  };
}

export function createDrizzlePayoutTransactionStore(
  database: FinanceDatabase
): Pick<PayoutStore, "findRequestById" | "listRequests" | "updateRequestStatus"> {
  return {
    findRequestById: (payoutRequestId) => findPayoutRequestById(database, payoutRequestId),
    listRequests: (input) => listPayoutRequests(database, input),
    updateRequestStatus: (input) => updatePayoutRequestStatus(database, input)
  };
}

async function createPayoutMethod(
  database: ElevenHouseDatabase,
  input: CreatePayoutMethodInput
): Promise<PayoutMethodRecord> {
  const timestamp = new Date(input.now);
  const [row] = await database
    .insert(payoutMethods)
    .values({
      ...(input.id ? { id: input.id } : {}),
      astrologerUserId: input.astrologerUserId,
      method: input.method,
      currency: input.currency,
      displayName: input.displayName,
      isDefault: input.isDefault,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning();
  if (!row) throw new Error("Expected payout method insert to return a row");
  const [destination] = await database
    .insert(payoutMethodVersions)
    .values({
      payoutMethodId: row.id,
      version: input.destination.payoutMethodVersion,
      destinationKind: input.destination.destinationKind,
      beneficiaryFingerprint: input.destination.beneficiaryFingerprint,
      redactedDisplay: input.destination.redactedDisplay,
      sealedDestinationRef: input.destination.sealedDestinationRef,
      createdAt: timestamp
    })
    .returning();
  if (!destination) throw new Error("Expected payout method destination insert to return a row");
  if (Number(row.version) !== destination.version) {
    throw new Error("Payout method root and destination versions must match");
  }
  return toPayoutMethod(row, destination);
}

async function findDefaultPayoutMethod(
  database: FinanceDatabase,
  astrologerUserId: string
): Promise<PayoutMethodRecord | null> {
  const [result] = await database
    .select()
    .from(payoutMethods)
    .innerJoin(
      payoutMethodVersions,
      and(
        eq(payoutMethodVersions.payoutMethodId, payoutMethods.id),
        eq(payoutMethodVersions.version, sql`${payoutMethods.version}::integer`)
      )
    )
    .where(
      and(eq(payoutMethods.astrologerUserId, astrologerUserId), eq(payoutMethods.isDefault, true))
    )
    .limit(1);
  return result ? toPayoutMethod(result.payout_methods, result.payout_method_versions) : null;
}

async function createPayoutRequest(
  database: ElevenHouseDatabase,
  input: CreatePayoutRequestInput
): Promise<PayoutRequestRecord> {
  const method = await findPayoutMethodById(database, input.payoutMethodId);
  if (!method) throw new Error("Payout method was not found");
  if (method.astrologerUserId !== input.astrologerUserId) {
    throw new Error("Payout method does not belong to the payout requester");
  }
  if (method.currency !== input.amount.currency) {
    throw new Error("Payout request currency must match payout method currency");
  }

  const timestamp = new Date(input.now);
  const [row] = await database
    .insert(payoutRequests)
    .values({
      ...(input.id ? { id: input.id } : {}),
      astrologerUserId: input.astrologerUserId,
      payoutMethodId: input.payoutMethodId,
      payoutMethodVersion: method.destination.payoutMethodVersion,
      destinationKind: method.destination.destinationKind,
      beneficiaryFingerprint: method.destination.beneficiaryFingerprint,
      redactedDisplay: method.destination.redactedDisplay,
      sealedDestinationRef: method.destination.sealedDestinationRef,
      status: "requested",
      amountMinor: input.amount.amountMinor,
      currency: input.amount.currency,
      method: method.method,
      requestedAt: timestamp,
      metadata: input.metadata,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning();
  if (!row) throw new Error("Expected payout request insert to return a row");
  return toPayoutRequest(row);
}

async function updatePayoutRequestStatus(
  database: FinanceDatabase,
  input: UpdatePayoutRequestStatusInput
): Promise<PayoutRequestRecord | null> {
  assertPayoutStatusEvidence(input);
  if (input.status === "paid") {
    await assertActiveBankTransferProofArtifact(database, input.proofArtifact);
  }
  const timestamp = new Date(input.now);
  const completedAt = isTerminalPayoutStatus(input.status) ? timestamp : undefined;
  const [row] = await database
    .update(payoutRequests)
    .set({
      status: input.status,
      adminUserId: input.adminUserId,
      adminNote: input.adminNote,
      failureReason: input.failureReason,
      externalReference: input.externalReference,
      transferredAt: input.transferredAt ? new Date(input.transferredAt) : undefined,
      paidProofArtifactId: input.proofArtifact?.artifactId,
      paidProofArtifactDigest: input.proofArtifact?.sha256Digest,
      paidProofArtifactByteLength: input.proofArtifact?.byteLength,
      version: sql`${payoutRequests.version} + 1`,
      reviewedAt: input.adminUserId ? timestamp : undefined,
      completedAt,
      updatedAt: timestamp
    })
    .where(
      and(
        eq(payoutRequests.id, input.payoutRequestId),
        eq(payoutRequests.version, String(input.expectedVersion))
      )
    )
    .returning();
  return row ? toPayoutRequest(row) : null;
}

function isTerminalPayoutStatus(status: UpdatePayoutRequestStatusInput["status"]): boolean {
  return (
    status === "paid" || status === "failed" || status === "rejected" || status === "cancelled"
  );
}

export function assertPayoutStatusEvidence(
  input: Pick<
    UpdatePayoutRequestStatusInput,
    "status" | "externalReference" | "transferredAt" | "failureReason" | "proofArtifact"
  >
): void {
  if (input.status === "paid") {
    if (!input.externalReference || !input.transferredAt || !isPayoutProofArtifact(input.proofArtifact)) {
      throw new PayoutStatusEvidenceError(
        "Paid payout requests require externalReference, transferredAt and a proof artifact"
      );
    }
  }
  if ((input.status === "failed" || input.status === "rejected") && !input.failureReason) {
    throw new PayoutStatusEvidenceError("Failed or rejected payout requests require failureReason");
  }
}

async function assertActiveBankTransferProofArtifact(
  database: FinanceDatabase,
  proofArtifact: UpdatePayoutRequestStatusInput["proofArtifact"]
): Promise<void> {
  if (!isPayoutProofArtifact(proofArtifact)) {
    throw new PayoutStatusEvidenceError("Paid payout requests require a valid proof artifact");
  }
  const [artifact] = await database
    .select({
      id: financeArtifacts.id,
      artifactClass: financeArtifacts.artifactClass,
      bindingKind: financeArtifacts.bindingKind,
      sha256Digest: financeArtifacts.sha256Digest,
      byteLength: financeArtifacts.byteLength,
      tombstonedArtifactId: financeArtifactTombstones.artifactId
    })
    .from(financeArtifacts)
    .leftJoin(
      financeArtifactTombstones,
      eq(financeArtifactTombstones.artifactId, financeArtifacts.id)
    )
    .where(eq(financeArtifacts.id, proofArtifact.artifactId))
    .limit(1);
  if (
    !artifact ||
    artifact.artifactClass !== "bank_transfer_evidence" ||
    artifact.bindingKind !== "bank_cash_pool" ||
    artifact.sha256Digest !== proofArtifact.sha256Digest ||
    Number(artifact.byteLength) !== proofArtifact.byteLength ||
    artifact.tombstonedArtifactId !== null
  ) {
    throw new PayoutStatusEvidenceError(
      "Paid payout proof artifact must be an active exact bank transfer evidence artifact"
    );
  }
}

function isPayoutProofArtifact(
  value: UpdatePayoutRequestStatusInput["proofArtifact"]
): value is NonNullable<UpdatePayoutRequestStatusInput["proofArtifact"]> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.artifactId === "string" &&
    value.artifactId.length >= 1 &&
    value.artifactId.length <= 160 &&
    value.artifactId.trim() === value.artifactId &&
    !hasAsciiControlCharacter(value.artifactId) &&
    typeof value.sha256Digest === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(value.sha256Digest) &&
    Number.isSafeInteger(value.byteLength) &&
    value.byteLength > 0
  );
}

async function findPayoutMethodById(
  database: FinanceDatabase,
  payoutMethodId: string
): Promise<PayoutMethodRecord | null> {
  const [result] = await database
    .select()
    .from(payoutMethods)
    .innerJoin(
      payoutMethodVersions,
      and(
        eq(payoutMethodVersions.payoutMethodId, payoutMethods.id),
        eq(payoutMethodVersions.version, sql`${payoutMethods.version}::integer`)
      )
    )
    .where(eq(payoutMethods.id, payoutMethodId))
    .limit(1);
  return result ? toPayoutMethod(result.payout_methods, result.payout_method_versions) : null;
}

async function findPayoutRequestById(
  database: FinanceDatabase,
  payoutRequestId: string
): Promise<PayoutRequestRecord | null> {
  const [row] = await database
    .select()
    .from(payoutRequests)
    .where(eq(payoutRequests.id, payoutRequestId))
    .limit(1);
  return row ? toPayoutRequest(row) : null;
}

async function listPayoutRequests(
  database: FinanceDatabase,
  input: ListPayoutRequestsInput = {}
): Promise<readonly PayoutRequestRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const filters = [
    input.astrologerUserId
      ? eq(payoutRequests.astrologerUserId, input.astrologerUserId)
      : undefined,
    input.statuses?.length ? inArray(payoutRequests.status, [...input.statuses]) : undefined
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  const rows = await database
    .select()
    .from(payoutRequests)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(payoutRequests.requestedAt), desc(payoutRequests.id))
    .limit(limit);
  return rows.map(toPayoutRequest);
}

function toPayoutMethod(
  row: PayoutMethodRow,
  destination: PayoutMethodVersionRow
): PayoutMethodRecord {
  return {
    id: row.id,
    astrologerUserId: row.astrologerUserId,
    method: row.method as PayoutMethodRecord["method"],
    currency: money(0, row.currency).currency,
    displayName: row.displayName,
    destination: {
      kind: "sealed_payout_destination_snapshot",
      payoutMethodId: row.id,
      payoutMethodVersion: destination.version,
      destinationKind: destination.destinationKind as PayoutMethodRecord["destination"]["destinationKind"],
      beneficiaryFingerprint: destination.beneficiaryFingerprint as PayoutMethodRecord["destination"]["beneficiaryFingerprint"],
      redactedDisplay: destination.redactedDisplay,
      sealedDestinationRef: destination.sealedDestinationRef
    },
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toPayoutRequest(row: PayoutRequestRow): PayoutRequestRecord {
  return {
    id: row.id,
    astrologerUserId: row.astrologerUserId,
    payoutMethodId: row.payoutMethodId,
    payoutMethodVersion: row.payoutMethodVersion,
    destination: {
      kind: "sealed_payout_destination_snapshot",
      payoutMethodId: row.payoutMethodId,
      payoutMethodVersion: row.payoutMethodVersion,
      destinationKind: row.destinationKind as PayoutRequestRecord["destination"]["destinationKind"],
      beneficiaryFingerprint: row.beneficiaryFingerprint as PayoutRequestRecord["destination"]["beneficiaryFingerprint"],
      redactedDisplay: row.redactedDisplay,
      sealedDestinationRef: row.sealedDestinationRef
    },
    status: row.status as PayoutRequestRecord["status"],
    amount: money(row.amountMinor, row.currency),
    method: row.method as PayoutRequestRecord["method"],
    requestedAt: row.requestedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    adminUserId: row.adminUserId,
    adminNote: row.adminNote,
    failureReason: row.failureReason,
    externalReference: row.externalReference,
    transferredAt: row.transferredAt?.toISOString() ?? null,
    paidProofArtifact:
      row.paidProofArtifactId &&
      row.paidProofArtifactDigest &&
      row.paidProofArtifactByteLength !== null
        ? {
            artifactId: row.paidProofArtifactId,
            sha256Digest: row.paidProofArtifactDigest,
            byteLength: row.paidProofArtifactByteLength
          }
        : null,
    version: Number(row.version),
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
  return { amountMinor, currency };
}
