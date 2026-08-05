import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeSavedCardConsentHeads,
  financeSavedCardConsentIntegritySql,
  financeSavedCardConsentLifecycleEvents,
  financeSavedCardConsents
} from "./saved-card-consents.schema";

describe("saved-card recurring-consent schema", () => {
  it("keeps the explicit tariff consent immutable and bound to one exact subscription snapshot", () => {
    expect(getTableName(financeSavedCardConsents)).toBe("finance_saved_card_consents");
    expect(Object.keys(getTableColumns(financeSavedCardConsents))).toEqual([
      "consentId",
      "consentVersion",
      "subscriptionId",
      "ownerUserId",
      "tariffSeriesId",
      "tariffVersion",
      "tariffVersionDigest",
      "seriesId",
      "providerAccountId",
      "providerIdentityVersion",
      "providerCustomerId",
      "buyerContactKind",
      "buyerContactValue",
      "consentScope",
      "noticeLocale",
      "disclosureSeriesId",
      "disclosureVersion",
      "disclosureDigest",
      "acceptedAt"
    ]);

    const config = getTableConfig(financeSavedCardConsents);
    expect(config.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_saved_card_consents_subscription_snapshot_fk",
        "finance_saved_card_consents_provider_identity_fk",
        "finance_saved_card_consents_disclosure_snapshot_fk"
      ])
    );
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "finance_saved_card_consents_scope_check",
        "finance_saved_card_consents_notice_check",
        "finance_saved_card_consents_identity_check",
        "finance_saved_card_consents_buyer_contact_check"
      ])
    );
  });

  it("makes revocation append-only and exposes a CAS-protected active head", () => {
    expect(getTableName(financeSavedCardConsentLifecycleEvents)).toBe(
      "finance_saved_card_consent_lifecycle_events"
    );
    expect(getTableName(financeSavedCardConsentHeads)).toBe(
      "finance_saved_card_consent_heads"
    );

    const lifecycleConfig = getTableConfig(financeSavedCardConsentLifecycleEvents);
    const headConfig = getTableConfig(financeSavedCardConsentHeads);
    expect(lifecycleConfig.checks.map((check) => check.name)).toContain(
      "finance_saved_card_consent_lifecycle_events_shape_check"
    );
    expect(headConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "finance_saved_card_consent_heads_lifecycle_check",
        "finance_saved_card_consent_heads_revision_check"
      ])
    );

    expect(financeSavedCardConsentIntegritySql).toContain(
      "saved-card consent lifecycle must start granted at sequence one"
    );
    expect(financeSavedCardConsentIntegritySql).toContain(
      "finance_saved_card_consents_immutable"
    );
    expect(financeSavedCardConsentIntegritySql).toContain(
      "new.head_version <> old.head_version + 1"
    );
    expect(financeSavedCardConsentIntegritySql).toContain(
      "set search_path = pg_catalog, public"
    );
  });
});
