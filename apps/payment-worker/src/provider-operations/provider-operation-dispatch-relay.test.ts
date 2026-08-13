import { describe, expect, it, vi } from "vitest";
import {
  FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT,
  type ProviderOperationDispatchWorkItem
} from "@elevenhouse/domain/finance-core";
import type { ClaimedOutboxEvent, OutboxRelayStore } from "@elevenhouse/db/outbox";
import {
  relayPendingFinanceProviderOperationDispatches,
  retryDelayMs
} from "./provider-operation-dispatch-relay";

const eventId = "10000000-0000-4000-8000-000000000001";
const providerOperationIntentId = "20000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-04T12:00:00.000Z");

describe("finance provider operation dispatch relay", () => {
  it("claims only its event, reloads the private work item, dispatches and fences publication", async () => {
    const store = createStore(event());
    const workItem = dispatchWorkItem();
    const reader = {
      readDispatchWorkItem: vi.fn(async () => workItem)
    };
    const dispatcher = { dispatch: vi.fn(async () => undefined) };

    await expect(
      relayPendingFinanceProviderOperationDispatches({
        store,
        reader,
        dispatcher,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000
      })
    ).resolves.toEqual({ claimed: 1, dispatched: 1, requeued: 0 });

    expect(reader.readDispatchWorkItem).toHaveBeenCalledWith({
      providerOperationIntentId,
      requestId: eventId
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(workItem);
    expect(store.markPublished).toHaveBeenCalledWith({
      eventId,
      claimFence: 4n,
      publishedAt: now
    });
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });

  it("does not dispatch a mismatched aggregate or malformed payload and schedules a bounded retry", async () => {
    const store = createStore({
      ...event(),
      aggregateId: "30000000-0000-4000-8000-000000000003",
      attempts: 3
    });
    const reader = { readDispatchWorkItem: vi.fn() };
    const dispatcher = { dispatch: vi.fn() };

    await expect(
      relayPendingFinanceProviderOperationDispatches({
        store,
        reader,
        dispatcher,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000
      })
    ).resolves.toEqual({ claimed: 1, dispatched: 0, requeued: 1 });

    expect(reader.readDispatchWorkItem).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(store.markPublishFailed).toHaveBeenCalledWith({
      eventId,
      claimFence: 4n,
      failedAt: now,
      nextAvailableAt: new Date(now.getTime() + 8_000),
      errorMessage: "Finance provider operation dispatch requires retry or operator review"
    });
  });

  it("keeps provider errors observable and retries the same persisted operation without leaking error data", async () => {
    const store = createStore(event());
    const reader = { readDispatchWorkItem: vi.fn(async () => dispatchWorkItem()) };
    const dispatcher = {
      dispatch: vi.fn(async () => {
        throw new Error("provider returned secret=forbidden");
      })
    };

    await relayPendingFinanceProviderOperationDispatches({
      store,
      reader,
      dispatcher,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000
    });

    expect(store.markPublishFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: "Finance provider operation dispatch requires retry or operator review"
      })
    );
    expect(store.markPublished).not.toHaveBeenCalled();
  });

  it("backs off exponentially and caps the delay at one day", () => {
    expect(retryDelayMs(0)).toBe(1_000);
    expect(retryDelayMs(3)).toBe(8_000);
    expect(retryDelayMs(100)).toBe(24 * 60 * 60 * 1_000);
  });

  it("characterizes the current unbounded requeue after the retry delay reaches its cap", async () => {
    const store = createStore({ ...event(), attempts: 100 });
    const reader = { readDispatchWorkItem: vi.fn(async () => dispatchWorkItem()) };
    const dispatcher = { dispatch: vi.fn(async () => Promise.reject(new Error("still failing"))) };

    await expect(
      relayPendingFinanceProviderOperationDispatches({
        store,
        reader,
        dispatcher,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000
      })
    ).resolves.toEqual({ claimed: 1, dispatched: 0, requeued: 1 });

    expect(store.markPublishFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        nextAvailableAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000)
      })
    );
  });
});

function event(): ClaimedOutboxEvent {
  return {
    id: eventId,
    eventType: FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT,
    aggregateId: providerOperationIntentId,
    payload: { providerOperationIntentId },
    attempts: 0,
    claimFence: 4n
  };
}

function createStore(claimed: ClaimedOutboxEvent): OutboxRelayStore {
  return {
    claimPending: vi.fn(async () => [claimed]),
    markPublished: vi.fn(async () => undefined),
    markPublishFailed: vi.fn(async () => undefined),
    markQuarantined: vi.fn(async () => undefined)
  };
}

function dispatchWorkItem(): ProviderOperationDispatchWorkItem {
  return {
    status: "pending_dispatch",
    operationKind: "checkout_session_create",
    dispatch: {
      kind: "persisted_provider_dispatch_receipt",
      providerOperationIntentId,
      providerOperationIntentVersion: 0,
      economicPaymentIntentId: "40000000-0000-4000-8000-000000000004",
      economicPaymentVersion: 1,
      economicPaymentSessionId: "50000000-0000-4000-8000-000000000005",
      sourceId: "order-1",
      purpose: "client_order",
      amountMinor: "10000",
      currency: "RUB",
      providerAccount: { seriesId: "arc-main", providerAccountId: "arc-live", identityVersion: 1 },
      canonicalRequestDigest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      dispatchAuthorizationId: "authorization-1",
      dispatchAuthorizationDigest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      idempotencyKey: "50000000-0000-4000-8000-000000000005",
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
    dispatchArtifact: {
      artifactId: "artifact-1",
      sha256Digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      byteLength: 512
    },
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
