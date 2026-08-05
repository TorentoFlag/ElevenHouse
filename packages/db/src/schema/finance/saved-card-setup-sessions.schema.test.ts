import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeSavedCardSetupSessionIntegritySql,
  financeSavedCardSetupSessions,
  financeSavedCardSetupSessionStateValues
} from "./saved-card-setup-sessions.schema";

describe("saved-card setup session schema", () => {
  it("binds browser setup state to one subscription, consent, provider identity and zero-amount intent", () => {
    expect(getTableName(financeSavedCardSetupSessions)).toBe("finance_saved_card_setup_sessions");
    expect(financeSavedCardSetupSessionStateValues).toEqual([
      "setup_requested",
      "preparation_pending",
      "tokenization_required",
      "execution_pending",
      "requires_customer_action",
      "credential_active",
      "setup_failed",
      "expired",
      "provider_unknown"
    ]);
    expect(Object.keys(getTableColumns(financeSavedCardSetupSessions))).toEqual([
      "id",
      "subscriptionId",
      "ownerUserId",
      "expectedSubscriptionVersion",
      "consentId",
      "consentVersion",
      "seriesId",
      "providerAccountId",
      "providerIdentityVersion",
      "providerCustomerId",
      "economicPaymentIntentId",
      "providerSetupId",
      "threeDsMethodContextSecretRefId",
      "savedCardCredentialId",
      "savedCardCredentialVersion",
      "state",
      "version",
      "createdAt",
      "updatedAt",
      "terminalAt"
    ]);
    expect(getTableConfig(financeSavedCardSetupSessions).foreignKeys.map((item) => item.getName())).toEqual(
      expect.arrayContaining([
        "finance_saved_card_setup_sessions_subscription_fk",
        "finance_saved_card_setup_sessions_consent_fk",
        "finance_saved_card_setup_sessions_provider_identity_fk",
        "finance_saved_card_setup_sessions_economic_intent_fk",
        "finance_saved_card_setup_sessions_three_ds_method_context_secret_fk",
        "finance_saved_card_setup_sessions_credential_fk"
      ])
    );
    expect(financeSavedCardSetupSessionIntegritySql).toContain(
      "saved-card setup session identity is immutable"
    );
    expect(financeSavedCardSetupSessionIntegritySql).toContain(
      "saved-card setup session transition is invalid"
    );
  });
});
