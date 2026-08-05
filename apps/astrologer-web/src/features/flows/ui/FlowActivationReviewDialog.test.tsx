// @vitest-environment jsdom

import type { FlowActivationReviewResponse } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlowActivationReviewDialog } from "./FlowActivationReviewDialog";

const flowId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";

describe("FlowActivationReviewDialog", () => {
  afterEach(() => cleanup());

  it("keeps confirmation disabled while the authoritative review is loading", () => {
    render(
      <FlowActivationReviewDialog
        open
        locale="ru"
        flowName="Подготовка консультации"
        versionNumber={2}
        review={null}
        loading
        pending={false}
        onClose={vi.fn()}
        onRetryReview={vi.fn()}
        onRefetch={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Проверка запуска" });
    expect(within(dialog).getByText("Проверяем готовность версии 2")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Запустить версию" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("shows localized blockers and does not allow a blocked activation", () => {
    const onRetryReview = vi.fn();
    render(
      <FlowActivationReviewDialog
        open
        locale="ru"
        flowName="Подготовка консультации"
        versionNumber={2}
        review={blockedReview()}
        loading={false}
        pending={false}
        onClose={vi.fn()}
        onRetryReview={onRetryReview}
        onRefetch={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("Текущий тариф не разрешает запуск этой автоматизации.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Запустить версию" })).toHaveProperty(
      "disabled",
      true
    );
    fireEvent.click(screen.getByRole("button", { name: "Проверить снова" }));
    expect(onRetryReview).toHaveBeenCalledOnce();
  });

  it("requires explicit confirmation for a ready review", () => {
    const onConfirm = vi.fn();
    render(
      <FlowActivationReviewDialog
        open
        locale="en"
        flowName="Consultation preparation"
        versionNumber={2}
        review={readyReview()}
        loading={false}
        pending={false}
        onClose={vi.fn()}
        onRetryReview={vi.fn()}
        onRefetch={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Ready to activate")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Activate version" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("turns conflict into refetch-only state and network failure into a manual same-attempt retry", () => {
    const onRefetch = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <FlowActivationReviewDialog
        open
        locale="ru"
        flowName="Подготовка консультации"
        versionNumber={2}
        review={readyReview()}
        loading={false}
        pending={false}
        refetchRequired
        commandError={new Error("Состояние изменилось в другой вкладке.")}
        onClose={vi.fn()}
        onRetryReview={vi.fn()}
        onRefetch={onRefetch}
        onConfirm={onConfirm}
      />
    );

    expect(screen.queryByRole("button", { name: "Запустить версию" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Обновить состояние" }));
    expect(onRefetch).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(
      <FlowActivationReviewDialog
        open
        locale="ru"
        flowName="Подготовка консультации"
        versionNumber={2}
        review={readyReview()}
        loading={false}
        pending={false}
        retrySameAttempt
        commandError={new Error("Сервис временно недоступен.")}
        onClose={vi.fn()}
        onRetryReview={vi.fn()}
        onRefetch={onRefetch}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Повторить запуск" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

function readyReview(): FlowActivationReviewResponse {
  return {
    schemaVersion: "flow-activation-review.v1",
    flowId,
    versionId,
    definitionRevision: 7,
    enrollmentRevision: 0,
    expectedActiveVersionId: null,
    runtimeMode: "enabled",
    rolloutPolicyRevision: 2,
    evaluatedAt: "2026-08-04T18:00:00.000Z",
    decision: "ready",
    blockers: []
  };
}

function blockedReview(): FlowActivationReviewResponse {
  return {
    ...readyReview(),
    decision: "blocked",
    blockers: [
      {
        code: "FLOW_ENTITLEMENT_UNAVAILABLE",
        path: "entitlement",
        capabilityKey: "funnels.activation"
      }
    ]
  };
}
