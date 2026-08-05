import { describe, expect, it, vi } from "vitest";

import type { CancelFlowRunRequest } from "@elevenhouse/contracts";

import { sha256CanonicalJson } from "../calculations/canonical-json";
import {
  cancelDurableFlowRun,
  FlowRuntimeIdempotencyKeyInvalidError,
  type FlowRunCancellationCommand,
  type FlowRunCancellationCommandResult,
  type FlowRunCancellationStore
} from "./flow-run-cancellation";

const actorUserId = "10000000-0000-4000-8000-000000000001";
const ownerUserId = "10000000-0000-4000-8000-000000000002";
const runId = "10000000-0000-4000-8000-000000000003";

describe("durable flow run cancellation", () => {
  it("builds an owner-scoped canonical command and returns its persisted outcome", async () => {
    let received: FlowRunCancellationCommand | undefined;
    const result = succeededResult("created");
    const store: FlowRunCancellationStore = {
      executeCancel: vi.fn(async (input) => {
        received = input.command;
        return result;
      })
    };

    await expect(
      cancelDurableFlowRun({
        store,
        actorUserId,
        ownerUserId,
        runId,
        idempotencyKey: "  cancel-request-1  ",
        request: {}
      })
    ).resolves.toEqual(result);

    expect(received).toEqual({
      apiSurface: "astrologer-api",
      actorUserId,
      ownerUserId,
      routeTemplate: "/flow-runs/:runId/cancel",
      resourceId: runId,
      flowRunId: runId,
      scope: "flows.runtime.cancel.v1",
      idempotencyKey: "cancel-request-1",
      requestHash: sha256CanonicalJson({
        schemaVersion: "flow-runtime-command.v1",
        apiSurface: "astrologer-api",
        actorUserId,
        ownerUserId,
        routeTemplate: "/flow-runs/:runId/cancel",
        resourceId: runId,
        scope: "flows.runtime.cancel.v1",
        request: { schemaVersion: "flow-run-cancel-request.v1", body: {} }
      })
    });
  });

  it("returns an exact replay without changing its persisted response", async () => {
    const result = succeededResult("replayed");
    const store: FlowRunCancellationStore = {
      executeCancel: vi.fn(async () => result)
    };

    await expect(
      cancelDurableFlowRun({
        store,
        actorUserId,
        ownerUserId,
        runId,
        idempotencyKey: "cancel-request-2",
        request: {}
      })
    ).resolves.toBe(result);
  });

  it("rejects an unknown cancellation request field before touching persistence", async () => {
    const store: FlowRunCancellationStore = {
      executeCancel: vi.fn(async () => succeededResult("created"))
    };
    const untrustedRequest = {
      reason: "unsupported"
    } as unknown as CancelFlowRunRequest;

    await expect(
      cancelDurableFlowRun({
        store,
        actorUserId,
        ownerUserId,
        runId,
        idempotencyKey: "cancel-invalid-body-1",
        request: untrustedRequest
      })
    ).rejects.toBeDefined();
    expect(store.executeCancel).not.toHaveBeenCalled();
  });

  it.each(["", "short", "contains spaces", "x".repeat(129)])(
    "rejects invalid idempotency key %j before touching persistence",
    async (idempotencyKey) => {
      const store: FlowRunCancellationStore = {
        executeCancel: vi.fn(async () => succeededResult("created"))
      };

      await expect(
        cancelDurableFlowRun({
          store,
          actorUserId,
          ownerUserId,
          runId,
          idempotencyKey,
          request: {}
        })
      ).rejects.toBeInstanceOf(FlowRuntimeIdempotencyKeyInvalidError);
      expect(store.executeCancel).not.toHaveBeenCalled();
    }
  );
});

function succeededResult(
  kind: FlowRunCancellationCommandResult["kind"]
): FlowRunCancellationCommandResult {
  return {
    kind,
    outcome: {
      kind: "succeeded",
      response: {
        statusCode: 200,
        body: {
          run: {
            id: runId,
            flowId: "10000000-0000-4000-8000-000000000004",
            flowVersionId: "10000000-0000-4000-8000-000000000005",
            ownerUserId,
            sourceEventId: "booking-confirmed-1",
            status: "canceled",
            snapshot: {
              schemaVersion: "flow-run-snapshot.v2",
              enrollment: {
                activationEpochId: "10000000-0000-4000-8000-000000000007",
                triggerNodeId: "booking-confirmed",
                occurrenceKey: "10000000-0000-4000-8000-000000000006",
                policyKey: "once_per_occurrence",
                policyRevision: 1,
                rolloutPolicyRevision: 1,
                eventOccurredAt: "2026-08-03T12:00:00.000Z",
                enrolledAt: "2026-08-03T12:00:00.000Z"
              },
              subject: {
                type: "booking",
                bookingId: "10000000-0000-4000-8000-000000000006",
                clientUserId: "10000000-0000-4000-8000-000000000008",
                productId: "10000000-0000-4000-8000-000000000009",
                startAt: "2026-08-03T12:00:00.000Z",
                endAt: "2026-08-03T13:00:00.000Z"
              },
              executionAuthority: {
                basis: "current_entitlement",
                referenceId: "10000000-0000-4000-8000-000000000010"
              }
            },
            currentNodeId: "done",
            createdAt: "2026-08-03T12:00:00.000Z",
            updatedAt: "2026-08-03T12:01:00.000Z",
            completedAt: "2026-08-03T12:01:00.000Z"
          }
        }
      }
    }
  };
}
