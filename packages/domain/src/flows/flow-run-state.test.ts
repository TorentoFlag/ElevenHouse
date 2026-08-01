import { describe, expect, it } from "vitest";

import { advanceFlowRunStatus, createFlowRunSnapshot } from "./flow-run-state";

const snapshotInput = {
  flowVersionId: "11111111-1111-4111-8111-111111111111",
  sourceEventId: "booking:222",
  subjectType: "client",
  subjectId: "22222222-2222-4222-8222-222222222222",
  occurredAt: "2026-07-26T10:00:00.000Z",
  timeZone: "Europe/Moscow",
  consent: {
    telegramMarketing: false,
    internalTransactional: true
  },
  channels: {
    telegram: {
      connected: true,
      canReply: false
    }
  },
  payload: {
    bookingId: "33333333-3333-4333-8333-333333333333"
  }
} as const;

describe("flow run state", () => {
  it("creates a durable snapshot from trigger context", () => {
    expect(createFlowRunSnapshot(snapshotInput)).toEqual({
      schemaVersion: "flow-run-snapshot.v1",
      ...snapshotInput
    });
  });

  it("allows normal pending to running to waiting transitions", () => {
    expect(advanceFlowRunStatus({ from: "pending", to: "running" })).toEqual({
      ok: true,
      status: "running"
    });
    expect(advanceFlowRunStatus({ from: "running", to: "waiting" })).toEqual({
      ok: true,
      status: "waiting"
    });
  });

  it("moves a run into approval_required from running or waiting", () => {
    expect(advanceFlowRunStatus({ from: "running", to: "approval_required" })).toEqual({
      ok: true,
      status: "approval_required"
    });
    expect(advanceFlowRunStatus({ from: "waiting", to: "approval_required" })).toEqual({
      ok: true,
      status: "approval_required"
    });
  });

  it("does not allow terminal states to return to running", () => {
    expect(advanceFlowRunStatus({ from: "completed", to: "running" })).toEqual({
      ok: false,
      code: "terminal_run_cannot_transition",
      message: "Terminal flow runs cannot transition to running."
    });
    expect(advanceFlowRunStatus({ from: "suppressed", to: "running" })).toEqual({
      ok: false,
      code: "terminal_run_cannot_transition",
      message: "Terminal flow runs cannot transition to running."
    });
  });
});
