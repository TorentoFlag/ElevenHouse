import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";

import { financeArtifacts } from "./finance-artifacts.schema";
import { financeRevisionString } from "./finance-values";
import { financeRestrictedProviderCredentials } from "./provider-credentials.schema";

/**
 * Immutable provenance for the canonical ArcPay `/cards` observation used to activate a
 * reusable credential. The credential row remains secret-free; this companion row proves the
 * exact sealed evidence from which active status, display data and expiry were accepted.
 */
export const financeRestrictedProviderCredentialActivationEvidence = pgTable(
  "finance_restricted_provider_credential_activation_evidence",
  {
    credentialId: varchar("credential_id", { length: 160 }).notNull(),
    credentialVersion: financeRevisionString("credential_version").notNull(),
    artifactId: varchar("artifact_id", { length: 160 }).notNull(),
    artifactDigest: varchar("artifact_digest", { length: 71 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.credentialId, table.credentialVersion],
      name: "finance_restricted_provider_credential_activation_evidence_pk"
    }),
    foreignKey({
      columns: [table.credentialId, table.credentialVersion],
      foreignColumns: [
        financeRestrictedProviderCredentials.credentialId,
        financeRestrictedProviderCredentials.credentialVersion
      ],
      name: "finance_restricted_provider_credential_activation_evidence_credential_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_restricted_provider_credential_activation_evidence_artifact_fk"
    }).onDelete("restrict"),
    check(
      "finance_restricted_provider_credential_activation_evidence_digest_check",
      sql`${table.credentialVersion} >= 1 and ${table.artifactDigest} ~ '^sha256:[a-f0-9]{64}$'`
    )
  ]
);

export const financeRestrictedProviderCredentialActivationEvidenceImmutabilitySql = `
create or replace function finance_reject_provider_credential_activation_evidence_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'provider credential activation evidence is append-only' using errcode = '55000';
end;
$$;

create trigger finance_restricted_provider_credential_activation_evidence_immutable
before update or delete on finance_restricted_provider_credential_activation_evidence
for each row execute function finance_reject_provider_credential_activation_evidence_mutation();
create trigger finance_restricted_provider_credential_activation_evidence_no_truncate
before truncate on finance_restricted_provider_credential_activation_evidence
for each statement execute function finance_reject_provider_credential_activation_evidence_mutation();
`;
