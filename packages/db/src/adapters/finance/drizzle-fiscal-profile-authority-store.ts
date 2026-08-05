import {
  canonicalizeFiscalProfile,
  createFiscalProfile,
  createFiscalProfileDraft,
  publishFiscalProfileDraft,
  retirePublishedFiscalProfileVersion,
  reviseFiscalProfileDraft,
  verifyFiscalProfileVersion,
  FiscalProfileAuthorityError,
  type FiscalProfileAuthorityStore,
  type FiscalProfileDraftInput,
  type FiscalProfileVersion
} from "@elevenhouse/domain/finance-core";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeFiscalProfileSeries,
  financeFiscalProfileVersions
} from "../../schema/finance/fiscal-profiles.schema";

type FiscalProfileTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export type FiscalProfileAuthorityPersistenceReason =
  | "invalid_profile"
  | "draft_revision_conflict"
  | "profile_identity_conflict"
  | "profile_not_published"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class FiscalProfileAuthorityPersistenceError extends Error {
  readonly code = "FISCAL_PROFILE_AUTHORITY_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: FiscalProfileAuthorityPersistenceReason) {
    super("Fiscal profile authority could not persist an exact accounting version");
    this.name = "FiscalProfileAuthorityPersistenceError";
  }
}

/**
 * This is the only writer for fiscal-profile lifecycle rows. Payment preparation consumes the
 * narrower reader port, which prevents an administrative draft from becoming charge authority.
 */
