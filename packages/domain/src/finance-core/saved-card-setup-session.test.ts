import { describe, expect, it } from "vitest";

import {
  activateSavedCardSetupCredential,
  createSavedCardSetupSession,
  prepareSavedCardSetup,
  recordCardSetupCreation,
  requireSavedCardSetupCustomerAction,
  SavedCardSetupSessionError,
  requestSavedCardSetupExecution
} from "./saved-card-setup-session";

const base = {
  setupSessionId: "setup-session-1",
  subscriptionId: "subscription-1",
  ownerUserId: "owner-1",
  expectedSubscriptionVersion: 1,
  consentId: "consent-1",
  consentVersion: "1"
};

describe("saved-card setup session", () => {
  it("does not create money authority while moving from requested setup to browser tokenization", () => {
    const requested = createSavedCardSetupSession(base);
    const prepared = prepareSavedCardSetup({
      current: requested,
      expectedVersion: 1,
      economicPaymentIntentId: "economic-intent-1"
    });
    const tokenization = recordCardSetupCreation({
      current: prepared,
      expectedVersion: 2,
      providerSetupId: "11111111-1111-4111-8111-111111111111"
    });

    expect(requested).toMatchObject({ state: "setup_requested", version: 1, providerSetupId: null });
    expect(prepared).toMatchObject({ state: "preparation_pending", version: 2, economicPaymentIntentId: "economic-intent-1" });
    expect(tokenization).toMatchObject({ state: "tokenization_required", version: 3 });
    expect(requestSavedCardSetupExecution({ current: tokenization, expectedVersion: 3 }))
      .toMatchObject({ state: "execution_pending", version: 4 });
  });

  it("activates a credential only from a verified execution path", () => {
    const requested = createSavedCardSetupSession(base);
    const prepared = prepareSavedCardSetup({ current: requested, expectedVersion: 1, economicPaymentIntentId: "economic-intent-1" });
    const tokenization = recordCardSetupCreation({
      current: prepared,
      expectedVersion: 2,
      providerSetupId: "11111111-1111-4111-8111-111111111111"
    });
    const execution = requestSavedCardSetupExecution({ current: tokenization, expectedVersion: 3 });

    expect(activateSavedCardSetupCredential({
      current: execution,
      expectedVersion: 4,
      savedCardCredentialId: "credential-1",
      savedCardCredentialVersion: "1"
    })).toMatchObject({ state: "credential_active", version: 5 });
    expect(() => activateSavedCardSetupCredential({
      current: tokenization,
      expectedVersion: 3,
      savedCardCredentialId: "credential-1",
      savedCardCredentialVersion: "1"
    })).toThrow(SavedCardSetupSessionError);
  });

  it("keeps a 3DS-pending setup non-terminal until canonical credential confirmation", () => {
    const requested = createSavedCardSetupSession(base);
    const prepared = prepareSavedCardSetup({ current: requested, expectedVersion: 1, economicPaymentIntentId: "economic-intent-1" });
    const tokenization = recordCardSetupCreation({
      current: prepared,
      expectedVersion: 2,
      providerSetupId: "11111111-1111-4111-8111-111111111111"
    });
    const execution = requestSavedCardSetupExecution({ current: tokenization, expectedVersion: 3 });
    const action = requireSavedCardSetupCustomerAction({ current: execution, expectedVersion: 4 });

    expect(action).toMatchObject({ state: "requires_customer_action", version: 5 });
    expect(activateSavedCardSetupCredential({
      current: action,
      expectedVersion: 5,
      savedCardCredentialId: "credential-1",
      savedCardCredentialVersion: "1"
    })).toMatchObject({ state: "credential_active", version: 6 });
  });
});
