import {
  canonicalizeSavedCardDisclosure,
  createSavedCardDisclosureDraft,
  publishSavedCardDisclosureDraft,
  retirePublishedSavedCardDisclosure,
  reviseSavedCardDisclosureDraft,
  SavedCardDisclosureAuthorityError,
  type SavedCardDisclosureAuthorityStore,
  type SavedCardDisclosureDraftInput,
  type SavedCardDisclosureVersion,
  verifySavedCardDisclosureVersion
} from "@elevenhouse/domain/finance-core";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeSavedCardDisclosureVersions } from "../../schema/finance/saved-card-disclosures.schema";

type SavedCardDisclosureTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export type SavedCardDisclosureAuthorityPersistenceReason =
  | "invalid_disclosure"
  | "draft_revision_conflict"
  | "disclosure_identity_conflict"
  | "published_disclosure_conflict"
  | "disclosure_not_published"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class SavedCardDisclosureAuthorityPersistenceError extends Error {
  readonly code = "SAVED_CARD_DISCLOSURE_AUTHORITY_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: SavedCardDisclosureAuthorityPersistenceReason) {
    super("Saved-card disclosure authority could not persist an exact legal version");
    this.name = "SavedCardDisclosureAuthorityPersistenceError";
  }
}

/** The sole writer for legal disclosure drafts and sealed lifecycle transitions. */
export function createDrizzleSavedCardDisclosureAuthorityStore(
  database: ElevenHouseDatabase
): SavedCardDisclosureAuthorityStore {
  return Object.freeze({
    listVersions: async () => execute(async () => {
      const rows = await database.select().from(financeSavedCardDisclosureVersions).orderBy(
        asc(financeSavedCardDisclosureVersions.disclosureSeriesId),
        asc(financeSavedCardDisclosureVersions.locale),
        desc(financeSavedCardDisclosureVersions.version)
      );
      return rows.map(mapSavedCardDisclosureVersion);
    }),
    findVersion: async (input) => execute(async () => {
      const [row] = await database.select().from(financeSavedCardDisclosureVersions).where(and(
        eq(financeSavedCardDisclosureVersions.disclosureSeriesId, input.disclosureSeriesId),
        eq(financeSavedCardDisclosureVersions.version, input.version),
        eq(financeSavedCardDisclosureVersions.locale, input.locale),
        eq(financeSavedCardDisclosureVersions.canonicalDigest, input.canonicalDigest)
      )).limit(1);
      return row ? mapSavedCardDisclosureVersion(row) : null;
    }),
    findVersionByIdentity: async (input) => execute(async () => {
      const [row] = await database.select().from(financeSavedCardDisclosureVersions).where(and(
        eq(financeSavedCardDisclosureVersions.disclosureSeriesId, input.disclosureSeriesId),
        eq(financeSavedCardDisclosureVersions.version, input.version),
        eq(financeSavedCardDisclosureVersions.locale, input.locale)
      )).limit(1);
      return row ? mapSavedCardDisclosureVersion(row) : null;
    }),
    createDraft: async (input) => execute(() =>
      database.transaction((transaction) => createDraftInTransaction(transaction, input))
    ),
    updateDraft: async (input) => execute(() =>
      database.transaction((transaction) => updateDraftInTransaction(transaction, input))
    ),
    publishDraft: async (input) => execute(() =>
      database.transaction((transaction) => publishDraftInTransaction(transaction, input))
    ),
    retirePublished: async (input) => execute(() =>
      database.transaction((transaction) => retirePublishedInTransaction(transaction, input))
    )
  } satisfies SavedCardDisclosureAuthorityStore);
}

async function createDraftInTransaction(
  transaction: SavedCardDisclosureTransaction,
  input: SavedCardDisclosureDraftInput
): Promise<SavedCardDisclosureVersion> {
  const draft = normalizeDraft(input);
  await lockDisclosure(transaction, draft.disclosure.disclosureSeriesId, draft.disclosure.locale);
  const existing = await readVersionForUpdate(
    transaction,
    draft.disclosure.disclosureSeriesId,
    draft.disclosure.version,
    draft.disclosure.locale
  );
  if (existing) {
    const persisted = mapSavedCardDisclosureVersion(existing);
    if (sameVersion(persisted, draft)) return persisted;
    fail("disclosure_identity_conflict");
  }
  const [inserted] = await transaction.insert(financeSavedCardDisclosureVersions)
    .values(versionValues(draft)).returning();
  if (!inserted) fail("persistence_write_incomplete");
  return mapSavedCardDisclosureVersion(inserted);
}

