// @vitest-environment jsdom

import type { FlowApproval, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "../../../common/http/HttpError";
import { useFlowApprovalQueueController } from "./useFlowApprovalQueueController";

const mocks = vi.hoisted(() => ({
  useCurrentAstrologerProfileQuery: vi.fn(),
  useFlowApprovalsQuery: vi.fn(),
  useDecideFlowApprovalMutation: vi.fn()
}));

vi.mock("../../astrologer-profile/model/useCurrentAstrologerProfileQuery", () => ({
  useCurrentAstrologerProfileQuery: mocks.useCurrentAstrologerProfileQuery
}));
vi.mock("./useFlowApprovalsQuery", () => ({ useFlowApprovalsQuery: mocks.useFlowApprovalsQuery }));
vi.mock("./useDecideFlowApprovalMutation", () => ({
  useDecideFlowApprovalMutation: mocks.useDecideFlowApprovalMutation
}));

const approval = {
  id: "55555555-5555-4555-8555-555555555555",
  flowRunId: "44444444-4444-4444-8444-444444444444",
  stepRunId: null,
  status: "pending",
  kind: "manual_task",
  title: "Проверить подготовку",
  preview: "Нужна проверка.",
  artifact: null,
  revision: 3,
  snoozedUntil: null,
  expiresAt: null,
  createdAt: "2026-08-06T10:00:00.000Z",
  decidedAt: null
} satisfies FlowApproval;

const runtime = {
  mode: "canary",
  executionAvailable: true,
  reasonCode: null,
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

describe("useFlowApprovalQueueController", () => {
  const mutate = vi.fn();
  const refetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    refetch.mockResolvedValue({ isSuccess: true });
    mocks.useCurrentAstrologerProfileQuery.mockReturnValue({
      data: { profile: { timezone: "Europe/Moscow" }, integrityIssues: [] }
    });
    mocks.useFlowApprovalsQuery.mockReturnValue({
      data: { approvals: [approval], total: 1, runtime },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch
    });
    mocks.useDecideFlowApprovalMutation.mockReturnValue({ mutate, isPending: false });
  });

  it("uses the persisted revision and a single idempotency attempt for an approval", () => {
    const { result } = renderHook(() => useFlowApprovalQueueController({ locale: "ru" }));

    act(() => result.current.decide(approval, "approved"));
    const [input, options] = mutate.mock.calls[0]!;
    expect(input).toMatchObject({
      approvalId: approval.id,
      body: { expectedRevision: approval.revision, decision: "approved" },
      idempotencyKey: expect.stringMatching(/^flows:approval:approve:/)
    });
    expect(options).toEqual(expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }));

    act(() => options.onError(new TypeError("offline")));
    act(() => result.current.decide(approval, "approved"));
    expect(mutate.mock.calls[1]![0].idempotencyKey).toBe(input.idempotencyKey);
  });

  it("opens a timezone-aware snooze command and fences a stale approval until refetch", async () => {
    const { result } = renderHook(() => useFlowApprovalQueueController({ locale: "en" }));

    act(() => result.current.openSnooze(approval));
    expect(result.current.snoozeTarget).toBe(approval);
    act(() => result.current.confirmSnooze("2026-08-07T10:00:00.000Z"));
    const [input, options] = mutate.mock.calls[0]!;
    expect(input).toMatchObject({
      approvalId: approval.id,
      body: {
        expectedRevision: approval.revision,
        decision: "snoozed",
        snoozedUntil: "2026-08-07T10:00:00.000Z"
      },
      idempotencyKey: expect.stringMatching(/^flows:approval:snooze:/)
    });

    act(() => options.onError(new HttpError(409, { code: "FLOW_APPROVAL_REVISION_CONFLICT" })));
    expect(result.current.snoozeTarget).toBeNull();
    act(() => result.current.openSnooze(approval));
    act(() => result.current.confirmSnooze("2026-08-07T10:00:00.000Z"));
    expect(mutate).toHaveBeenCalledTimes(1);

    await act(async () => result.current.retry());
    act(() => result.current.openSnooze(approval));
    act(() => result.current.confirmSnooze("2026-08-07T10:00:00.000Z"));
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1]![0].idempotencyKey).not.toBe(input.idempotencyKey);
  });
});
