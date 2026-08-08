import { ConflictException } from "@nestjs/common";
import type { FlowApproval, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import type { FlowApprovalStore, FlowRuntimeAvailabilityReader } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";

import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FlowApprovalsService } from "./flow-approvals.service";

const ownerUserId = "10000000-0000-4000-8000-000000000001";
const approvalId = "10000000-0000-4000-8000-000000000002";

describe("FlowApprovalsService", () => {
  it("keeps the command fail-closed while the rollout policy is definition-only", async () => {
    const execute = vi.fn<FlowApprovalStore["execute"]>();
    const reader = unavailableReader();
    const service = new FlowApprovalsService({ execute }, reader);
    await expect(
      service.decide(approvalId, { expectedRevision: 1, decision: "approved" }, "flow-approval-0", request())
    ).rejects.toMatchObject({
      constructor: ConflictException,
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });
    expect(execute).not.toHaveBeenCalled();
    expect(reader.readForOwner).toHaveBeenCalledWith({ ownerUserId });
  });

  it("accepts a decision when the owner has a live canary runtime admission", async () => {
    const execute = vi.fn<FlowApprovalStore["execute"]>(async () => ({
      kind: "created",
      outcome: { kind: "succeeded", response: { statusCode: 200, body: { approval: pendingApproval } } }
    }));
    const reader: FlowRuntimeAvailabilityReader = {
      readForOwner: vi.fn(async () => ({
        mode: "canary",
        executionAvailable: true,
        reasonCode: null,
        historySemantics: "durable_execution"
      } satisfies FlowRuntimeAvailability))
    };
    const service = new FlowApprovalsService({ execute }, reader);

    await expect(
      service.decide(approvalId, { expectedRevision: 1, decision: "approved" }, "flow-approval-1", request())
    ).resolves.toEqual({ approval: pendingApproval });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          ownerUserId,
          resourceId: approvalId,
          request: { schemaVersion: "flow-approval-decision-request.v1", body: { expectedRevision: 1, decision: "approved" } }
        })
      })
    );
  });
});

const pendingApproval = {
  id: approvalId,
  flowRunId: "10000000-0000-4000-8000-000000000003",
  stepRunId: null,
  status: "approved",
  kind: "manual_task",
  title: "Review",
  preview: "Review the draft",
  artifact: null,
  revision: 2,
  snoozedUntil: null,
  expiresAt: null,
  createdAt: "2026-08-06T10:00:00.000Z",
  decidedAt: "2026-08-06T10:01:00.000Z"
} satisfies FlowApproval;

function unavailableReader(): FlowRuntimeAvailabilityReader {
  return {
    readForOwner: vi.fn(async () => ({
      mode: "definition_only",
      executionAvailable: false,
      reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
      historySemantics: "durable_execution"
    } satisfies FlowRuntimeAvailability))
  };
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}
