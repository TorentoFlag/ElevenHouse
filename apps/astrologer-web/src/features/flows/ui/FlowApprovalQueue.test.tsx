// @vitest-environment jsdom

import type { FlowApproval } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowApprovalQueue } from "./FlowApprovalQueue";

const pendingApproval = {
  id: "55555555-5555-4555-8555-555555555555",
  flowRunId: "44444444-4444-4444-8444-444444444444",
  stepRunId: null,
  status: "pending",
  kind: "ai_output",
  title: "Проверить AI-черновик",
  preview: "Сообщение клиенту ожидает подтверждения.",
  createdAt: "2026-07-28T08:01:00.000Z",
  decidedAt: null
} satisfies FlowApproval;

const approvedApproval = {
  ...pendingApproval,
  id: "66666666-6666-4666-8666-666666666666",
  status: "approved",
  title: "Уже утверждено",
  decidedAt: "2026-07-28T08:04:00.000Z"
} satisfies FlowApproval;

describe("FlowApprovalQueue", () => {
  afterEach(() => cleanup());

  it("renders pending approval title and preview only in pending mode", () => {
    render(<FlowApprovalQueue approvals={[pendingApproval, approvedApproval]} onDecision={vi.fn()} />);

    expect(screen.getByText("Проверить AI-черновик")).toBeTruthy();
    expect(screen.getByText("Сообщение клиенту ожидает подтверждения.")).toBeTruthy();
    expect(screen.queryByText("Уже утверждено")).toBeNull();
  });

  it("calls approve, reject, and snooze handlers", () => {
    const onDecision = vi.fn();
    render(<FlowApprovalQueue approvals={[pendingApproval]} onDecision={onDecision} />);

    fireEvent.click(screen.getByRole("button", { name: "Утвердить" }));
    fireEvent.click(screen.getByRole("button", { name: "Отклонить" }));
    fireEvent.click(screen.getByRole("button", { name: "Отложить" }));

    expect(onDecision).toHaveBeenNthCalledWith(1, pendingApproval.id, "approved");
    expect(onDecision).toHaveBeenNthCalledWith(2, pendingApproval.id, "rejected");
    expect(onDecision).toHaveBeenNthCalledWith(3, pendingApproval.id, "snoozed");
  });

  it("does not expose provider-send success before the API confirms delivery", () => {
    render(<FlowApprovalQueue approvals={[pendingApproval]} onDecision={vi.fn()} />);

    expect(screen.queryByText("Отправлено клиенту")).toBeNull();
    expect(screen.queryByText("Успешно отправлено")).toBeNull();
  });

  it("shows loading state instead of a false empty approval queue", () => {
    render(<FlowApprovalQueue approvals={[]} onDecision={vi.fn()} isLoading />);

    expect(screen.getByText("Загружаем подтверждения")).toBeTruthy();
    expect(screen.queryByText("Нет задач на подтверждение")).toBeNull();
  });
});
