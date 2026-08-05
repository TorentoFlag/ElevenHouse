import { createHash } from "node:crypto";

import {
  digestFinanceCanonicalValueV1,
  type FinanceTransientSecretVaultPort,
  type ProviderOperationDispatchWorkItem,
  type ProviderOperationResultApplicationUnitOfWork,
  type SavedCardSetupResultUnitOfWork,
  type ProviderOperationTransportUnknownUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import { ArcPayCardSetupClientError } from "../arc-pay/arc-pay-card-setup-client";
import {
  createCardSetupDispatcher,
  createCardSetupExecuteDispatcher,
  createCardSetupThreeDsMethodDispatcher
} from "./card-setup-dispatcher";

const providerOperationIntentId = "20000000-0000-4000-8000-000000000002";
const economicPaymentIntentId = "40000000-0000-4000-8000-000000000004";
const economicPaymentSessionId = "50000000-0000-4000-8000-000000000005";
const providerSetupId = "70000000-0000-4000-8000-000000000007";

describe("card setup dispatcher", () => {
  it("fences a transport-indeterminate setup instead of allowing a blind fresh request", async () => {
    const envelope = cardSetupEnvelope();
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    const markUnknown = vi.fn(async () => undefined);
    const dispatcher = createCardSetupDispatcher({
      privateObjectStorage: storage(bytes),
      artifactRegistry: { registerSealedArtifact: vi.fn() },
      cardSetupClient: {
        createCardSetup: vi.fn(async () => {
          throw new ArcPayCardSetupClientError("transport");
        })
      } as unknown as ReturnType<typeof import("../arc-pay/arc-pay-card-setup-client").createArcPayCardSetupClient>,
      providerResult: { applyVerifiedProviderResult: vi.fn() } as unknown as ProviderOperationResultApplicationUnitOfWork,
      setupResult: { recordVerifiedCardSetupCreation: vi.fn() } as unknown as SavedCardSetupResultUnitOfWork,
      transportUnknown: {
        markProviderOperationTransportUnknown: markUnknown
      } as unknown as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" }
    });

    await expect(dispatcher.dispatch(workItem(envelope, bytes))).resolves.toBeUndefined();

    expect(markUnknown).toHaveBeenCalledWith({
      economicPaymentIntentId,
      expectedEconomicPaymentVersion: 1,
      providerOperationIntentId,
      expectedProviderOperationIntentVersion: 0
    });
  });

  it("seals exact provider evidence and records only the zero-amount setup creation result", async () => {
    const envelope = cardSetupEnvelope();
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    const responseBytes = new TextEncoder().encode(JSON.stringify({ id: providerSetupId }));
    const registerSealedArtifact = vi.fn(async () => ({
      artifactId: `arc-card-setup-response:${providerOperationIntentId}`,
      sha256Digest: digest(responseBytes),
      byteLength: responseBytes.byteLength
    }));
    const applyVerifiedProviderResult = vi.fn(async () => undefined);
    const recordVerifiedCardSetupCreation = vi.fn(async () => undefined);
    const dispatcher = createCardSetupDispatcher({
      privateObjectStorage: {
        ...storage(bytes),
        writeImmutable: vi.fn(async (input) => ({
          privateObjectKey: `private/${input.artifactId}`,
          privateObjectVersion: "version-1",
          envelopeKeyVersion: "key-1",
          contentType: input.contentType,
          sha256Digest: input.expectedSha256Digest,
          byteLength: input.bytes.byteLength
        }))
      },
      artifactRegistry: { registerSealedArtifact },
      cardSetupClient: {
        createCardSetup: vi.fn(async () => ({ providerSetupId, rawResponseBytes: responseBytes }))
      } as unknown as ReturnType<typeof import("../arc-pay/arc-pay-card-setup-client").createArcPayCardSetupClient>,
      providerResult: {
        applyVerifiedProviderResult
      } as unknown as ProviderOperationResultApplicationUnitOfWork,
      setupResult: { recordVerifiedCardSetupCreation } as unknown as SavedCardSetupResultUnitOfWork,
      transportUnknown: {
        markProviderOperationTransportUnknown: vi.fn()
      } as unknown as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" }
    });

    await dispatcher.dispatch(workItem(envelope, bytes));

    expect(applyVerifiedProviderResult).toHaveBeenCalledWith({
      economicPaymentIntentId,
      expectedEconomicPaymentVersion: 1,
      providerOperationIntentId,
      expectedProviderOperationIntentVersion: 0,
      operationEnvelope: expect.any(Object),
      evidence: expect.objectContaining({
        operationKind: "card_setup",
        purpose: "platform_card_setup",
        providerOperationId: providerSetupId,
        providerPaymentId: providerSetupId,
        amountMinor: "0",
        currency: "RUB",
        outcome: "succeeded",
        artifact: {
          artifactId: `arc-card-setup-response:${providerOperationIntentId}`,
          sha256Digest: digest(responseBytes),
          byteLength: responseBytes.byteLength
        }
      })
    });
    expect(recordVerifiedCardSetupCreation).toHaveBeenCalledWith({
      setupSessionId: "platform-card-setup-1",
      providerSetupId
    });
  });

  it("loads the one-time browser token only inside the execute worker and never treats pending 3DS as credential success", async () => {
    const envelope = cardSetupExecuteEnvelope();
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    const responseBytes = new TextEncoder().encode(JSON.stringify({
      payment_id: providerSetupId,
      status: "pending_3ds",
      next_action: {
        type: "three_ds_method",
        three_ds: {
          version: "2",
          phase: "method",
          completion_endpoint: `/v1/payments/${providerSetupId}/complete-3ds-method`,
          three_ds_server_trans_id: "three-ds-transaction-1",
          submit: {
            method: "POST",
            url: "https://acs.example.test/method",
            target: "hidden_iframe",
            fields: [{ name: "threeDSMethodData", value: "opaque-method-data" }]
          }
        }
      }
    }));
    const consumeArcPayCardTokenizationSecret = vi.fn(async () => ({
      kind: "arc_pay_card_tokenization_secret" as const,
      providerSetupId,
      cardTokenId: "80000000-0000-4000-8000-000000000008",
      browserInfo: browserInfo()
    }));
    const recordCustomerAction = vi.fn(async () => undefined);
    const dispatcher = createCardSetupExecuteDispatcher({
      privateObjectStorage: {
        ...storage(bytes),
        writeImmutable: vi.fn(async (input) => ({
          privateObjectKey: `private/${input.artifactId}`,
          privateObjectVersion: "version-1",
          envelopeKeyVersion: "key-1",
          contentType: input.contentType,
          sha256Digest: input.expectedSha256Digest,
          byteLength: input.bytes.byteLength
        }))
      },
      artifactRegistry: {
        registerSealedArtifact: vi.fn(async () => ({
          artifactId: `arc-card-setup-response:${providerOperationIntentId}`,
          sha256Digest: digest(responseBytes),
          byteLength: responseBytes.byteLength
        }))
      },
      transientSecretVault: { consumeArcPayCardTokenizationSecret } as unknown as FinanceTransientSecretVaultPort,
      cardSetupClient: {
        executeCardSetup: vi.fn(async () => ({
          providerSetupId,
          status: "pending_3ds" as const,
          cardTokenId: null,
          nextAction: {
            type: "three_ds_method" as const,
            threeDs: {
              version: "2" as const,
              phase: "method" as const,
              completionEndpoint: `/v1/payments/${providerSetupId}/complete-3ds-method`,
              threeDsServerTransactionId: "three-ds-transaction-1",
              submit: {
                method: "POST" as const,
                url: "https://acs.example.test/method",
                target: "hidden_iframe" as const,
                fields: [{ name: "threeDSMethodData", value: "opaque-method-data" }]
              }
            }
          },
          rawResponseBytes: responseBytes
        }))
      } as unknown as ReturnType<typeof import("../arc-pay/arc-pay-card-setup-client").createArcPayCardSetupClient>,
      customerAction: { recordCustomerAction } as never,
      transportUnknown: { markProviderOperationTransportUnknown: vi.fn() } as unknown as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" }
    });

    await dispatcher.dispatch(executeWorkItem(envelope, bytes));

    expect(consumeArcPayCardTokenizationSecret).toHaveBeenCalledWith({
      secretRef: "kms://s3/opaque-secret",
      expectedProviderSetupId: providerSetupId
    });
    expect(recordCustomerAction).toHaveBeenCalledWith(expect.objectContaining({
      setupSessionId: "platform-card-setup-1",
      expectedSetupSessionVersion: 4,
      providerOperationIntentId,
      expectedProviderOperationIntentVersion: 0,
      actionType: "three_ds_method",
      phase: "method"
    }));
  });

  it("uses only sealed Method evidence and a token-free context before persisting a challenge", async () => {
    const envelope = cardSetupMethodEnvelope();
    const requestBytes = new TextEncoder().encode(JSON.stringify(envelope));
    const methodBytes = new TextEncoder().encode(JSON.stringify({
      payment_id: providerSetupId, status: "pending_3ds", next_action: {
        type: "three_ds_method", three_ds: {
          version: "2", phase: "method", completion_endpoint: `/v1/payments/${providerSetupId}/complete-3ds-method`,
          three_ds_server_trans_id: "server-only-method-transaction",
          submit: { method: "POST", url: "https://acs.example.test/method", target: "hidden_iframe", fields: [{ name: "threeDSMethodData", value: "opaque" }] }
        }
      }
    }));
    const challengeBytes = new TextEncoder().encode(JSON.stringify({
      payment_id: providerSetupId, status: "pending_3ds", next_action: {
        type: "three_ds_challenge", three_ds: {
          version: "2", phase: "challenge",
          submit: { method: "POST", url: "https://acs.example.test/challenge", target: "browser", fields: [{ name: "creq", value: "opaque-challenge" }] }
        }
      }
    }));
    const consumeArcPayThreeDsMethodContext = vi.fn(async () => ({ kind: "arc_pay_three_ds_method_context" as const, providerSetupId, browserInfo: browserInfo() }));
    const completeThreeDsMethod = vi.fn(async () => ({
      providerSetupId, status: "pending_3ds" as const, cardTokenId: null,
      nextAction: {
        type: "three_ds_challenge" as const,
        threeDs: {
          version: "2" as const, phase: "challenge" as const, completionEndpoint: null,
          threeDsServerTransactionId: null,
          submit: { method: "POST" as const, url: "https://acs.example.test/challenge", target: "browser" as const, fields: [{ name: "creq", value: "opaque-challenge" }] }
        }
      },
      rawResponseBytes: challengeBytes
    }));
    const recordCustomerAction = vi.fn(async () => undefined);
    const dispatcher = createCardSetupThreeDsMethodDispatcher({
      privateObjectStorage: {
        ...storage(requestBytes),
        readImmutable: vi.fn(async (locator) => {
          const bytes = locator.privateObjectKey === "method-action" ? methodBytes : requestBytes;
          return { contentType: "application/json", sha256Digest: digest(bytes), byteLength: bytes.byteLength, bytes };
        }),
        writeImmutable: vi.fn(async (input) => ({ privateObjectKey: `private/${input.artifactId}`, privateObjectVersion: "version-1", envelopeKeyVersion: "key-1", contentType: input.contentType, sha256Digest: input.expectedSha256Digest, byteLength: input.bytes.byteLength }))
      },
      artifactRegistry: { registerSealedArtifact: vi.fn(async () => ({ artifactId: `arc-card-setup-response:${providerOperationIntentId}`, sha256Digest: digest(challengeBytes), byteLength: challengeBytes.byteLength })) },
      transientSecretVault: { consumeArcPayThreeDsMethodContext } as unknown as FinanceTransientSecretVaultPort,
      cardSetupClient: { completeThreeDsMethod } as unknown as ReturnType<typeof import("../arc-pay/arc-pay-card-setup-client").createArcPayCardSetupClient>,
      customerAction: { recordCustomerAction } as never,
      transportUnknown: { markProviderOperationTransportUnknown: vi.fn() } as unknown as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" }
    });

    await dispatcher.dispatch(methodWorkItem(envelope, requestBytes, methodBytes));

    expect(completeThreeDsMethod).toHaveBeenCalledWith(expect.objectContaining({
      threeDsServerTransactionId: "server-only-method-transaction", completionIndicator: "Y"
    }));
    expect(recordCustomerAction).toHaveBeenCalledWith(expect.objectContaining({ actionType: "three_ds_challenge", phase: "challenge" }));
  });
});

function storage(bytes: Uint8Array) {
  return {
    readImmutable: vi.fn(async () => ({
      contentType: "application/json",
      sha256Digest: digest(bytes),
      byteLength: bytes.byteLength,
      bytes
    })),
    writeImmutable: vi.fn(),
    deleteImmutable: vi.fn()
  };
}

function workItem(
  envelope: ReturnType<typeof cardSetupEnvelope>,
  requestBytes: Uint8Array
): ProviderOperationDispatchWorkItem {
  return {
    status: "pending_dispatch",
    operationKind: "card_setup",
    dispatch: {
      kind: "persisted_provider_dispatch_receipt",
      providerOperationIntentId,
      providerOperationIntentVersion: 0,
      economicPaymentIntentId,
      economicPaymentVersion: 1,
      economicPaymentSessionId,
      sourceId: "platform-card-setup-1",
      purpose: "platform_card_setup",
      amountMinor: "0",
      currency: "RUB",
      providerAccount: { seriesId: "arc-main", providerAccountId: "arc-live", identityVersion: 1 },
      canonicalRequestDigest: digestFinanceCanonicalValueV1(envelope),
      dispatchAuthorizationId: "authorization-1",
      dispatchAuthorizationDigest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      idempotencyKey: economicPaymentSessionId,
      sealedDispatchPayloadRef: "artifact-1",
      persistenceTransactionBoundaryRef: "postgres-xid:1",
      committedAt: "2026-08-04T12:00:00.000Z"
    } as unknown as ProviderOperationDispatchWorkItem["dispatch"],
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "finance-operation-policy",
      policyVersion: 1,
      policyDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      maximumRows: 1_000,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 1_048_576
    } as unknown as ProviderOperationDispatchWorkItem["operationEnvelope"],
    dispatchArtifact: { artifactId: "artifact-1", sha256Digest: digest(requestBytes), byteLength: requestBytes.byteLength },
    transientSecret: null,
    savedCardCredential: null,
    savedCardSetup: null,
    privateObject: {
      privateObjectKey: "finance/artifacts/artifact-1.json",
      privateObjectVersion: "version-1",
      envelopeKeyVersion: "arn:aws:kms:eu-central-1:123456789012:key/key-1"
    },
    artifactAccessAuditEventId: "60000000-0000-4000-8000-000000000006"
  };
}

function cardSetupEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "create" as const,
    customerId: "astrologer-1",
    setupExternalId: "platform-card-setup-1",
    successUrl: "https://astrologer.elevenhouse.test/settings/billing/card-setup/success",
    failureUrl: "https://astrologer.elevenhouse.test/settings/billing/card-setup/failure"
  };
}

function cardSetupExecuteEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "execute" as const,
    customerId: "astrologer-1",
    providerSetupId,
    setupExternalId: "platform-card-setup-1",
    tokenizationSecret: {
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: "kms://s3/opaque-secret",
      providerExpiresAt: "2026-08-04T12:04:00Z",
      providerConsumption: "one_time" as const
    }
  };
}

function cardSetupMethodEnvelope() {
  return {
    kind: "card_setup" as const, step: "complete_3ds_method" as const, providerSetupId,
    setupExternalId: "platform-card-setup-1", customerActionId: "60000000-0000-4000-8000-000000000006",
    completionIndicator: "Y" as const,
    threeDsMethodContextSecret: { kind: "sealed_one_time_provider_secret_ref" as const, secretRef: "kms://s3/method-context", providerExpiresAt: "2026-08-04T12:04:00Z", providerConsumption: "one_time" as const }
  };
}

function executeWorkItem(
  envelope: ReturnType<typeof cardSetupExecuteEnvelope>,
  requestBytes: Uint8Array
): ProviderOperationDispatchWorkItem {
  return {
    ...workItem(envelope as never, requestBytes),
    operationKind: "card_setup_execute",
    transientSecret: { secretRefId: "secret-ref-1", sealedSecretRef: "kms://s3/opaque-secret", providerSetupId },
    savedCardSetup: { setupSessionVersion: 4, state: "execution_pending", providerSetupId }
  };
}

