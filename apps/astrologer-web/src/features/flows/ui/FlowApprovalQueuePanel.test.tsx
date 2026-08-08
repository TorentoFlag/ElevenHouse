// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FlowApprovalQueuePanel } from "./FlowApprovalQueuePanel";

const mocks = vi.hoisted(() => ({ controller: vi.fn() }));

vi.mock("../model/useFlowApprovalQueueController", () => ({
  useFlowApprovalQueueController: mocks.controller
}));

describe("FlowApprovalQueuePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.controller.mockReturnValue(controller());
  });

  afterEach(() => cleanup());

  it("can stay out of the gallery surface after a successful empty read", () => {
    render(<FlowApprovalQueuePanel locale="ru" hideWhenEmpty />);

    expect(screen.queryByRole("region", { name: "Подтверждения воронок" })).toBeNull();
  });

  it("keeps an empty queue visible when its authoritative read failed", () => {
    mocks.controller.mockReturnValue(controller({ isError: true, error: null }));
    render(<FlowApprovalQueuePanel locale="ru" hideWhenEmpty />);

    expect(screen.getByRole("region", { name: "Подтверждения воронок" })).toBeTruthy();
  });
});

function controller(overrides: Record<string, unknown> = {}) {
  return {
    approvals: [],
    runtimeAvailability: null,
    isLoading: false,
    isError: false,
    error: null,
    isDeciding: false,
    decide: vi.fn(),
    openSnooze: vi.fn(),
    timeZone: "Europe/Moscow",
    snoozeTarget: null,
    snoozePending: false,
    snoozeError: null,
    closeSnooze: vi.fn(),
    confirmSnooze: vi.fn(),
    ...overrides
  };
}
