// @vitest-environment jsdom

import type {
  FlowWorkItem,
  FlowWorkItemBookingContext,
  FlowWorkItemManualClientContext,
  FlowWorkItemQueueEntry
} from "@elevenhouse/contracts";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "../../../common/http/HttpError";
import { useFlowWorkItemQueueController } from "./useFlowWorkItemQueueController";

const mocks = vi.hoisted(() => ({
  useCurrentAstrologerProfileQuery: vi.fn(),
  useFlowWorkItemsQuery: vi.fn(),
  useStartFlowWorkItemMutation: vi.fn(),
  useSnoozeFlowWorkItemMutation: vi.fn(),
  useCompleteFlowWorkItemMutation: vi.fn()
}));

vi.mock("../../astrologer-profile/model/useCurrentAstrologerProfileQuery", () => ({
  useCurrentAstrologerProfileQuery: mocks.useCurrentAstrologerProfileQuery
}));
vi.mock("./useFlowWorkItemsQuery", () => ({
  useFlowWorkItemsQuery: mocks.useFlowWorkItemsQuery
}));
vi.mock("./useStartFlowWorkItemMutation", () => ({
  useStartFlowWorkItemMutation: mocks.useStartFlowWorkItemMutation
}));
vi.mock("./useSnoozeFlowWorkItemMutation", () => ({
  useSnoozeFlowWorkItemMutation: mocks.useSnoozeFlowWorkItemMutation
}));
vi.mock("./useCompleteFlowWorkItemMutation", () => ({
  useCompleteFlowWorkItemMutation: mocks.useCompleteFlowWorkItemMutation
}));

