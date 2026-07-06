import { desc, eq } from "drizzle-orm";
import type {
  AstrologerVerificationApplication,
  VerificationApplicationStore,
  VerificationApplicationStoreCreateInput,
  VerificationDocument,
  VerificationDocumentKind
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  mediaAssets,
  verificationApplicationDocuments,
  verificationApplications
} from "../../schema";
import { insertReturningOne } from "../../shared";

type VerificationApplicationRow = typeof verificationApplications.$inferSelect;
type VerificationApplicationDocumentRow = typeof verificationApplicationDocuments.$inferSelect;
type MediaAssetRow = typeof mediaAssets.$inferSelect;
type VerificationTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type VerificationDatabase = ElevenHouseDatabase | VerificationTransaction;

export function createDrizzleVerificationApplicationStore(
  database: ElevenHouseDatabase
): VerificationApplicationStore {
  return {
    findLatestByOwner: async (input) => {
      const [row] = await database
        .select()
        .from(verificationApplications)
        .where(eq(verificationApplications.ownerUserId, input.ownerUserId))
        .orderBy(desc(verificationApplications.submittedAt), desc(verificationApplications.id))
        .limit(1);

      if (!row) return null;
      return hydrateApplication(database, row);
    },
    create: (input) => database.transaction((transaction) => insertApplication(transaction, input))
  };
}

async function insertApplication(
  database: VerificationDatabase,
  input: VerificationApplicationStoreCreateInput
): Promise<AstrologerVerificationApplication> {
  const row = await insertReturningOne(
    () =>
      database
        .insert(verificationApplications)
        .values({
          id: input.id,
          ownerUserId: input.ownerUserId,
          status: "pending",
          rejectionReason: null,
          submittedAt: new Date(input.now),
          reviewedAt: null,
          reviewerUserId: null,
          createdAt: new Date(input.now),
          updatedAt: new Date(input.now)
        })
        .returning(),
    "verification_applications"
  );

  await database.insert(verificationApplicationDocuments).values(
    input.documents.map((document) => ({
      id: document.id,
      applicationId: row.id,
      kind: document.kind,
      mediaId: document.mediaId,
      createdAt: new Date(input.now)
    }))
  );

  return hydrateApplication(database, row);
}

async function hydrateApplication(
  database: VerificationDatabase,
  row: VerificationApplicationRow
): Promise<AstrologerVerificationApplication> {
  const documentRows = await listDocuments(database, row.id);

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    status: row.status as AstrologerVerificationApplication["status"],
    rejectionReason: row.rejectionReason,
    submittedAt: toIsoString(row.submittedAt),
    reviewedAt: row.reviewedAt ? toIsoString(row.reviewedAt) : null,
    reviewerUserId: row.reviewerUserId,
    documents: documentRows.map(toVerificationDocument),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

async function listDocuments(
  database: VerificationDatabase,
  applicationId: string
): Promise<
  Array<{
    readonly document: VerificationApplicationDocumentRow;
    readonly media: MediaAssetRow;
  }>
> {
  const rows = await database
    .select({
      document: verificationApplicationDocuments,
      media: mediaAssets
    })
    .from(verificationApplicationDocuments)
    .innerJoin(mediaAssets, eq(mediaAssets.id, verificationApplicationDocuments.mediaId))
    .where(eq(verificationApplicationDocuments.applicationId, applicationId));

  return rows.sort(
    (left, right) => getDocumentOrder(left.document) - getDocumentOrder(right.document)
  );
}

function toVerificationDocument(input: {
  readonly document: VerificationApplicationDocumentRow;
  readonly media: MediaAssetRow;
}): VerificationDocument {
  return {
    id: input.document.id,
    applicationId: input.document.applicationId,
    kind: input.document.kind as VerificationDocumentKind,
    mediaId: input.document.mediaId,
    originalFileName: input.media.originalFileName,
    mimeType: input.media.mimeType,
    sizeBytes: input.media.sizeBytes,
    createdAt: toIsoString(input.document.createdAt)
  };
}

function getDocumentOrder(row: VerificationApplicationDocumentRow): number {
  return row.kind === "identity" ? 0 : 1;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
