import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { clientAstrologerRelationships, clientDataConsents } from "./index";

describe("client data consent persistence schema", () => {
  it("stores immutable per-relationship policy evidence without payload data", () => {
    expect(getTableName(clientDataConsents)).toBe("client_data_consents");
    expect(Object.keys(getTableColumns(clientDataConsents))).toEqual([
      "id",
      "relationshipId",
      "clientUserId",
      "astrologerUserId",
      "purpose",
      "policyVersion",
      "processorCode",
      "noticeLocale",
      "noticeSha256",
      "grantedAt",
      "revokedAt"
    ]);
    expect(Object.keys(getTableColumns(clientDataConsents))).not.toEqual(
      expect.arrayContaining(["birthData", "chartData", "prompt", "processingAuthority"])
    );
  });

  it("enforces relationship identity, one unrevoked purpose and bounded evidence", () => {
    const config = getTableConfig(clientDataConsents);
    const relationshipForeignKey = config.foreignKeys.find(
      (foreignKey) => foreignKey.getName() === "client_data_consents_relationship_identity_fk"
    );
    expect(relationshipForeignKey).toBeDefined();
    expect(relationshipForeignKey?.onDelete).toBe("restrict");
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "client_data_consents_purpose_check",
        "client_data_consents_policy_version_check",
        "client_data_consents_processor_code_check",
        "client_data_consents_notice_locale_check",
        "client_data_consents_notice_sha256_check",
        "client_data_consents_revocation_time_check"
      ])
    );
    const current = config.indexes.find(
      (index) => index.config.name === "client_data_consents_one_current_unique"
    );
    expect(current?.config.unique).toBe(true);
    expect(current?.config.where).toBeDefined();
    expect(
      getTableConfig(clientAstrologerRelationships).uniqueConstraints.map(
        (constraint) => constraint.name
      )
    ).toContain("client_astrologer_relationships_identity_unique");
  });
});
