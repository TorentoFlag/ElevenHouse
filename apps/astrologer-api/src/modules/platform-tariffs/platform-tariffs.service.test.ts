import {
  createFinanceOperationResourcePolicyDraft,
  publishFinanceOperationResourcePolicyDraft,
  type SavedCardDisclosureReaderPort
} from "@elevenhouse/domain/finance-core";
import {
  type AuditLogStore,
  type PlatformTariffEntitlementStore,
  type PlatformTariffAuthorityStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { SavedCardSetupOwnerSession } from "@elevenhouse/db/finance";

import { AstrologerTariffsService } from "./platform-tariffs.service";
import type { AstrologerTariffUnitOfWork } from "./platform-tariffs.unit-of-work";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const subscriptionId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-04T12:00:00.000Z");

describe("AstrologerTariffsService", () => {
  it("exposes only published tariffs and the current tariff snapshot", async () => {
    const harness = createHarness();

    await expect(harness.service.getCatalog(session())).resolves.toMatchObject({
      tariffs: [expect.objectContaining({ tariffSeriesId: "pro", lifecycle: "published" })],
      currentSubscription: expect.objectContaining({ subscriptionId, tariffSeriesId: "pro" })
    });
  });

  it("projects products access from the server-resolved immutable tariff snapshot", async () => {
    const harness = createHarness({ features: ["products"] });

    await expect(harness.service.getEntitlements(session())).resolves.toEqual({
      products: {
        read: "allow",
        mutation: "allow"
      }
    });
  });

  it("keeps a selected paid tariff visible while it still needs saved-card setup", async () => {
    const harness = createHarness({ subscriptionState: "incomplete_setup" });

    await expect(harness.service.getCatalog(session())).resolves.toMatchObject({
      currentSubscription: {
        subscriptionId,
        state: "incomplete_setup",
        startsAt: null,
        endsAt: null
      }
    });
  });

  it("creates a paid selection exactly once and makes the next required action explicit", async () => {
    const harness = createHarness();

    const first = await harness.service.startSubscription(
      session(),
      "tariff-select:0001",
      { tariffSeriesId: "pro", version: 1, billingCycle: "month" }
    );
    const replay = await harness.service.startSubscription(
      session(),
      "tariff-select:0001",
      { tariffSeriesId: "pro", version: 1, billingCycle: "month" }
    );

    expect(first).toEqual({
      subscription: expect.objectContaining({ subscriptionId, state: "incomplete_setup" }),
      billingCycle: "month",
      nextAction: "saved_card_setup_required"
    });
    expect(replay).toEqual(first);
    expect(harness.beginSubscriptionPurchase).toHaveBeenCalledTimes(1);
    expect(harness.auditLogStore.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "platform_tariff.subscription_selected", targetId: subscriptionId })
    );
  });

  it("starts only a consent-bound setup session after the exact disclosure was accepted", async () => {
    const harness = createHarness({ subscriptionState: "incomplete_setup" });

    await expect(harness.service.getSavedCardDisclosure(session(), subscriptionId, "ru"))
      .resolves.toMatchObject({ expectedSubscriptionVersion: 1, disclosure: { locale: "ru" } });
    await expect(harness.service.initiateSavedCardSetup(
      session(),
      subscriptionId,
      "tariff-setup:0001",
      {
        expectedSubscriptionVersion: 1,
        disclosureVersion: 1,
        disclosureDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        noticeLocale: "ru",
        acceptedDisclosure: true,
        buyerContact: { kind: "email", value: "billing@example.com" }
      }
    )).resolves.toEqual({
      setupSessionId: "33333333-3333-4333-8333-333333333333",
      setupSessionVersion: 1,
      state: "setup_requested"
    });
    expect(harness.savedCardSetupInitiation.initiateSavedCardSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId,
        expectedSubscriptionVersion: 1,
        noticeLocale: "ru",
        buyerContact: { kind: "email", value: "billing@example.com" }
      })
    );
  });

  it("does not expose browser tokenization before the worker confirms the provider setup", async () => {
    const harness = createHarness({ subscriptionState: "incomplete_setup" });
    const pending = await harness.service.getSavedCardSetupStatus(
      session(),
      "33333333-3333-4333-8333-333333333333"
    );
    expect(pending).toMatchObject({ state: "setup_requested", nextAction: "provider_setup_pending", tokenization: null });

    harness.findForOwner.mockResolvedValueOnce(tokenizableSession());
    await expect(harness.service.getSavedCardSetupStatus(
      session(),
      "33333333-3333-4333-8333-333333333333"
    )).resolves.toMatchObject({
      nextAction: "tokenize_card",
      tokenization: {
        providerSetupId: "44444444-4444-4444-8444-444444444444",
        apiBaseUrl: "https://api.arcpay.space"
      }
    });
  });

  it("resumes the latest owner-scoped setup session for an incomplete subscription", async () => {
    const harness = createHarness({ subscriptionState: "incomplete_setup" });
    harness.findForSubscriptionOwner.mockResolvedValueOnce(tokenizableSession());

    await expect(harness.service.getCurrentSavedCardSetupStatus(
      session(),
      subscriptionId
    )).resolves.toMatchObject({
      setupSessionId: "33333333-3333-4333-8333-333333333333",
      subscriptionId,
      nextAction: "tokenize_card"
    });

    expect(harness.findForSubscriptionOwner).toHaveBeenCalledWith({ subscriptionId, ownerUserId });
  });

  it("seals the browser token before atomically requesting provider execute", async () => {
    const harness = createHarness({ subscriptionState: "incomplete_setup" });
    harness.findForOwner.mockResolvedValueOnce(tokenizableSession());

    await expect(harness.service.executeSavedCardSetup(
      session(),
      "33333333-3333-4333-8333-333333333333",
      "tariff-setup-execute:0001",
      tokenizationRequest()
    )).resolves.toEqual({
      setupSessionId: "33333333-3333-4333-8333-333333333333",
      setupSessionVersion: 4,
      state: "execution_pending"
    });

    expect(harness.sealTokenizationSecret).toHaveBeenCalledWith(expect.objectContaining({
      providerSetupId: "44444444-4444-4444-8444-444444444444",
      cardTokenId: tokenizationRequest().cardTokenId
    }));
    expect(harness.sealThreeDsMethodContext).toHaveBeenCalledWith(expect.objectContaining({
      providerSetupId: "44444444-4444-4444-8444-444444444444",
      browserInfo: tokenizationRequest().browserInfo
    }));
    const command = harness.savedCardSetupExecution.executeSavedCardSetup.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      setupSessionId: "33333333-3333-4333-8333-333333333333",
      expectedSetupSessionVersion: 3,
      sealedTokenizationSecret: { secretRef: expect.stringMatching(/^kms:\/\/s3\//) },
      sealedThreeDsMethodContext: { secretRef: expect.stringMatching(/^kms:\/\/s3\//) }
    });
    expect(JSON.stringify(command)).not.toContain(tokenizationRequest().cardTokenId);
  });

  it("delivers a sealed 3DS handoff only to the owner and omits server completion values", async () => {
    const harness = createHarness({ subscriptionState: "incomplete_setup" });
    const rawResponse = new TextEncoder().encode(JSON.stringify({
      payment_id: "44444444-4444-4444-8444-444444444444",
      status: "pending_3ds",
      next_action: {
        type: "three_ds_method",
        three_ds: {
          version: "2",
          phase: "method",
          completion_endpoint: "/v1/payments/44444444-4444-4444-8444-444444444444/complete-3ds-method",
          three_ds_server_trans_id: "server-only-transaction",
          submit: { method: "POST", url: "https://acs.example.test/method", target: "hidden_iframe", fields: [{ name: "threeDSMethodData", value: "opaque" }] }
        }
      }
    }));
    const digest = `sha256:${createHash("sha256").update(rawResponse).digest("hex")}` as const;
    harness.findForOwner.mockResolvedValueOnce({ ...tokenizableSession(), setupSessionVersion: 5, state: "requires_customer_action" });
    harness.findPendingForOwner.mockResolvedValueOnce({
      setupSessionId: "33333333-3333-4333-8333-333333333333", setupSessionVersion: 5, ownerUserId,
      providerSetupId: "44444444-4444-4444-8444-444444444444",
      providerAccount: { seriesId: "arc-pay", providerAccountId: "primary", identityVersion: 1 },
      actionType: "three_ds_method", phase: "method",
      providerResponseArtifact: { artifactId: "arc-response-1", sha256Digest: digest, byteLength: rawResponse.byteLength },
      providerResponseArtifactDigest: digest
    });
    harness.resolvePrivateArtifact.mockResolvedValueOnce({
      artifactClass: "provider_response", artifact: { artifactId: "arc-response-1", sha256Digest: digest, byteLength: rawResponse.byteLength },
      privateObject: { privateObjectKey: "artifact", privateObjectVersion: "1", envelopeKeyVersion: "kms" }, accessAuditEventId: "70000000-0000-4000-8000-000000000007"
    });
    harness.readImmutable.mockResolvedValueOnce({ contentType: "application/json", sha256Digest: digest, byteLength: rawResponse.byteLength, bytes: rawResponse });

    const result = await harness.service.getSavedCardSetupStatus(session(), "33333333-3333-4333-8333-333333333333");
    expect(result).toMatchObject({ state: "requires_customer_action", nextAction: "complete_3ds", customerAction: { type: "three_ds_method", threeDs: { submit: { target: "hidden_iframe" } } } });
    expect(JSON.stringify(result)).not.toContain("server-only-transaction");
  });

  it("accepts only the Method indicator and commits a server-side Method dispatch", async () => {
    const harness = createHarness({ subscriptionState: "incomplete_setup" });
    harness.findPendingForOwner.mockResolvedValueOnce({
      customerActionId: "66666666-6666-4666-8666-666666666666",
      setupSessionId: "33333333-3333-4333-8333-333333333333", setupSessionVersion: 5, ownerUserId,
      providerSetupId: "44444444-4444-4444-8444-444444444444",
      providerAccount: { seriesId: "arc-pay", providerAccountId: "primary", identityVersion: 1 },
      actionType: "three_ds_method", phase: "method",
      providerResponseArtifact: { artifactId: "arc-response-1", sha256Digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", byteLength: 42 },
      providerResponseArtifactDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      threeDsMethodContextSecretRef: "kms://s3/eyJwcml2YXRlT2JqZWN0S2V5IjoidGhyZWUtZHMifQ",
      threeDsMethodContextProviderExpiresAt: "2026-08-04T12:04:00Z"
    });

    await expect(harness.service.completeSavedCardSetupThreeDsMethod(
      session(), "33333333-3333-4333-8333-333333333333", "tariff-setup-method:0001",
      { expectedSetupSessionVersion: 5, completionIndicator: "Y" }
    )).resolves.toEqual({ setupSessionId: "33333333-3333-4333-8333-333333333333", setupSessionVersion: 6, state: "execution_pending" });

    expect(harness.savedCardSetupThreeDsMethodCompletion.completeThreeDsMethod).toHaveBeenCalledWith(expect.objectContaining({
      customerActionId: "66666666-6666-4666-8666-666666666666", completionIndicator: "Y"
    }));
  });
});

function createHarness(
  input: Readonly<{
    subscriptionState?: "active" | "incomplete_setup";
    features?: readonly ["products"];
  }> = {}
) {
  const auditLogStore = { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore;
  const beginSubscriptionPurchase = vi.fn(async () => ({
    subscription: {
      subscriptionId,
      ownerUserId,
      tariffSeriesId: "pro",
      tariffVersion: 1,
      tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      commissionBpsSnapshot: 800,
      version: 1,
      billingCycle: "month" as const,
      state: "incomplete_setup" as const,
      startsAt: null,
      endsAt: null
    },
    invoice: null
  }));
  const store = {
    listTariffVersions: vi.fn(async () => [publishedTariff(input.features), { ...publishedTariff(input.features), lifecycle: "draft" as const }]),
    findActiveOrPendingSubscription: vi.fn(async () => ({
      subscriptionId,
      ownerUserId,
      tariffSeriesId: "pro",
      tariffVersion: 1,
      tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      commissionBpsSnapshot: 800,
      version: 1,
      state: input.subscriptionState ?? "active",
      startsAt: input.subscriptionState === "incomplete_setup" ? null : "2026-08-01T00:00:00.000Z",
      endsAt: input.subscriptionState === "incomplete_setup" ? null : "2026-09-01T00:00:00.000Z"
    })),
    beginSubscriptionPurchase,
    findCurrentSubscription: vi.fn(async () => ({
      subscriptionId,
      ownerUserId,
      tariffSeriesId: "pro",
      tariffVersion: 1,
      tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      commissionBpsSnapshot: 800,
      version: 1,
      state: "active" as const,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z"
    })),
    findTariffVersion: vi.fn(async () => publishedTariff(input.features)),
    findLatestHistoricalCapabilityGrant: vi.fn(async () => null)
  } as unknown as Pick<
    PlatformTariffAuthorityStore,
    "listTariffVersions" | "findActiveOrPendingSubscription"
  > & PlatformTariffEntitlementStore;
  const commands = new Map<string, Record<string, unknown>>();
  const savedCardSetupInitiation = {
    initiateSavedCardSetup: vi.fn(async () => ({
      kind: "saved_card_setup_initiation_receipt" as const,
      setupSessionId: "33333333-3333-4333-8333-333333333333",
      setupSessionVersion: 1,
      consentId: "saved-card-consent:33333333-3333-4333-8333-333333333333",
      consentVersion: "1",
      state: "setup_requested" as const
    }))
  };
  const savedCardSetupExecution = {
    executeSavedCardSetup: vi.fn(async (command) => ({
      kind: "saved_card_setup_execution_receipt" as const,
      setupSessionId: command.setupSessionId,
      setupSessionVersion: command.expectedSetupSessionVersion + 1,
      providerOperationIntentId: command.providerOperationIntentId,
      state: "execution_pending" as const
    }))
  };
  const savedCardSetupThreeDsMethodCompletion = {
    completeThreeDsMethod: vi.fn(async (command) => ({ providerOperationIntentId: command.providerOperationIntentId }))
  };
  const sealTokenizationSecret = vi.fn(async () => ({
    kind: "sealed_one_time_provider_secret_ref" as const,
    secretRef: "kms://s3/eyJwcml2YXRlT2JqZWN0S2V5IjoidGVzdCJ9",
    providerExpiresAt: "2026-08-04T23:59:00Z",
    providerConsumption: "one_time" as const
  }));
  const sealThreeDsMethodContext = vi.fn(async () => ({
    kind: "sealed_one_time_provider_secret_ref" as const,
    secretRef: "kms://s3/eyJwcml2YXRlT2JqZWN0S2V5IjoidGhyZWUtZHMifQ",
    providerExpiresAt: "2026-08-04T23:59:00Z",
    providerConsumption: "one_time" as const
  }));
  const unitOfWork = {
    executeIdempotent: async (input) => {
      const existing = commands.get(input.command.idempotencyKey);
      if (existing) return { kind: "replayed" as const, value: await input.replay(existing) };
      const created = await input.create({
        store: store as unknown as PlatformTariffAuthorityStore,
        auditLogStore,
        savedCardSetupInitiation,
        savedCardSetupExecution,
        savedCardSetupThreeDsMethodCompletion: savedCardSetupThreeDsMethodCompletion as never,
        tariffInvoiceThreeDsMethodCompletion: {} as never
      });
      commands.set(input.command.idempotencyKey, created.result);
      return { kind: "created" as const, value: created.value };
    }
  } satisfies AstrologerTariffUnitOfWork;
  const findForOwner = vi.fn(async (): Promise<SavedCardSetupOwnerSession> => ({
    setupSessionId: "33333333-3333-4333-8333-333333333333",
    subscriptionId,
      setupSessionVersion: 1,
      state: "setup_requested" as const,
      providerSetupId: null,
      providerCustomerId: "customer-1",
      economicPaymentIntentId: null,
      providerAccount: { seriesId: "arc-pay", providerAccountId: "primary", identityVersion: 1 }
  }));
  const findForSubscriptionOwner = vi.fn(async (): Promise<SavedCardSetupOwnerSession | null> => null);
  const findPendingForOwner = vi.fn();
  const resolvePrivateArtifact = vi.fn();
  const readImmutable = vi.fn();

  return {
    service: new AstrologerTariffsService(
      store,
      unitOfWork,
      { now: () => now } as never,
      {
        findPublishedDisclosure: vi.fn(async () => ({
          disclosureSeriesId: "platform-tariff-saved-card",
          version: 1,
          locale: "ru" as const,
          body: "Условия сохранённой карты.",
          canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
        }))
      } satisfies SavedCardDisclosureReaderPort,
      {
        findForPreparation: vi.fn(),
        findForOwner,
        findForSubscriptionOwner
      } as never,
      {
        findPendingForOwner
      } as never,
      {
        findPublishedForOperation: vi.fn(async (input) => input.operationKind === "platform_card_setup_complete_3ds_method" ? savedCardSetupMethodPolicy() : savedCardSetupExecutePolicy())
      } as never,
      {
        writeImmutable: vi.fn(async (input) => ({
          privateObjectKey: `finance/${input.artifactId}`,
          privateObjectVersion: "version-1",
          envelopeKeyVersion: "kms-key-1",
          sha256Digest: input.expectedSha256Digest,
          byteLength: input.bytes.byteLength,
          contentType: input.contentType
        })),
        readImmutable
      } as never,
      {
        sealArcPayCardTokenizationSecret: sealTokenizationSecret,
        sealArcPayThreeDsMethodContext: sealThreeDsMethodContext
      } as never,
      {
        resolvePrivateArtifact
      } as never,
      {
        getOrThrow: vi.fn(() => ({
          arcPayConfigured: true,
          arcPayEnvironment: "sandbox" as const,
          arcPayBrowserTokenization: {
            apiBaseUrl: "https://api.arcpay.space",
            publishableKey: "pk_test_example"
          },
          financeArtifactStorage: {
            requestRetention: { policyId: "provider-request", policyVersion: "1" }
          },
          savedCardDisclosureSeriesId: "platform-tariff-saved-card"
        }))
      } as never
    ),
    beginSubscriptionPurchase,
    auditLogStore,
    savedCardSetupInitiation,
    savedCardSetupExecution,
    savedCardSetupThreeDsMethodCompletion,
    sealTokenizationSecret,
    sealThreeDsMethodContext,
    findForOwner,
    findForSubscriptionOwner,
    findPendingForOwner,
    resolvePrivateArtifact,
    readImmutable
  };
}

function tokenizableSession() {
  return {
    setupSessionId: "33333333-3333-4333-8333-333333333333",
    subscriptionId,
    setupSessionVersion: 3,
    state: "tokenization_required" as const,
    providerSetupId: "44444444-4444-4444-8444-444444444444",
    providerCustomerId: "customer-1",
    economicPaymentIntentId: "setup-intent-1",
    providerAccount: { seriesId: "arc-pay", providerAccountId: "primary", identityVersion: 1 }
  };
}

function tokenizationRequest() {
  return {
    expectedSetupSessionVersion: 3,
    cardTokenId: "55555555-5555-4555-8555-555555555555",
    browserInfo: {
      acceptHeader: "application/json",
      language: "ru-RU",
      screenWidth: 1440,
      screenHeight: 900,
      colorDepth: 24 as const,
      timezoneOffsetMinutes: -180,
      userAgent: "Mozilla/5.0",
      javaEnabled: false,
      windowSize: "05" as const
    }
  };
}

function savedCardSetupExecutePolicy() {
  return publishFinanceOperationResourcePolicyDraft(createFinanceOperationResourcePolicyDraft({
    policyId: "platform-card-setup-execute",
    version: 1,
    operationKind: "platform_card_setup_execute",
    maximumRows: 10,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 65_536
  }));
}

function savedCardSetupMethodPolicy() {
  return publishFinanceOperationResourcePolicyDraft(createFinanceOperationResourcePolicyDraft({
    policyId: "platform-card-setup-complete-3ds-method", version: 1,
    operationKind: "platform_card_setup_complete_3ds_method", maximumRows: 10,
    maximumDecimalDigits: 38, maximumArtifactBytes: 65_536
  }));
}

function session() {
  return { currentAstrologerAccount: { account: { id: ownerUserId } } } as never;
}

function publishedTariff(features: readonly ["products"] | undefined = undefined) {
  return {
    tariffSeriesId: "pro",
    version: 1,
    draftRevision: 1,
    lifecycle: "published" as const,
    name: "Pro",
    tagline: "For active practice",
    monthlyPriceMinor: 2_500,
    yearlyPriceMinor: 25_000,
    monthlyRecurringFrequencyDays: 31,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 800,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 0,
    features: features ?? [],
    canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
  };
}
