// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlowRunHistoryPanel } from "./FlowRunHistoryPanel";

const mocks = vi.hoisted(() => ({
  useFlowRunsQuery: vi.fn(),
  useFlowRunQuery: vi.fn(),
  useCancelFlowRunMutation: vi.fn(),
  useCurrentAstrologerProfileQuery: vi.fn()
}));

vi.mock("../model/useFlowRunsQuery", () => ({ useFlowRunsQuery: mocks.useFlowRunsQuery }));
vi.mock("../model/useFlowRunQuery", () => ({ useFlowRunQuery: mocks.useFlowRunQuery }));
vi.mock("../model/useCancelFlowRunMutation", () => ({
  useCancelFlowRunMutation: mocks.useCancelFlowRunMutation
}));
vi.mock("../../astrologer-profile/model/useCurrentAstrologerProfileQuery", () => ({
  useCurrentAstrologerProfileQuery: mocks.useCurrentAstrologerProfileQuery
}));

const run = {
  id: "11111111-1111-4111-8111-111111111111",
  flowId: "22222222-2222-4222-8222-222222222222",
  flowVersionId: "33333333-3333-4333-8333-333333333333",
  ownerUserId: "44444444-4444-4444-8444-444444444444",
  sourceEventId: "manual:test",
  status: "running",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v2",
    enrollment: {
      activationEpochId: "55555555-5555-4555-8555-555555555555",
      triggerNodeId: "manual",
      occurrenceKey: "66666666-6666-4666-8666-666666666666",
      policyKey: "once_per_occurrence",
      policyRevision: 1,
      rolloutPolicyRevision: 1,
      eventOccurredAt: "2026-08-07T10:00:00.000Z",
      enrolledAt: "2026-08-07T10:00:00.000Z"
    },
    subject: {
      type: "client",
      clientUserId: "77777777-7777-4777-8777-777777777777",
      relationshipId: "88888888-8888-4888-8888-888888888888"
    },
    executionAuthority: {
      basis: "current_entitlement",
      referenceId: "99999999-9999-4999-8999-999999999999"
    }
  },
  currentNodeId: "work-item",
  createdAt: "2026-08-07T10:00:00.000Z",
  updatedAt: "2026-08-07T10:01:00.000Z",
  completedAt: null
} as const;

const waitingRun = {
  ...run,
  id: "12111111-1111-4111-8111-111111111111",
  status: "waiting" as const
};

describe("FlowRunHistoryPanel", () => {
  afterEach(() => cleanup());

  it("does not mistake a list row for history and reads the ordered trace on selection", () => {
    configure();
    render(<FlowRunHistoryPanel flowId={run.flowId} locale="ru" />);

    expect(screen.getByText("Выполняется")).toBeTruthy();
    expect(screen.queryByText("Запуск создан")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Выполняется/ }));

    expect(screen.getByText("Запуск создан")).toBeTruthy();
    expect(screen.getByText("Шаг направлен по ветке «Ошибка»")).toBeTruthy();
    expect(screen.getByText("Шаг направлен по ветке «Отклонено»")).toBeTruthy();
  });

  it("requires an explicit confirmation before canceling and sends one durable idempotency key", () => {
    const mutate = vi.fn();
    configure({ mutate });
    render(<FlowRunHistoryPanel flowId={run.flowId} locale="ru" />);

    fireEvent.click(screen.getByRole("button", { name: /Выполняется/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отменить запуск" }));
    expect(screen.getByRole("dialog", { name: "Отменить запуск?" })).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Отменить запуск" }).at(-1)!);
    expect(mutate).toHaveBeenCalledWith(
      {
        runId: run.id,
        idempotencyKey: expect.stringMatching(/^flows:run:cancel:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("offers cancellation while a run is waiting for an asynchronous step", () => {
    configure({ run: waitingRun });
    render(<FlowRunHistoryPanel flowId={waitingRun.flowId} locale="ru" />);

    fireEvent.click(screen.getByRole("button", { name: /Ожидает/ }));

    expect(screen.getByRole("button", { name: "Отменить запуск" })).toBeTruthy();
  });
});

function configure({
  mutate = vi.fn(),
  run: configuredRun = run
}: {
  readonly mutate?: ReturnType<typeof vi.fn>;
  readonly run?: typeof run | typeof waitingRun;
} = {}) {
  mocks.useCurrentAstrologerProfileQuery.mockReturnValue({
    data: { profile: { timezone: "Europe/Moscow" } }
  });
  mocks.useFlowRunsQuery.mockReturnValue({
    data: { runs: [configuredRun], total: 1 },
    isLoading: false,
    isError: false,
    refetch: vi.fn()
  });
  mocks.useFlowRunQuery.mockReturnValue({
    data: {
      run: configuredRun,
      trace: [
        {
          sequence: "1",
          eventType: "run_enrolled",
          nodeId: "manual",
          summary: {},
          occurredAt: "2026-08-07T10:00:00.000Z"
        },
        {
          sequence: "2",
          eventType: "token_advanced",
          nodeId: "work-item",
          summary: { sourceHandle: "error" },
          occurredAt: "2026-08-07T10:01:00.000Z"
        },
        {
          sequence: "3",
          eventType: "token_advanced",
          nodeId: "approval",
          summary: { sourceHandle: "rejected" },
          occurredAt: "2026-08-07T10:02:00.000Z"
        }
      ]
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn()
  });
  mocks.useCancelFlowRunMutation.mockReturnValue({
    mutate,
    isPending: false,
    error: null,
    reset: vi.fn()
  });
}
