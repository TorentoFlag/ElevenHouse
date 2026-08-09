import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeProviderAccountSeries,
  financeProviderAccounts,
  financeProviderIdentityImmutabilitySql
} from "./provider-accounts.schema";
import {
  financeArtifactAccessEvents,
  financeArtifactDeferredBankCashPoolForeignKeys,
  financeArtifactImmutabilitySql,
  financeArtifactLegalHolds,
  financeArtifactPurgeAttempts,
  financeArtifactPurgeRequests,
  financeArtifactRetentionPolicies,
  financeArtifactSecurityIncidents,
  financeArtifactTombstones,
  financeArtifacts
} from "./finance-artifacts.schema";
import {
  financeProviderCredentialImmutabilitySql,
  financeRestrictedProviderCredentials,
  financeRestrictedProviderCredentialHeads,
  financeRestrictedProviderCredentialLifecycleEvents,
  financeTransientSecretConsumptions,
  financeTransientSecretRefs
} from "./provider-credentials.schema";
import { financeArtifactAccessPurposeValues, financeArtifactClassValues } from "./finance-values";

describe("finance provider identity and private evidence schema", () => {
  it("classifies ArcPay payout statements as provider evidence with a dedicated read purpose", () => {
    expect(financeArtifactClassValues).toContain("provider_payout_statement");
    expect(financeArtifactAccessPurposeValues).toContain("payout_statement_ingestion");
  });

  it("pins every owned PL/pgSQL integrity function to the trusted schemas", () => {
    for (const ddl of [
      financeProviderIdentityImmutabilitySql,
      financeArtifactImmutabilitySql,
      financeProviderCredentialImmutabilitySql
    ]) {
      const functions = ddl.match(
        /create or replace function[\s\S]*?(?=create or replace function|$)/g
      );

      expect(functions).not.toBeNull();
      for (const integrityFunction of functions ?? []) {
        expect(integrityFunction).toContain("set search_path = pg_catalog, public");
      }
    }
  });

  it("stores an append-only exact provider series/account/version identity", () => {
    expect(getTableName(financeProviderAccountSeries)).toBe("finance_provider_account_series");
    expect(getTableName(financeProviderAccounts)).toBe("finance_provider_accounts");
    expect(Object.keys(getTableColumns(financeProviderAccountSeries))).toEqual([
      "id",
      "seriesId",
      "provider",
      "activeIdentityVersion",
      "headVersion",
      "createdAt"
    ]);
    expect(Object.keys(getTableColumns(financeProviderAccounts))).toEqual([
      "id",
      "seriesId",
      "providerAccountId",
      "identityVersion",
      "provider",
      "merchantTenantId",
      "terminalScope",
      "settlementScope",
      "predecessorProviderAccountId",
      "predecessorIdentityVersion",
      "createdAt"
    ]);

    const accountConfig = getTableConfig(financeProviderAccounts);
    const seriesConfig = getTableConfig(financeProviderAccountSeries);
    expect(accountConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "finance_provider_accounts_series_version_unique",
        "finance_provider_accounts_provider_account_id_unique"
      ])
    );
    expect(accountConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "finance_provider_accounts_exact_identity_unique",
        "finance_provider_accounts_resolved_exact_identity_unique"
      ])
    );
    expect(seriesConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "finance_provider_account_series_series_provider_unique"
    );
    expect(accountConfig.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_provider_accounts_series_provider_fk",
        "finance_provider_accounts_predecessor_fk"
      ])
    );
    expect(accountConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "finance_provider_accounts_provider_check",
        "finance_provider_accounts_identifier_check",
        "finance_provider_accounts_identity_version_check",
        "finance_provider_accounts_predecessor_check"
      ])
    );
    expect(Object.keys(getTableColumns(financeProviderAccounts))).not.toContain("environment");
    expect(seriesConfig.checks.map((check) => check.name)).toContain(
      "finance_provider_account_series_identifier_check"
    );
    expect(financeProviderIdentityImmutabilitySql).toContain(
      "finance_provider_accounts_immutable_truncate"
    );
    expect(financeProviderIdentityImmutabilitySql).toContain(
      "finance_provider_account_series_immutable_truncate"
    );
    expect(financeProviderIdentityImmutabilitySql).toContain(
      "new.active_identity_version <> old.active_identity_version + 1"
    );
    expect(financeProviderIdentityImmutabilitySql).toContain("new.active_identity_version <> 1");
    expect(financeProviderIdentityImmutabilitySql).toContain(
      "finance_require_provider_series_active_account"
    );
    expect(financeProviderIdentityImmutabilitySql).toContain(
      "finance_require_provider_account_is_series_head"
    );
  });

  it("keeps exact private artifact metadata separate from semantic payload rows", () => {
    expect(getTableName(financeArtifacts)).toBe("finance_artifacts");
    expect(getTableName(financeArtifactAccessEvents)).toBe("finance_artifact_access_events");
    expect(getTableName(financeArtifactRetentionPolicies)).toBe(
      "finance_artifact_retention_policies"
    );
    expect(getTableName(financeArtifactTombstones)).toBe("finance_artifact_tombstones");
    expect(getTableName(financeArtifactPurgeRequests)).toBe("finance_artifact_purge_requests");
    expect(getTableName(financeArtifactPurgeAttempts)).toBe("finance_artifact_purge_attempts");
    expect(getTableName(financeArtifactLegalHolds)).toBe("finance_artifact_legal_holds");
    expect(getTableName(financeArtifactSecurityIncidents)).toBe(
      "finance_artifact_security_incidents"
    );

    const artifactColumns = Object.keys(getTableColumns(financeArtifacts));
    expect(artifactColumns).toEqual(
      expect.arrayContaining([
        "id",
        "artifactClass",
        "sha256Digest",
        "byteLength",
        "contentType",
        "bindingKind",
        "seriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "bankCashPoolId",
        "currency",
        "statementSourceFingerprint",
        "privateObjectKey",
        "privateObjectVersion",
        "envelopeKeyVersion",
        "retentionPolicyId",
        "retentionPolicyVersion",
        "retainedUntil",
        "registeredAt"
      ])
    );
    expect(artifactColumns).not.toEqual(
      expect.arrayContaining([
        "rawPayload",
        "payload",
        "plaintext",
        "ciphertext",
        "signedUrl",
        "reusableSignedUrl",
        "pan",
        "cvv",
        "encryptedCard"
      ])
    );
    expect(getTableColumns(financeArtifacts).byteLength.getSQLType()).toBe("numeric(38, 0)");
    expect(getTableConfig(financeArtifacts).foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_artifacts_provider_identity_fk",
        "finance_artifacts_retention_policy_fk"
      ])
    );
    expect(getTableConfig(financeArtifacts).indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "finance_artifacts_provider_scope_digest_unique",
        "finance_artifacts_bank_scope_digest_unique",
        "finance_artifacts_provider_history_idx",
        "finance_artifacts_bank_history_idx"
      ])
    );
    expect(
      getTableConfig(financeArtifactAccessEvents).indexes.map((index) => index.config.name)
    ).toContain("finance_artifact_access_events_service_purpose_time_idx");

    const tombstoneConfig = getTableConfig(financeArtifactTombstones);
    expect(tombstoneConfig.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_artifact_tombstones_provider_identity_fk",
        "finance_artifact_tombstones_retention_policy_fk",
        "finance_artifact_tombstones_exact_deletion_audit_fk",
        "finance_artifact_tombstones_exact_purge_request_fk",
        "finance_artifact_tombstones_verified_purge_attempt_fk"
      ])
    );
    expect(tombstoneConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "finance_artifact_tombstones_binding_kind_check",
        "finance_artifact_tombstones_exact_binding_check",
        "finance_artifact_tombstones_deletion_audit_check"
      ])
    );

    const holdConfig = getTableConfig(financeArtifactLegalHolds);
    expect(holdConfig.foreignKeys.map((key) => key.getName())).toContain(
      "finance_artifact_legal_holds_applied_event_fk"
    );
    expect(holdConfig.checks.map((check) => check.name)).toContain(
      "finance_artifact_legal_holds_transition_check"
    );

    const incidentConfig = getTableConfig(financeArtifactSecurityIncidents);
    expect(incidentConfig.foreignKeys.map((key) => key.getName())).toContain(
      "finance_artifact_security_incidents_provider_identity_fk"
    );
    expect(incidentConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "finance_artifact_security_incidents_binding_kind_check",
        "finance_artifact_security_incidents_exact_binding_check"
      ])
    );

    for (const tableName of [
      "finance_artifact_retention_policies",
      "finance_artifacts",
      "finance_artifact_access_events",
      "finance_artifact_purge_requests",
      "finance_artifact_purge_attempts",
      "finance_artifact_tombstones",
      "finance_artifact_legal_holds",
      "finance_artifact_security_incidents"
    ]) {
      expect(financeArtifactImmutabilitySql).toContain(`before truncate on ${tableName}`);
    }
    expect(financeArtifactImmutabilitySql).toContain("finance_validate_artifact_tombstone_insert");
    expect(financeArtifactImmutabilitySql).toContain(
      "finance_validate_artifact_purge_request_insert"
    );
    expect(financeArtifactImmutabilitySql).toContain("finance_require_verified_purge_tombstone");
    expect(financeArtifactDeferredBankCashPoolForeignKeys).toEqual([
      expect.objectContaining({ sourceTable: "finance_artifacts" }),
      expect.objectContaining({ sourceTable: "finance_artifact_tombstones" }),
      expect.objectContaining({ sourceTable: "finance_artifact_security_incidents" })
    ]);
    expect(financeArtifactImmutabilitySql).toContain("finance_validate_artifact_retention_insert");
    expect(financeArtifactImmutabilitySql).toContain("new.registered_at := clock_timestamp()");
    expect(financeArtifactImmutabilitySql).toContain(
      "new.retained_until := expected_retained_until"
    );
    expect(financeArtifactImmutabilitySql).toContain("clock_timestamp() < source.retained_until");
    expect(financeArtifactImmutabilitySql).toContain("released.applied_event_id = applied.id");
    expect(financeArtifactImmutabilitySql).toMatch(
      /finance_validate_artifact_legal_hold_event\(\)[\s\S]*for update;[\s\S]*new\.action = 'applied'[\s\S]*finance_artifact_purge_requests/
    );
    const accessTimeFunction = financeArtifactImmutabilitySql.slice(
      financeArtifactImmutabilitySql.indexOf(
        "create or replace function finance_stamp_artifact_access_event_time()"
      ),
      financeArtifactImmutabilitySql.indexOf(
        "create trigger finance_stamp_artifact_access_event_time"
      )
    );
    expect(accessTimeFunction).not.toContain("new.action = 'applied'");
    expect(financeArtifactImmutabilitySql).toContain("new.occurred_at := clock_timestamp()");
    expect(financeArtifactImmutabilitySql).toContain("new.observed_at := clock_timestamp()");
    expect(financeArtifactImmutabilitySql).toContain("new.occurred_at < applied.occurred_at");
  });

  it("stores immutable credential versions with append-only lifecycle and a guarded current head", () => {
    expect(getTableName(financeRestrictedProviderCredentials)).toBe(
      "finance_restricted_provider_credentials"
    );
    expect(getTableName(financeRestrictedProviderCredentialLifecycleEvents)).toBe(
      "finance_restricted_provider_credential_lifecycle_events"
    );
    expect(getTableName(financeRestrictedProviderCredentialHeads)).toBe(
      "finance_restricted_provider_credential_heads"
    );
    expect(getTableName(financeTransientSecretRefs)).toBe("finance_transient_secret_refs");
    expect(getTableName(financeTransientSecretConsumptions)).toBe(
      "finance_transient_secret_consumptions"
    );

    const credentialColumns = Object.keys(getTableColumns(financeRestrictedProviderCredentials));
    const transientColumns = Object.keys(getTableColumns(financeTransientSecretRefs));
    for (const forbidden of [
      "pan",
      "cvv",
      "cvc",
      "cardNumber",
      "rawCard",
      "encryptedCard",
      "cardEncrypted",
      "tokenValue"
    ]) {
      expect(credentialColumns).not.toContain(forbidden);
      expect(transientColumns).not.toContain(forbidden);
    }
    expect(credentialColumns).toEqual(
      expect.arrayContaining([
        "credentialId",
        "credentialVersion",
        "seriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "providerCredentialFingerprint",
        "restrictedTokenHandleRef",
        "displayBrand",
        "displayLast4",
        "displayMask",
        "expiryMonth",
        "expiryYear",
        "consentId",
        "consentVersion"
      ])
    );
    expect(credentialColumns).not.toContain("lifecycle");
    expect(getTableConfig(financeRestrictedProviderCredentials).foreignKeys.map((key) => key.getName())).toContain(
      "finance_restricted_provider_credentials_saved_card_consent_fk"
    );
    expect(
      Object.keys(getTableColumns(financeRestrictedProviderCredentialLifecycleEvents))
    ).toEqual(
      expect.arrayContaining([
        "credentialId",
        "credentialVersion",
        "eventSequence",
        "lifecycle",
        "reasonCode",
        "occurredAt"
      ])
    );
    expect(Object.keys(getTableColumns(financeRestrictedProviderCredentialHeads))).toEqual(
      expect.arrayContaining([
        "seriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "providerCustomerId",
        "currentCredentialId",
        "currentCredentialVersion",
        "currentLifecycle",
        "lifecycleEventSequence",
        "headVersion"
      ])
    );
    expect(transientColumns).toEqual(
      expect.arrayContaining([
        "secretRefId",
        "seriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "sealedSecretRef",
        "providerExpiresAt"
      ])
    );
    expect(
      getTableConfig(financeTransientSecretConsumptions).indexes.map((index) => index.config.name)
    ).toContain("finance_transient_secret_consumptions_one_use_unique");
    for (const tableName of [
      "finance_restricted_provider_credentials",
      "finance_restricted_provider_credential_lifecycle_events",
      "finance_restricted_provider_credential_heads",
      "finance_transient_secret_refs",
      "finance_transient_secret_consumptions"
    ]) {
      expect(financeProviderCredentialImmutabilitySql).toContain(`before truncate on ${tableName}`);
    }
    expect(financeProviderCredentialImmutabilitySql).toContain(
      "finance_validate_provider_credential_head"
    );
    expect(financeProviderCredentialImmutabilitySql).toContain(
      "new.lifecycle <> 'pending_activation'"
    );
    expect(financeProviderCredentialImmutabilitySql).toContain("latest_lifecycle = 'active'");
    expect(financeProviderCredentialImmutabilitySql).toContain(
      "new.updated_at := clock_timestamp()"
    );
    expect(financeProviderCredentialImmutabilitySql).toContain(
      "new.consumed_at := clock_timestamp()"
    );
    expect(financeProviderCredentialImmutabilitySql).toContain(
      "new.consumed_at > secret.provider_expires_at"
    );
  });
});
