import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeRestrictedProviderCredentialActivationEvidence,
  financeRestrictedProviderCredentialActivationEvidenceImmutabilitySql
} from "./provider-credential-activation-evidence.schema";

describe("restricted provider credential activation evidence schema", () => {
  it("keeps the canonical active-card observation immutable and bound to exactly one credential", () => {
    expect(getTableName(financeRestrictedProviderCredentialActivationEvidence)).toBe(
      "finance_restricted_provider_credential_activation_evidence"
    );
    expect(Object.keys(getTableColumns(financeRestrictedProviderCredentialActivationEvidence))).toEqual([
      "credentialId",
      "credentialVersion",
      "artifactId",
      "artifactDigest",
      "observedAt",
      "recordedAt"
    ]);
    expect(getTableConfig(financeRestrictedProviderCredentialActivationEvidence).foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "finance_restricted_provider_credential_activation_evidence_credential_fk",
        "finance_restricted_provider_credential_activation_evidence_artifact_fk"
      ])
    );
    expect(financeRestrictedProviderCredentialActivationEvidenceImmutabilitySql).toContain(
      "provider credential activation evidence is append-only"
    );
  });
});
