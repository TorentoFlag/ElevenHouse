import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  financeAuthorizationChallenges,
  financeAuthorizationGrants,
  financeWebAuthnCredentials,
  financeWebAuthnIdentityIntegritySql,
  financeWebAuthnRegistrationChallenges
} from "./finance-webauthn.schema";

describe("finance WebAuthn identity schema", () => {
  it("stores transaction challenges and one-time grants separately from public credentials", () => {
    expect(financeAuthorizationChallenges.id.primary).toBe(true);
    expect(financeAuthorizationGrants.authorizationId.primary).toBe(true);
    expect(financeWebAuthnCredentials.credentialId.primary).toBe(true);
    expect(financeWebAuthnRegistrationChallenges.id.primary).toBe(true);

    expect(financeAuthorizationChallenges.status.name).toBe("status");
    expect(financeAuthorizationGrants.status.name).toBe("status");
    expect(financeWebAuthnCredentials.status.name).toBe("status");
  });

  it("has database-owned checks and indexes for expiry, lifecycle and active credential lookup", () => {
    const challengeConfig = getTableConfig(financeAuthorizationChallenges);
    const grantConfig = getTableConfig(financeAuthorizationGrants);
    const credentialConfig = getTableConfig(financeWebAuthnCredentials);

    expect(challengeConfig.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "finance_authorization_challenges_lifecycle_check",
        "finance_authorization_challenges_expiry_check"
      ])
    );
    expect(grantConfig.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "finance_authorization_grants_lifecycle_check",
        "finance_authorization_grants_expiry_check"
      ])
    );
    expect(credentialConfig.checks.map((item) => item.name)).toContain(
      "finance_webauthn_credentials_counter_check"
    );
    expect(credentialConfig.indexes.map((item) => item.config.name)).toContain(
      "finance_webauthn_credentials_owner_active_index"
    );
  });

  it("makes actor-session binding and credential/challenge mutation fail closed in PostgreSQL", () => {
    expect(financeWebAuthnIdentityIntegritySql).toContain(
      "finance_assert_webauthn_session_owner"
    );
    expect(financeWebAuthnIdentityIntegritySql).toContain(
      "finance_authorization_challenges_mutation_guard"
    );
    expect(financeWebAuthnIdentityIntegritySql).toContain(
      "finance_authorization_grants_mutation_guard"
    );
    expect(financeWebAuthnIdentityIntegritySql).toContain(
      "finance_webauthn_credentials_mutation_guard"
    );
    expect(financeWebAuthnIdentityIntegritySql).toContain("finance_reject_webauthn_truncate");
    expect(financeWebAuthnIdentityIntegritySql).toContain("before truncate on finance_webauthn_credentials");
  });
});
