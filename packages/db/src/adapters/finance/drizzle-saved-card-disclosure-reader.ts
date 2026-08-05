import {
  canonicalizeSavedCardDisclosure,
  createSavedCardDisclosureDraft,
  type SavedCardDisclosure,
  type SavedCardDisclosureReaderPort
} from "@elevenhouse/domain/finance-core";
import { and, desc, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeSavedCardDisclosureVersions } from "../../schema/finance/saved-card-disclosures.schema";

export class SavedCardDisclosureReaderPersistenceError extends Error {
  readonly code = "SAVED_CARD_DISCLOSURE_READER_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: "invalid_disclosure" | "persistence_failure") {
    super("Saved-card disclosure could not be read as sealed legal authority");
    this.name = "SavedCardDisclosureReaderPersistenceError";
  }
}

export function createDrizzleSavedCardDisclosureReader(
  database: ElevenHouseDatabase
): SavedCardDisclosureReaderPort {
  return Object.freeze({
    findPublishedDisclosure: async (input) => {
      const locale = localeValue(input.locale);
      try {
        const [row] = await database.select().from(financeSavedCardDisclosureVersions).where(and(
          eq(financeSavedCardDisclosureVersions.disclosureSeriesId, input.disclosureSeriesId),
          eq(financeSavedCardDisclosureVersions.locale, locale),
          eq(financeSavedCardDisclosureVersions.lifecycle, "published")
        )).orderBy(desc(financeSavedCardDisclosureVersions.version)).limit(1);
        return row ? mapPublishedSavedCardDisclosure(row) : null;
      } catch (error) {
        if (error instanceof SavedCardDisclosureReaderPersistenceError) throw error;
        throw new SavedCardDisclosureReaderPersistenceError("persistence_failure");
      }
    }
  } satisfies SavedCardDisclosureReaderPort);
}

export function mapPublishedSavedCardDisclosure(
  row: typeof financeSavedCardDisclosureVersions.$inferSelect
): SavedCardDisclosure {
  try {
    if (row.lifecycle !== "published" || row.publishedAt === null || row.retiredAt !== null) {
      fail("invalid_disclosure");
    }
    const disclosure = createSavedCardDisclosureDraft({
      disclosureSeriesId: row.disclosureSeriesId,
      version: row.version,
      locale: localeValue(row.locale),
      body: row.body
    }).disclosure;
    if (
      disclosure.canonicalDigest !== row.canonicalDigest ||
      canonicalizeSavedCardDisclosure(disclosure) !== row.canonicalPreimage
    ) fail("invalid_disclosure");
    return disclosure;
  } catch (error) {
    if (error instanceof SavedCardDisclosureReaderPersistenceError) throw error;
    fail("invalid_disclosure");
  }
}

function localeValue(value: unknown): "ru" | "en" {
  if (value === "ru" || value === "en") return value;
  fail("invalid_disclosure");
}

function fail(reason: SavedCardDisclosureReaderPersistenceError["reason"]): never {
  throw new SavedCardDisclosureReaderPersistenceError(reason);
}