function methodWorkItem(envelope: ReturnType<typeof cardSetupMethodEnvelope>, requestBytes: Uint8Array, methodBytes: Uint8Array): ProviderOperationDispatchWorkItem {
  return {
    ...workItem(envelope as never, requestBytes), operationKind: "card_setup_3ds_method_complete",
    transientSecret: { secretRefId: "secret-ref-2", sealedSecretRef: "kms://s3/method-context", providerSetupId },
    savedCardSetup: { setupSessionVersion: 6, state: "execution_pending", providerSetupId },
    threeDsMethodAction: {
      customerActionId: "60000000-0000-4000-8000-000000000006", providerSetupId,
      responseArtifact: { artifactId: "method-response", sha256Digest: digest(methodBytes), byteLength: methodBytes.byteLength },
      privateObject: { privateObjectKey: "method-action", privateObjectVersion: "version-1", envelopeKeyVersion: "key-1" },
      artifactAccessAuditEventId: "80000000-0000-4000-8000-000000000008"
    }
  };
}

function browserInfo() {
  return {
    acceptHeader: "text/html",
    language: "ru-RU",
    screenWidth: 1440,
    screenHeight: 900,
    colorDepth: 24 as const,
    timezoneOffsetMinutes: -180,
    userAgent: "ElevenHouse test",
    javaEnabled: false,
    windowSize: "05" as const
  };
}

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
