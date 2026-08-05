import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  financeSavedCardDisclosureIntegritySql,
  financeSavedCardDisclosureLifecycleValues,
  financeSavedCardDisclosureVersions
} from "./saved-card-disclosures.schema";

describe("saved-card disclosure schema", () => {
  it("stores a versioned locale-specific disclosure with immutable published evidence", () => {
    expect(getTableName(financeSavedCardDisclosureVersions)).toBe(
      "finance_saved_card_disclosure_versions"
    );
    expect(financeSavedCardDisclosureLifecycleValues).toEqual(["draft", "published", "retired"]);
    expect(Object.keys(getTableColumns(financeSavedCardDisclosureVersions))).toEqual(
      expect.arrayContaining([
        "disclosureSeriesId",
        "version",
        "locale",
        "body",
        "canonicalPreimage",
        "canonicalDigest"
      ])
    );
    expect(getTableConfig(financeSavedCardDisclosureVersions).checks.map((item) => item.name)).toContain(
      "finance_saved_card_disclosure_versions_shape_check"
    );
    expect(financeSavedCardDisclosureIntegritySql).toContain(
      "finance_saved_card_disclosure_versions_sealed_immutable"
    );
  });
});