async function updateDraftInTransaction(
  transaction: SavedCardDisclosureTransaction,
  command: Readonly<{
    disclosureSeriesId: string;
    version: number;
    locale: "ru" | "en";
    expectedDraftRevision: number;
    next: SavedCardDisclosureDraftInput;
  }>
): Promise<SavedCardDisclosureVersion> {
  await lockDisclosure(transaction, command.disclosureSeriesId, command.locale);
  const row = await readVersionForUpdate(transaction, command.disclosureSeriesId, command.version, command.locale);
  if (!row) fail("draft_revision_conflict");
  let revised: SavedCardDisclosureVersion;
  try {
    revised = reviseSavedCardDisclosureDraft({
      current: mapSavedCardDisclosureVersion(row),
      expectedDraftRevision: command.expectedDraftRevision,
      next: command.next
    });
  } catch (error) {
    if (error instanceof SavedCardDisclosureAuthorityError) fail("draft_revision_conflict");
    throw error;
  }
  const [updated] = await transaction.update(financeSavedCardDisclosureVersions).set(versionValues(revised)).where(and(
    eq(financeSavedCardDisclosureVersions.disclosureSeriesId, command.disclosureSeriesId),
    eq(financeSavedCardDisclosureVersions.version, command.version),
    eq(financeSavedCardDisclosureVersions.locale, command.locale),
    eq(financeSavedCardDisclosureVersions.lifecycle, "draft"),
    eq(financeSavedCardDisclosureVersions.draftRevision, command.expectedDraftRevision)
  )).returning();
  if (!updated) fail("draft_revision_conflict");
  return mapSavedCardDisclosureVersion(updated);
}

async function publishDraftInTransaction(
  transaction: SavedCardDisclosureTransaction,
  command: Readonly<{
    disclosureSeriesId: string;
    version: number;
    locale: "ru" | "en";
    expectedDraftRevision: number;
  }>
): Promise<SavedCardDisclosureVersion> {
  await lockDisclosure(transaction, command.disclosureSeriesId, command.locale);
  const row = await readVersionForUpdate(transaction, command.disclosureSeriesId, command.version, command.locale);
  if (!row || row.draftRevision !== command.expectedDraftRevision) fail("draft_revision_conflict");
  const current = mapSavedCardDisclosureVersion(row);
  if (current.lifecycle === "published") return current;
  try {
    publishSavedCardDisclosureDraft(current);
  } catch (error) {
    if (error instanceof SavedCardDisclosureAuthorityError) fail("invalid_disclosure");
    throw error;
  }
  const [updated] = await transaction.update(financeSavedCardDisclosureVersions).set({
    lifecycle: "published",
    publishedAt: sql`clock_timestamp()`
  }).where(and(
    eq(financeSavedCardDisclosureVersions.disclosureSeriesId, command.disclosureSeriesId),
    eq(financeSavedCardDisclosureVersions.version, command.version),
    eq(financeSavedCardDisclosureVersions.locale, command.locale),
    eq(financeSavedCardDisclosureVersions.lifecycle, "draft"),
    eq(financeSavedCardDisclosureVersions.draftRevision, command.expectedDraftRevision)
  )).returning();
  if (!updated) fail("draft_revision_conflict");
  return mapSavedCardDisclosureVersion(updated);
}

async function retirePublishedInTransaction(
  transaction: SavedCardDisclosureTransaction,
  command: Readonly<{ disclosureSeriesId: string; version: number; locale: "ru" | "en" }>
): Promise<SavedCardDisclosureVersion> {
  await lockDisclosure(transaction, command.disclosureSeriesId, command.locale);
  const row = await readVersionForUpdate(transaction, command.disclosureSeriesId, command.version, command.locale);
  if (!row) fail("disclosure_not_published");
  const current = mapSavedCardDisclosureVersion(row);
  if (current.lifecycle === "retired") return current;
  try {
    retirePublishedSavedCardDisclosure(current);
  } catch (error) {
    if (error instanceof SavedCardDisclosureAuthorityError) fail("disclosure_not_published");
    throw error;
  }
  const [updated] = await transaction.update(financeSavedCardDisclosureVersions).set({
    lifecycle: "retired",
    retiredAt: sql`clock_timestamp()`
  }).where(and(
    eq(financeSavedCardDisclosureVersions.disclosureSeriesId, command.disclosureSeriesId),
    eq(financeSavedCardDisclosureVersions.version, command.version),
    eq(financeSavedCardDisclosureVersions.locale, command.locale),
    eq(financeSavedCardDisclosureVersions.lifecycle, "published")
  )).returning();
  if (!updated) fail("disclosure_not_published");
  return mapSavedCardDisclosureVersion(updated);
}

