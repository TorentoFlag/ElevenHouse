import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { aiUsageConsentRecords, aiUsageRecords } from "./index";

describe("durable AI usage persistence schema", () => {
  it("stores a started/succeeded/failed/indeterminate lifecycle using only safe evidence", () => {
    expect(getTableName(aiUsageRecords)).toBe("ai_usage_records");
    expect(Object.keys(getTableColumns(aiUsageRecords))).toEqual([
      "id",
      "status",
      "feature",
      "promptId",
      "promptVersion",
      "provider",
      "ownerSafetyId",
      "processingAuthorityVersion",
      "resourceType",
      "resourceId",
      "sourceChecksum",
      "model",
      "finishReason",
      "safeErrorCode",
      "promptTokens",
      "completionTokens",
      "totalTokens",
      "durationMs",
      "startedAt",
      "completedAt"
    ]);
    expect(Object.keys(getTableColumns(aiUsageRecords))).not.toEqual(
      expect.arrayContaining([
        "ownerUserId",
        "prompt",
        "input",
        "output",
        "chart",
        "birthData",
        "coordinates",
        "resultChecksum"
      ])
    );
  });

  it("enforces lifecycle consistency, token arithmetic and normalized consent FKs", () => {
    const config = getTableConfig(aiUsageRecords);
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "ai_usage_records_status_check",
        "ai_usage_records_safe_fields_check",
        "ai_usage_records_owner_safety_id_check",
        "ai_usage_records_resource_evidence_check",
        "ai_usage_records_token_counts_check",
        "ai_usage_records_lifecycle_check"
      ])
    );
    expect(getTableName(aiUsageConsentRecords)).toBe("ai_usage_consent_records");
    expect(Object.keys(getTableColumns(aiUsageConsentRecords))).toEqual([
      "usageRecordId",
      "consentRecordId"
    ]);
    expect(
      getTableConfig(aiUsageConsentRecords).foreignKeys.map((foreignKey) => foreignKey.getName())
    ).toEqual(
      expect.arrayContaining([
        "ai_usage_consent_records_usage_record_id_ai_usage_records_id_fk",
        "ai_usage_consent_records_consent_record_id_client_data_consents_id_fk"
      ])
    );
  });
});