describe("useFlowWorkItemQueueController", () => {
  const entry = queueEntry();
  const refetch = vi.fn();
  const start = vi.fn();
  const snooze = vi.fn();
  const complete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    refetch.mockResolvedValue({ isSuccess: true });
    mocks.useCurrentAstrologerProfileQuery.mockReturnValue({
      data: { profile: { timezone: "Europe/Moscow" }, integrityIssues: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn()
    });
    mocks.useFlowWorkItemsQuery.mockReturnValue({
      data: {
        schemaVersion: "flow-work-item-list.v1",
        items: [entry],
        total: 1,
        asOf: "2026-08-05T08:00:00.000Z"
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch
    });
    mocks.useStartFlowWorkItemMutation.mockReturnValue({ mutate: start });
    mocks.useSnoozeFlowWorkItemMutation.mockReturnValue({ mutate: snooze });
    mocks.useCompleteFlowWorkItemMutation.mockReturnValue({ mutate: complete });
  });

  it("uses the persisted profile timezone and sends the authoritative revision", () => {
    const { result } = renderHook(() => useFlowWorkItemQueueController({ locale: "ru" }));

    expect(mocks.useFlowWorkItemsQuery).toHaveBeenCalledWith({
      status: "active",
      limit: 50,
      offset: 0
    });
    expect(result.current.profileState).toBe("ready");
    expect(result.current.timeZone).toBe("Europe/Moscow");
    expect(result.current.total).toBe(1);

    act(() => result.current.start(entry));

    expect(start).toHaveBeenCalledWith(
      {
        workItemId: entry.workItem.id,
        body: {
          expectedRevision: entry.workItem.revision,
          expectedBookingLifecycleRevision: entry.context.booking.lifecycleRevision
        },
        idempotencyKey: expect.stringMatching(/^flows:work-item:start:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
    expect(result.current.commandStateByWorkItemId[entry.workItem.id]).toEqual({
      status: "pending",
      operation: "start"
    });
  });

  it("starts a manual-client work item without invented booking lifecycle evidence", () => {
    const manualEntry = manualClientQueueEntry();
    mocks.useFlowWorkItemsQuery.mockReturnValue({
      data: {
        schemaVersion: "flow-work-item-list.v1",
        items: [manualEntry],
        total: 1,
        asOf: "2026-08-05T08:00:00.000Z"
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch
    });
    const { result } = renderHook(() => useFlowWorkItemQueueController({ locale: "ru" }));

    act(() => result.current.start(manualEntry));

    expect(start).toHaveBeenCalledWith(
      {
        workItemId: manualEntry.workItem.id,
        body: { expectedRevision: manualEntry.workItem.revision },
        idempotencyKey: expect.stringMatching(/^flows:work-item:start:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it("uses the compact dashboard page size without changing queue semantics", () => {
    renderHook(() => useFlowWorkItemQueueController({ locale: "ru", limit: 5 }));

    expect(mocks.useFlowWorkItemsQuery).toHaveBeenCalledWith({
      status: "active",
      limit: 5,
      offset: 0
    });
  });

  it("reuses the same command attempt after a transport error", () => {
    const { result } = renderHook(() => useFlowWorkItemQueueController({ locale: "ru" }));

    act(() => result.current.start(entry));
    const [firstInput, firstOptions] = start.mock.calls[0]!;
    act(() => firstOptions.onError(new TypeError("Failed to fetch")));

    const failedState = result.current.commandStateByWorkItemId[entry.workItem.id];
    expect(failedState).toMatchObject({
      status: "error",
      operation: "start",
      refetchRequired: false
    });
    if (!failedState || failedState.status !== "error") throw new Error("error state expected");
    expect(failedState.userMessage).not.toContain("Failed to fetch");

    act(() => result.current.start(entry));
    expect(start.mock.calls[1]![0].idempotencyKey).toBe(firstInput.idempotencyKey);
  });

  it("blocks a stale command until an authoritative refetch succeeds", async () => {
    const completionEntry = queueEntry({
      status: "in_progress",
      startedAt: "2026-08-05T07:30:00.000Z",
      revision: 2
    });
    const { result } = renderHook(() => useFlowWorkItemQueueController({ locale: "ru" }));

    act(() => result.current.openComplete(completionEntry));
    act(() => result.current.confirmComplete("Карта проверена"));
    const [firstInput, firstOptions] = complete.mock.calls[0]!;
    act(() =>
      firstOptions.onError(
        new HttpError(409, {
          code: "FLOW_WORK_ITEM_REVISION_CONFLICT",
          currentRevision: completionEntry.workItem.revision + 1
        })
      )
    );

    expect(result.current.commandStateByWorkItemId[completionEntry.workItem.id]).toMatchObject({
      status: "error",
      operation: "complete",
      refetchRequired: true
    });
    act(() => result.current.confirmComplete("Карта проверена"));
    expect(complete).toHaveBeenCalledTimes(1);

    await act(async () => result.current.retry());
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.commandStateByWorkItemId).toEqual({});

    act(() => result.current.openComplete(completionEntry));
    act(() => result.current.confirmComplete("Карта проверена"));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]![0].idempotencyKey).not.toBe(firstInput.idempotencyKey);
  });

  it("keeps completion context open and reuses command identity after a transport error", () => {
    const completionEntry = queueEntry({
      status: "in_progress",
      startedAt: "2026-08-05T07:30:00.000Z",
      revision: 2
    });
    const { result } = renderHook(() => useFlowWorkItemQueueController({ locale: "ru" }));

    act(() => result.current.openComplete(completionEntry));
    expect(result.current.completionTarget).toBe(completionEntry);
    act(() => result.current.confirmComplete("Карта и вопросы проверены"));
    const [firstInput, firstOptions] = complete.mock.calls[0]!;
    expect(firstInput).toMatchObject({
      workItemId: completionEntry.workItem.id,
      body: {
        expectedRevision: 2,
        expectedBookingLifecycleRevision: completionEntry.context.booking.lifecycleRevision,
        resultSummary: "Карта и вопросы проверены"
      }
    });

    act(() => firstOptions.onError(new TypeError("offline")));
    expect(result.current.completionTarget).toBe(completionEntry);
    expect(result.current.completionError).toBeTruthy();
    act(() => result.current.confirmComplete("Карта и вопросы проверены"));
    expect(complete.mock.calls[1]![0].idempotencyKey).toBe(firstInput.idempotencyKey);
  });

  it("keeps the snooze attempt open for retry and sends the selected instant", () => {
    const { result } = renderHook(() => useFlowWorkItemQueueController({ locale: "en" }));

    act(() => result.current.openSnooze(entry));
    expect(result.current.snoozeTarget).toBe(entry);

    act(() => result.current.confirmSnooze("2026-08-05T10:00:00.000Z"));
    expect(snooze).toHaveBeenCalledWith(
      {
        workItemId: entry.workItem.id,
        body: {
          expectedRevision: entry.workItem.revision,
          expectedBookingLifecycleRevision: entry.context.booking.lifecycleRevision,
          snoozedUntil: "2026-08-05T10:00:00.000Z"
        },
        idempotencyKey: expect.stringMatching(/^flows:work-item:snooze:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );

    const options = snooze.mock.calls[0]![1];
    act(() => options.onError(new TypeError("offline")));
    expect(result.current.snoozeTarget).toBe(entry);
    expect(result.current.snoozeError).toBeTruthy();
  });

  it("does not invent a browser timezone when the astrologer profile is absent", () => {
    mocks.useCurrentAstrologerProfileQuery.mockReturnValue({
      data: { profile: null, integrityIssues: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn()
    });

    const { result } = renderHook(() => useFlowWorkItemQueueController({ locale: "ru" }));

    expect(result.current.profileState).toBe("profile_required");
    expect(result.current.timeZone).toBeNull();
  });
});

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const workItemId = "22222222-2222-4222-8222-222222222222";

function queueEntry(
  overrides: Partial<FlowWorkItem> = {}
): FlowWorkItemQueueEntry & { readonly context: FlowWorkItemBookingContext } {
  return {
    workItem: {
      id: workItemId,
      flowRunId: "44444444-4444-4444-8444-444444444444",
      flowVersionId: "55555555-5555-4555-8555-555555555555",
      nodeId: "prepare_consultation",
      status: "pending",
      taskKind: "consultation_preparation",
      title: "Подготовить консультацию",
      instructions: "Проверить карту и вопросы клиента.",
      assigneeUserId: ownerUserId,
      priority: "normal",
      dueAt: null,
      availableAt: "2026-08-05T07:00:00.000Z",
      snoozedUntil: null,
      revision: 1,
      resultSummary: null,
      createdAt: "2026-08-05T07:00:00.000Z",
      updatedAt: "2026-08-05T07:00:00.000Z",
      startedAt: null,
      completedAt: null,
      completedByUserId: null,
      expiredAt: null,
      canceledAt: null,
      ...overrides
    } satisfies FlowWorkItem,
    context: {
      status: "available",
      subjectType: "booking",
      completionRequirements: { resultSummary: "required" },
      flow: {
        id: "66666666-6666-4666-8666-666666666666",
        currentName: "Подготовка консультации"
      },
      booking: {
        id: "77777777-7777-4777-8777-777777777777",
        lifecycleRevision: 1,
        state: "confirmed",
        currentStartAt: "2026-08-06T10:00:00.000Z",
        currentEndAt: "2026-08-06T11:00:00.000Z",
        timeZoneSnapshot: "Europe/Moscow"
      },
      client: {
        userId: "88888888-8888-4888-8888-888888888888",
        currentDisplayName: "Наталья Орлова"
      },
      product: {
        id: "99999999-9999-4999-8999-999999999999",
        titleSnapshot: "Натальная консультация"
      }
    }
  };
}

function manualClientQueueEntry(
  overrides: Partial<FlowWorkItem> = {}
): FlowWorkItemQueueEntry & { readonly context: FlowWorkItemManualClientContext } {
  const bookingEntry = queueEntry(overrides);
  return {
    ...bookingEntry,
    context: {
      status: "available",
      subjectType: "client",
      completionRequirements: { resultSummary: "optional" },
      flow: bookingEntry.context.flow,
      client: bookingEntry.context.client
    }
  };
}
