import {
  canonicalizeFiscalProfile,
  createFiscalProfile,
  type FiscalProfile,
  type FiscalProfileReaderPort,
  type FiscalTransactionCategory
} from "@elevenhouse/domain/finance-core";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeFiscalProfileSeries,
  financeFiscalProfileVersions
} from "../../schema/finance/fiscal-profiles.schema";

export class FiscalProfileReaderPersistenceError extends Error {
  readonly code = "FISCAL_PROFILE_READER_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: "invalid_category" | "profile_integrity_conflict" | "persistence_failure") {
    super("Fiscal profile could not be read as verified accounting authority");
    this.name = "FiscalProfileReaderPersistenceError";
  }
}

export function createDrizzleFiscalProfileReader(
  database: ElevenHouseDatabase
): FiscalProfileReaderPort {
  return Object.freeze({
    findPublishedProfile: async ({ transactionCategory }) => {
      const category = categoryValue(transactionCategory);
      try {
        const [row] = await database
          .select({ series: financeFiscalProfileSeries, version: financeFiscalProfileVersions })
          .from(financeFiscalProfileSeries)
          .innerJoin(
            financeFiscalProfileVersions,
            eq(financeFiscalProfileVersions.profileSeriesId, financeFiscalProfileSeries.id)
          )
          .where(and(
            eq(financeFiscalProfileSeries.transactionCategory, category),
            isNull(financeFiscalProfileSeries.retiredAt),
            eq(financeFiscalProfileVersions.lifecycle, "published")
          ))
          .orderBy(desc(financeFiscalProfileVersions.version))
          .limit(1);
        return row ? mapFiscalProfile(row.series, row.version) : null;
      } catch (error) {
        if (error instanceof FiscalProfileReaderPersistenceError) throw error;
        throw new FiscalProfileReaderPersistenceError("persistence_failure");
      }
    }
  } satisfies FiscalProfileReaderPort);
}

export function mapFiscalProfile(
  series: typeof financeFiscalProfileSeries.$inferSelect,
  version: typeof financeFiscalProfileVersions.$inferSelect
): FiscalProfile {
  try {
    if (
      version.profileSeriesId !== series.id ||
      version.lifecycle !== "published" ||
      version.currency !== "RUB" ||
      version.fiscalizationProvider !== "arc_pay_embedded" ||
      version.buyerContactRequirement !== "email_or_phone" ||
      version.publishedAt === null ||
      version.retiredAt !== null ||
      series.retiredAt !== null
    ) {
      fail("profile_integrity_conflict");
    }
    const profile = createFiscalProfile({
      profileSeriesId: series.id,
      version: version.version,
      transactionCategory: categoryValue(series.transactionCategory),
      currency: "RUB",
      fiscalizationProvider: "arc_pay_embedded",
      merchantTaxId: version.merchantTaxId,
      buyerContactRequirement: "email_or_phone",
      lineTemplate: {
        vatRate: vatRate(version.vatRate),
        paymentObject: version.paymentObject,
        paymentMethod: version.paymentMethod,
        measure: version.measure,
        itemCode: version.itemCode
      }
    });
    if (
      profile.canonicalDigest !== version.canonicalDigest ||
      canonicalizeFiscalProfile(profile) !== version.canonicalPreimage
    ) {
      fail("profile_integrity_conflict");
    }
    return profile;
  } catch (error) {
    if (error instanceof FiscalProfileReaderPersistenceError) throw error;
    fail("profile_integrity_conflict");
  }
}

function categoryValue(value: unknown): FiscalTransactionCategory {
  if (value === "client_purchase" || value === "platform_subscription") return value;
  fail("invalid_category");
}

function vatRate(value: unknown): "no_vat" | "vat0" | "vat10" | "vat110" | "vat20" | "vat120" {
  if (
    value === "no_vat" || value === "vat0" || value === "vat10" || value === "vat110" ||
    value === "vat20" || value === "vat120"
  ) return value;
  fail("profile_integrity_conflict");
}

function fail(reason: FiscalProfileReaderPersistenceError["reason"]): never {
  throw new FiscalProfileReaderPersistenceError(reason);
}
