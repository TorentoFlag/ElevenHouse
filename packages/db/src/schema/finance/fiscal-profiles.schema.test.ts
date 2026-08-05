import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  financeFiscalProfileLifecycleValues,
  financeFiscalProfileIntegritySql,
  financeFiscalProfileSeries,
  financeFiscalProfileVersions,
  financeFiscalVatRateValues
} from "./fiscal-profiles.schema";

describe("finance fiscal profile schema", () => {
  it("keeps one active category profile and immutable version identity fields", () => {
    expect(getTableName(financeFiscalProfileSeries)).toBe("finance_fiscal_profile_series");
    expect(getTableName(financeFiscalProfileVersions)).toBe("finance_fiscal_profile_versions");
    expect(financeFiscalProfileLifecycleValues).toEqual(["draft", "published", "retired"]);
    expect(financeFiscalVatRateValues).toContain("no_vat");
    expect(Object.keys(getTableColumns(financeFiscalProfileVersions))).toEqual(
      expect.arrayContaining([
        "profileSeriesId",
        "version",
        "draftRevision",
        "merchantTaxId",
        "vatRate",
        "canonicalPreimage",
        "canonicalDigest"
      ])
    );
    const columns = getTableColumns(financeFiscalProfileVersions);
    for (const name of [
      "currency",
      "fiscalizationProvider",
      "canonicalPreimage",
      "canonicalDigest"
    ] as const) {
      expect(columns[name].default).toBeUndefined();
    }
    expect(getTableConfig(financeFiscalProfileSeries).indexes.map((item) => item.config.name)).toContain(
      "finance_fiscal_profile_series_active_category_unique"
    );
    expect(getTableConfig(financeFiscalProfileVersions).checks.map((item) => item.name)).toContain(
      "finance_fiscal_profile_versions_shape_check"
    );
    expect(financeFiscalProfileIntegritySql).toContain(
      "finance_fiscal_profile_versions_sealed_immutable"
    );
    expect(financeFiscalProfileIntegritySql).toContain(
      "finance_fiscal_profile_series_identity_immutable"
    );
    expect(financeFiscalProfileIntegritySql).toContain("fiscal profile series identity is immutable");
    expect(financeFiscalProfileIntegritySql).toContain("published fiscal profile version is immutable");
  });
});