export function createDrizzleFiscalProfileAuthorityStore(
  database: ElevenHouseDatabase
): FiscalProfileAuthorityStore {
  return Object.freeze({
    listVersions: async () => execute(async () => {
      const rows = await database
        .select({ series: financeFiscalProfileSeries, version: financeFiscalProfileVersions })
        .from(financeFiscalProfileSeries)
        .innerJoin(
          financeFiscalProfileVersions,
          eq(financeFiscalProfileVersions.profileSeriesId, financeFiscalProfileSeries.id)
        )
        .orderBy(
          asc(financeFiscalProfileSeries.transactionCategory),
          desc(financeFiscalProfileVersions.version)
        );
      return rows.map((row) => mapFiscalProfileVersion(row.series, row.version));
    }),
    findVersion: async (input) => execute(async () => {
      const [row] = await database
        .select({ series: financeFiscalProfileSeries, version: financeFiscalProfileVersions })
        .from(financeFiscalProfileSeries)
        .innerJoin(
          financeFiscalProfileVersions,
          eq(financeFiscalProfileVersions.profileSeriesId, financeFiscalProfileSeries.id)
        )
        .where(and(
          eq(financeFiscalProfileSeries.id, input.profileSeriesId),
          eq(financeFiscalProfileVersions.version, input.version),
          eq(financeFiscalProfileVersions.canonicalDigest, input.canonicalDigest)
        ))
        .limit(1);
      return row ? mapFiscalProfileVersion(row.series, row.version) : null;
    }),
    findVersionByIdentity: async (input) => execute(async () => {
      const [row] = await database
        .select({ series: financeFiscalProfileSeries, version: financeFiscalProfileVersions })
        .from(financeFiscalProfileSeries)
        .innerJoin(
          financeFiscalProfileVersions,
          eq(financeFiscalProfileVersions.profileSeriesId, financeFiscalProfileSeries.id)
        )
        .where(and(
          eq(financeFiscalProfileSeries.id, input.profileSeriesId),
          eq(financeFiscalProfileVersions.version, input.version)
        ))
        .limit(1);
      return row ? mapFiscalProfileVersion(row.series, row.version) : null;
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
  } satisfies FiscalProfileAuthorityStore);
}

async function createDraftInTransaction(
  transaction: FiscalProfileTransaction,
  input: FiscalProfileDraftInput
): Promise<FiscalProfileVersion> {
  const draft = normalizeDraft(input);
  await lockFiscalProfileSeries(transaction, draft.profile.profileSeriesId);
  const [existingSeries] = await transaction
    .select()
    .from(financeFiscalProfileSeries)
    .where(eq(financeFiscalProfileSeries.id, draft.profile.profileSeriesId))
    .limit(1)
    .for("update");
  if (existingSeries && (
    existingSeries.transactionCategory !== draft.profile.transactionCategory || existingSeries.retiredAt !== null
  )) fail("profile_identity_conflict");
  if (!existingSeries) {
    await transaction.insert(financeFiscalProfileSeries).values({
      id: draft.profile.profileSeriesId,
      transactionCategory: draft.profile.transactionCategory
    });
  }
  const [existing] = await transaction
    .select()
    .from(financeFiscalProfileVersions)
    .where(and(
      eq(financeFiscalProfileVersions.profileSeriesId, draft.profile.profileSeriesId),
      eq(financeFiscalProfileVersions.version, draft.profile.version)
    ))
    .limit(1)
    .for("update");
  if (existing) {
    const series = existingSeries ?? await readSeries(transaction, draft.profile.profileSeriesId);
    if (!series) fail("persistence_write_incomplete");
    const persisted = mapFiscalProfileVersion(series, existing);
    if (sameVersion(persisted, draft)) return persisted;
    fail("profile_identity_conflict");
  }
  const [inserted] = await transaction
    .insert(financeFiscalProfileVersions)
    .values(versionValues(draft))
    .returning();
  if (!inserted) fail("persistence_write_incomplete");
  const series = existingSeries ?? await readSeries(transaction, draft.profile.profileSeriesId);
  if (!series) fail("persistence_write_incomplete");
  return mapFiscalProfileVersion(series, inserted);
}

async function updateDraftInTransaction(
  transaction: FiscalProfileTransaction,
  command: Readonly<{
    profileSeriesId: string;
    version: number;
    expectedDraftRevision: number;
    next: FiscalProfileDraftInput;
  }>
): Promise<FiscalProfileVersion> {
  await lockFiscalProfileSeries(transaction, command.profileSeriesId);
  const series = await readSeries(transaction, command.profileSeriesId);
  const row = await readVersionForUpdate(transaction, command.profileSeriesId, command.version);
  if (!series || !row) fail("draft_revision_conflict");
  let revised: FiscalProfileVersion;
  try {
    revised = reviseFiscalProfileDraft({
      current: mapFiscalProfileVersion(series, row),
      expectedDraftRevision: command.expectedDraftRevision,
      next: command.next
    });
  } catch (error) {
    if (error instanceof FiscalProfileAuthorityError) fail("draft_revision_conflict");
    throw error;
  }
  const [updated] = await transaction
    .update(financeFiscalProfileVersions)
    .set(versionValues(revised))
    .where(and(
      eq(financeFiscalProfileVersions.profileSeriesId, command.profileSeriesId),
      eq(financeFiscalProfileVersions.version, command.version),
      eq(financeFiscalProfileVersions.lifecycle, "draft"),
      eq(financeFiscalProfileVersions.draftRevision, command.expectedDraftRevision)
    ))
    .returning();
  if (!updated) fail("draft_revision_conflict");
  return mapFiscalProfileVersion(series, updated);
}

async function publishDraftInTransaction(
  transaction: FiscalProfileTransaction,
  command: Readonly<{ profileSeriesId: string; version: number; expectedDraftRevision: number }>
): Promise<FiscalProfileVersion> {
  await lockFiscalProfileSeries(transaction, command.profileSeriesId);
  const series = await readSeries(transaction, command.profileSeriesId);
  const row = await readVersionForUpdate(transaction, command.profileSeriesId, command.version);
  if (!series || !row || series.retiredAt !== null || row.draftRevision !== command.expectedDraftRevision) {
    fail("draft_revision_conflict");
  }
  const current = mapFiscalProfileVersion(series, row);
  if (current.lifecycle === "published") return current;
  try {
    publishFiscalProfileDraft(current);
  } catch (error) {
    if (error instanceof FiscalProfileAuthorityError) fail("invalid_profile");
    throw error;
  }
  const [updated] = await transaction
    .update(financeFiscalProfileVersions)
    .set({ lifecycle: "published", publishedAt: sql`clock_timestamp()` })
    .where(and(
      eq(financeFiscalProfileVersions.profileSeriesId, command.profileSeriesId),
      eq(financeFiscalProfileVersions.version, command.version),
      eq(financeFiscalProfileVersions.lifecycle, "draft"),
      eq(financeFiscalProfileVersions.draftRevision, command.expectedDraftRevision)
    ))
    .returning();
  if (!updated) fail("draft_revision_conflict");
  return mapFiscalProfileVersion(series, updated);
}

async function retirePublishedInTransaction(
  transaction: FiscalProfileTransaction,
  command: Readonly<{ profileSeriesId: string; version: number }>
): Promise<FiscalProfileVersion> {
  await lockFiscalProfileSeries(transaction, command.profileSeriesId);
  const series = await readSeries(transaction, command.profileSeriesId);
  const row = await readVersionForUpdate(transaction, command.profileSeriesId, command.version);
  if (!series || !row) fail("profile_not_published");
  const current = mapFiscalProfileVersion(series, row);
  if (current.lifecycle === "retired") return current;
  let retired: FiscalProfileVersion;
  try {
    retired = retirePublishedFiscalProfileVersion(current);
  } catch (error) {
    if (error instanceof FiscalProfileAuthorityError) fail("profile_not_published");
    throw error;
  }
  const [updatedVersion] = await transaction
    .update(financeFiscalProfileVersions)
    .set({ lifecycle: "retired", retiredAt: sql`clock_timestamp()` })
    .where(and(
      eq(financeFiscalProfileVersions.profileSeriesId, command.profileSeriesId),
      eq(financeFiscalProfileVersions.version, command.version),
      eq(financeFiscalProfileVersions.lifecycle, "published")
    ))
    .returning();
  if (!updatedVersion) fail("profile_not_published");
  if (series.retiredAt === null) {
    const [updatedSeries] = await transaction
      .update(financeFiscalProfileSeries)
      .set({ retiredAt: sql`clock_timestamp()` })
      .where(and(
        eq(financeFiscalProfileSeries.id, command.profileSeriesId),
        sql`${financeFiscalProfileSeries.retiredAt} is null`
      ))
      .returning();
    if (!updatedSeries) fail("retryable_concurrency_conflict");
  }
  return retired;
}

export function mapFiscalProfileVersion(
  series: typeof financeFiscalProfileSeries.$inferSelect,
  row: typeof financeFiscalProfileVersions.$inferSelect
): FiscalProfileVersion {
  try {
    if (
      row.profileSeriesId !== series.id ||
      row.currency !== "RUB" ||
      row.fiscalizationProvider !== "arc_pay_embedded" ||
      row.buyerContactRequirement !== "email_or_phone" ||
      (row.lifecycle === "draft" && (row.publishedAt !== null || row.retiredAt !== null)) ||
      (row.lifecycle === "published" && (row.publishedAt === null || row.retiredAt !== null)) ||
      (row.lifecycle === "retired" && (row.publishedAt === null || row.retiredAt === null)) ||
      (row.lifecycle !== "draft" && row.lifecycle !== "published" && row.lifecycle !== "retired")
    ) fail("persistence_write_incomplete");
    const profile = createFiscalProfile({
      profileSeriesId: series.id,
      version: row.version,
      transactionCategory: categoryValue(series.transactionCategory),
      currency: "RUB",
      fiscalizationProvider: "arc_pay_embedded",
      merchantTaxId: row.merchantTaxId,
      buyerContactRequirement: "email_or_phone",
      lineTemplate: {
        vatRate: vatRate(row.vatRate),
        paymentObject: row.paymentObject,
        paymentMethod: row.paymentMethod,
        measure: row.measure,
        itemCode: row.itemCode
      }
    });
    if (
      profile.canonicalDigest !== row.canonicalDigest ||
      canonicalizeFiscalProfile(profile) !== row.canonicalPreimage
    ) fail("persistence_write_incomplete");
    return verifyFiscalProfileVersion({
      profile,
      draftRevision: row.draftRevision,
      lifecycle: row.lifecycle
    });
  } catch (error) {
    if (error instanceof FiscalProfileAuthorityPersistenceError) throw error;
    fail("persistence_write_incomplete");
  }
}

async function lockFiscalProfileSeries(
  transaction: FiscalProfileTransaction,
  profileSeriesId: string
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`fiscal-profile-series:${profileSeriesId}`}, 0))`
  );
}

async function readSeries(
  transaction: FiscalProfileTransaction,
  id: string
): Promise<typeof financeFiscalProfileSeries.$inferSelect | null> {
  const [series] = await transaction
    .select()
    .from(financeFiscalProfileSeries)
    .where(eq(financeFiscalProfileSeries.id, id))
    .limit(1)
    .for("update");
  return series ?? null;
}

async function readVersionForUpdate(
  transaction: FiscalProfileTransaction,
  profileSeriesId: string,
  version: number
): Promise<typeof financeFiscalProfileVersions.$inferSelect | null> {
  const [row] = await transaction
    .select()
    .from(financeFiscalProfileVersions)
    .where(and(
      eq(financeFiscalProfileVersions.profileSeriesId, profileSeriesId),
      eq(financeFiscalProfileVersions.version, version)
    ))
    .limit(1)
    .for("update");
  return row ?? null;
}

function versionValues(version: FiscalProfileVersion) {
  return {
    profileSeriesId: version.profile.profileSeriesId,
    version: version.profile.version,
    draftRevision: version.draftRevision,
    lifecycle: version.lifecycle,
    currency: version.profile.currency,
    fiscalizationProvider: version.profile.fiscalizationProvider,
    merchantTaxId: version.profile.merchantTaxId,
    buyerContactRequirement: version.profile.buyerContactRequirement,
    vatRate: version.profile.lineTemplate.vatRate,
    paymentObject: version.profile.lineTemplate.paymentObject,
    paymentMethod: version.profile.lineTemplate.paymentMethod,
    measure: version.profile.lineTemplate.measure,
    itemCode: version.profile.lineTemplate.itemCode,
    canonicalPreimage: canonicalizeFiscalProfile(version.profile),
    canonicalDigest: version.profile.canonicalDigest
  };
}

function sameVersion(left: FiscalProfileVersion, right: FiscalProfileVersion): boolean {
  return left.lifecycle === right.lifecycle &&
    left.draftRevision === right.draftRevision &&
    left.profile.canonicalDigest === right.profile.canonicalDigest &&
    canonicalizeFiscalProfile(left.profile) === canonicalizeFiscalProfile(right.profile);
}

function normalizeDraft(input: FiscalProfileDraftInput): FiscalProfileVersion {
  try {
    return createFiscalProfileDraft(input);
  } catch (error) {
    if (error instanceof FiscalProfileAuthorityError) fail("invalid_profile");
    throw error;
  }
}

function categoryValue(value: unknown): "client_purchase" | "platform_subscription" {
  if (value === "client_purchase" || value === "platform_subscription") return value;
  fail("persistence_write_incomplete");
}

function vatRate(value: unknown): "no_vat" | "vat0" | "vat10" | "vat110" | "vat20" | "vat120" {
  if (value === "no_vat" || value === "vat0" || value === "vat10" || value === "vat110" ||
    value === "vat20" || value === "vat120") return value;
  fail("persistence_write_incomplete");
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FiscalProfileAuthorityPersistenceError) throw error;
    const code = postgresCode(error);
    if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
    if (code === "23505") fail("profile_identity_conflict");
    throw error;
  }
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: FiscalProfileAuthorityPersistenceReason): never {
  throw new FiscalProfileAuthorityPersistenceError(reason);
}
