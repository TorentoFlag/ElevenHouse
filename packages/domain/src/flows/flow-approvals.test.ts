import { describe, expect, it, vi } from "vitest";

import { decideDurableFlowApproval, type FlowApprovalStore } from "./flow-approvals";
import { FlowRuntimeIdempotencyKeyInvalidError } from "./flow-run-cancellation";

const ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  owner: "22222222-2222-4222-8222-222222222222",
  approval: "33333333-3333-4333-8333-333333333333",
  run: "44444444-4444-4444-8444-444444444444"
};

describe("decideDurableFlowApproval", () => {
  it("creates a stable, actor-bound idempotent approval command", async () => {
    const execute = vi.fn<FlowApprovalStore["execute"]>(async () => ({
      kind: "created",
      outcome: {
        kind: "succeeded",
        response: {
          statusCode: 200,
          body: {
            approval: {
              id: ids.approval,
              flowRunId: ids.run,
              stepRunId: null,
              status: "approved",
              kind: "manual_task",
              title: "Review",
              preview: "Review this task",
              revision: 2,
              artifact: null,
              snoozedUntil: null,
              expiresAt: null,
              createdAt: "2026-08-06T10:00:00.000Z",
              decidedAt: "2026-08-06T10:01:00.000Z"
            }
          }
        }
      }
    }));

    await decideDurableFlowApproval({
      store: { execute },
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      approvalId: ids.approval,
      idempotencyKey: "approval-001",
      request: { expectedRevision: 1, decision: "approved", note: "looks good" }
    });

    const command = execute.mock.calls[0]?.[0].command;
    expect(command).toMatchObject({
      apiSurface: "astrologer-api",
      actorUserId: ids.actor,
      ownerUserId: ids.owner,
      resourceId: ids.approval,
      routeTemplate: "/flow-approvals/:approvalId/decision",
      scope: "flows.approvals.decide.v1",
      request: {
        schemaVersion: "flow-approval-decision-request.v1",
        body: { expectedRevision: 1, decision: "approved", note: "looks good" }
      }
    });
    expect(command?.requestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("requires an explicit future snooze instant in the request shape", async () => {
    const store = { execute: vi.fn<FlowApprovalStore["execute"]>() };
    await expect(
      decideDurableFlowApproval({
        store,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        approvalId: ids.approval,
        idempotencyKey: "approval-002",
        request: { expectedRevision: 1, decision: "snoozed" }
      })
    ).rejects.toThrow();
    expect(store.execute).not.toHaveBeenCalled();
  });

  it("rejects invalid idempotency keys before the store", async () => {
    const store = { execute: vi.fn<FlowApprovalStore["execute"]>() };
    await expect(
      decideDurableFlowApproval({
        store,
        actorUserId: ids.actor,
        ownerUserId: ids.owner,
        approvalId: ids.approval,
        idempotencyKey: "bad",
        request: { expectedRevision: 1, decision: "rejected" }
      })
    ).rejects.toBeInstanceOf(FlowRuntimeIdempotencyKeyInvalidError);
  });
});