export function mapSavedCardDisclosureVersion(
  row: typeof financeSavedCardDisclosureVersions.$inferSelect
): SavedCardDisclosureVersion {
  try {
    if (
      (row.lifecycle === "draft" && (row.publishedAt !== null || row.retiredAt !== null)) ||
      (row.lifecycle === "published" && (row.publishedAt === null || row.retiredAt !== null)) ||
      (row.lifecycle === "retired" && (row.publishedAt === null || row.retiredAt === null)) ||
      (row.lifecycle !== "draft" && row.lifecycle !== "published" && row.lifecycle !== "retired")
    ) fail("persistence_write_incomplete");
    const disclosure = createSavedCardDisclosureDraft({
      disclosureSeriesId: row.disclosureSeriesId,
      version: row.version,
      locale: localeValue(row.locale),
      body: row.body
    }).disclosure;
    if (
      disclosure.canonicalDigest !== row.canonicalDigest ||
      canonicalizeSavedCardDisclosure(disclosure) !== row.canonicalPreimage
    ) fail("persistence_write_incomplete");
    return verifySavedCardDisclosureVersion({
      disclosure,
      draftRevision: row.draftRevision,
      lifecycle: row.lifecycle
    });
  } catch (error) {
    if (error instanceof SavedCardDisclosureAuthorityPersistenceError) throw error;
    fail("persistence_write_incomplete");
  }
}

async function lockDisclosure(
  transaction: SavedCardDisclosureTransaction,
  disclosureSeriesId: string,
  locale: "ru" | "en"
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`saved-card-disclosure:${disclosureSeriesId}:${locale}`}, 0))`
  );
}

async function readVersionForUpdate(
  transaction: SavedCardDisclosureTransaction,
  disclosureSeriesId: string,
  version: number,
  locale: "ru" | "en"
): Promise<typeof financeSavedCardDisclosureVersions.$inferSelect | null> {
  const [row] = await transaction.select().from(financeSavedCardDisclosureVersions).where(and(
    eq(financeSavedCardDisclosureVersions.disclosureSeriesId, disclosureSeriesId),
    eq(financeSavedCardDisclosureVersions.version, version),
    eq(financeSavedCardDisclosureVersions.locale, locale)
  )).limit(1).for("update");
  return row ?? null;
}

function versionValues(version: SavedCardDisclosureVersion) {
  return {
    disclosureSeriesId: version.disclosure.disclosureSeriesId,
    version: version.disclosure.version,
    locale: version.disclosure.locale,
    draftRevision: version.draftRevision,
    lifecycle: version.lifecycle,
    body: version.disclosure.body,
    canonicalPreimage: canonicalizeSavedCardDisclosure(version.disclosure),
    canonicalDigest: version.disclosure.canonicalDigest
  };
}

function sameVersion(left: SavedCardDisclosureVersion, right: SavedCardDisclosureVersion): boolean {
  return left.lifecycle === right.lifecycle &&
    left.draftRevision === right.draftRevision &&
    left.disclosure.canonicalDigest === right.disclosure.canonicalDigest &&
    canonicalizeSavedCardDisclosure(left.disclosure) === canonicalizeSavedCardDisclosure(right.disclosure);
}

function normalizeDraft(input: SavedCardDisclosureDraftInput): SavedCardDisclosureVersion {
  try {
    return createSavedCardDisclosureDraft(input);
  } catch (error) {
    if (error instanceof SavedCardDisclosureAuthorityError) fail("invalid_disclosure");
    throw error;
  }
}

function localeValue(value: unknown): "ru" | "en" {
  if (value === "ru" || value === "en") return value;
  fail("persistence_write_incomplete");
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SavedCardDisclosureAuthorityPersistenceError) throw error;
    const code = postgresCode(error);
    if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
    if (code === "23505") fail("published_disclosure_conflict");
    throw error;
  }
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: SavedCardDisclosureAuthorityPersistenceReason): never {
  throw new SavedCardDisclosureAuthorityPersistenceError(reason);
}
