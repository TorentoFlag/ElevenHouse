// @vitest-environment jsdom

import type {
  FlowActivationReviewResponse,
  FlowDefinitionSummaryV3,
  FlowEnrollmentDetailResponse
} from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "../../common/http/HttpError";
import { FlowsPage } from "./FlowsPage";

const flowId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const epochId = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  listRefetch: vi.fn(),
  reviewRefetch: vi.fn(),
  enrollmentRefetch: vi.fn(),
  useFlowListQuery: vi.fn(),
  useFlowTemplatesQuery: vi.fn(),
  useProductListQuery: vi.fn(),
  useFlowDefinitionQuery: vi.fn(),
  useFlowActivationReviewQuery: vi.fn(),
  useFlowEnrollmentQuery: vi.fn(),
  useActivateFlowMutation: vi.fn(),
  usePauseFlowEnrollmentMutation: vi.fn(),
  useCreateFlowMutation: vi.fn(),
  useCreateNextFlowDraftMutation: vi.fn(),
  useUpdateFlowDraftMutation: vi.fn(),
  usePublishFlowMutation: vi.fn(),
  useValidateFlowDefinitionMutation: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({ useI18n: () => ({ locale: "ru" }) }));
vi.mock("react-router", () => ({
  useLocation: () => ({ search: window.location.search })
}));
vi.mock("../../common/hooks/useDocumentTitle", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("../../features/flows/model/useFlowListQuery", () => ({
  useFlowListQuery: mocks.useFlowListQuery
}));
vi.mock("../../features/flows/model/useFlowTemplatesQuery", () => ({
  useFlowTemplatesQuery: mocks.useFlowTemplatesQuery
}));
vi.mock("../../features/products/model/useProductListQuery", () => ({
  useProductListQuery: mocks.useProductListQuery
}));
vi.mock("../../features/flows/model/useFlowDefinitionQuery", () => ({
  useFlowDefinitionQuery: mocks.useFlowDefinitionQuery
}));
vi.mock("../../features/flows/model/useFlowActivationReviewQuery", () => ({
  useFlowActivationReviewQuery: mocks.useFlowActivationReviewQuery
}));
vi.mock("../../features/flows/model/useFlowEnrollmentQuery", () => ({
  useFlowEnrollmentQuery: mocks.useFlowEnrollmentQuery
}));
vi.mock("../../features/flows/model/useActivateFlowMutation", () => ({
  useActivateFlowMutation: mocks.useActivateFlowMutation
}));
vi.mock("../../features/flows/model/usePauseFlowEnrollmentMutation", () => ({
  usePauseFlowEnrollmentMutation: mocks.usePauseFlowEnrollmentMutation
}));
vi.mock("../../features/flows/model/useCreateFlowMutation", () => ({
  useCreateFlowMutation: mocks.useCreateFlowMutation
}));
vi.mock("../../features/flows/model/useCreateNextFlowDraftMutation", () => ({
  useCreateNextFlowDraftMutation: mocks.useCreateNextFlowDraftMutation
}));
vi.mock("../../features/flows/model/useUpdateFlowDraftMutation", () => ({
  useUpdateFlowDraftMutation: mocks.useUpdateFlowDraftMutation
}));
vi.mock("../../features/flows/model/usePublishFlowMutation", () => ({
  usePublishFlowMutation: mocks.usePublishFlowMutation
}));
vi.mock("../../features/flows/model/useValidateFlowDefinitionMutation", () => ({
  useValidateFlowDefinitionMutation: mocks.useValidateFlowDefinitionMutation
}));
vi.mock("../../features/flows/ui/FlowWorkItemQueuePanel", () => ({
  FlowWorkItemQueuePanel: ({ locale }: { locale: "ru" | "en" }) => (
    <div data-testid="flow-work-item-queue-panel">{locale}</div>
  )
}));

describe("FlowsPage enrollment controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setList([inactivePublishedFlow()]);
    mocks.useFlowTemplatesQuery.mockReturnValue({
      data: { templates: [] },
      isLoading: false,
      error: null
    });
    mocks.useProductListQuery.mockReturnValue({
      data: { products: [], total: 0 },
      isLoading: false,
      error: null
    });
    mocks.useFlowDefinitionQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    mocks.useFlowActivationReviewQuery.mockImplementation(
      (selectedFlowId: string | null, selectedVersionId: string | null) => ({
        data: selectedFlowId && selectedVersionId ? readyReview() : null,
        isLoading: false,
        error: null,
        refetch: mocks.reviewRefetch
      })
    );
    mocks.useFlowEnrollmentQuery.mockImplementation((selectedFlowId: string | null) => ({
      data: selectedFlowId ? activeEnrollmentDetail() : null,
      isLoading: false,
      error: null,
      refetch: mocks.enrollmentRefetch
    }));
    mocks.listRefetch.mockResolvedValue({ data: null, error: null });
    mocks.reviewRefetch.mockResolvedValue({ data: readyReview(), error: null });
    mocks.enrollmentRefetch.mockResolvedValue({ data: activeEnrollmentDetail(), error: null });

    for (const hook of [
      mocks.useActivateFlowMutation,
      mocks.usePauseFlowEnrollmentMutation,
      mocks.useCreateFlowMutation,
      mocks.useCreateNextFlowDraftMutation,
      mocks.useUpdateFlowDraftMutation,
      mocks.usePublishFlowMutation,
      mocks.useValidateFlowDefinitionMutation
    ]) {
      hook.mockReturnValue(mutation());
    }
  });

  afterEach(() => cleanup());

  it("activates only after review confirmation with the exact review CAS", () => {
    const activate = vi.fn();
    mocks.useActivateFlowMutation.mockReturnValue(mutation(activate));
    render(<FlowsPage />);

    openAutomation("Проверить и включить автоматизацию");
    fireEvent.click(screen.getByRole("button", { name: "Запустить версию" }));

    expect(activate).toHaveBeenCalledWith(
      {
        flowId,
        body: {
          schemaVersion: "flow-activation-command.v1",
          versionId,
          expectedRevision: 7,
          expectedEnrollmentRevision: 0,
          expectedActiveVersionId: null
        },
        idempotencyKey: expect.stringMatching(/^flows:activate:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it("reuses the same activation attempt after network failure without automatic retry", () => {
    const activate = vi.fn((_input, options) => options?.onError(new TypeError("Failed to fetch")));
    mocks.useActivateFlowMutation.mockReturnValue(mutation(activate));
    render(<FlowsPage />);

    openAutomation("Проверить и включить автоматизацию");
    fireEvent.click(screen.getByRole("button", { name: "Запустить версию" }));
    expect(activate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Повторить запуск" }));

    expect(activate).toHaveBeenCalledTimes(2);
    expect(activate.mock.calls[1]![0].idempotencyKey).toBe(
      activate.mock.calls[0]![0].idempotencyKey
    );
  });

  it("requires authority refetch and manual reconfirmation after activation conflict", async () => {
    const activate = vi.fn((_input, options) =>
      options?.onError(
        new HttpError(409, {
          code: "FLOW_ENROLLMENT_REVISION_CONFLICT",
          expectedRevision: 0,
          currentRevision: 1
        })
      )
    );
    mocks.useActivateFlowMutation.mockReturnValue(mutation(activate));
    render(<FlowsPage />);

    openAutomation("Проверить и включить автоматизацию");
    fireEvent.click(screen.getByRole("button", { name: "Запустить версию" }));
    expect(activate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Обновить состояние" }));

    expect(activate).toHaveBeenCalledTimes(1);
    expect(mocks.listRefetch).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.reviewRefetch).toHaveBeenCalledOnce());
  });

  it("pauses enrollment with the exact active version and epoch CAS", () => {
    setList([activeFlow()]);
    const pause = vi.fn();
    mocks.usePauseFlowEnrollmentMutation.mockReturnValue(mutation(pause));
    render(<FlowsPage />);

    openAutomation("Автоматизация активна");
    fireEvent.click(screen.getByRole("button", { name: "Поставить на паузу" }));

    expect(pause).toHaveBeenCalledWith(
      {
        flowId,
        body: {
          schemaVersion: "flow-enrollment-pause-command.v1",
          expectedEnrollmentRevision: 1,
          expectedActiveVersionId: versionId,
          expectedActivationEpochId: epochId
        },
        idempotencyKey: expect.stringMatching(/^flows:pause-enrollment:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

});

function openAutomation(accessibleName: string) {
  fireEvent.click(screen.getAllByRole("switch", { name: accessibleName })[0]!);
}

function setList(flows: readonly FlowDefinitionSummaryV3[]) {
  mocks.useFlowListQuery.mockReturnValue({
    data: { schemaVersion: "flow-definition-list.v3", flows, total: flows.length },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mocks.listRefetch
  });
}

function mutation(mutate = vi.fn()) {
  return {
    mutate,
    isPending: false,
    error: null,
    reset: vi.fn()
  };
}

function inactivePublishedFlow(): FlowDefinitionSummaryV3 {
  return {
    schemaVersion: "flow-definition-summary.v3",
    id: flowId,
    ownerUserId: "44444444-4444-4444-8444-444444444444",
    name: "Подготовка консультации",
    state: "versioned",
    approvalMode: "manual_approve",
    revision: 7,
    draftBaseVersionId: null,
    latestPublishedVersionId: versionId,
    latestPublishedVersion: 2,
    createdAt: "2026-08-04T18:00:00.000Z",
    updatedAt: "2026-08-04T18:00:00.000Z",
    publishedAt: "2026-08-04T18:00:00.000Z",
    graphSchemaVersion: "flow-graph.v2",
    origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
    enrollment: {
      schemaVersion: "flow-enrollment-read-authority.v1",
      authority: "enrollment_v1",
      control: {
        schemaVersion: "flow-enrollment-control.v1",
        flowId,
        state: "inactive",
        definitionRevision: 7,
        enrollmentRevision: 0,
        activeVersionId: null,
        activeActivationEpochId: null,
        activeSince: null,
        lastPausedAt: null
      }
    }
  };
}

function activeFlow(): FlowDefinitionSummaryV3 {
  return {
    ...inactivePublishedFlow(),
    enrollment: activeEnrollmentDetail().enrollment
      ? {
          schemaVersion: "flow-enrollment-read-authority.v1",
          authority: "enrollment_v1",
          control: activeEnrollmentDetail().enrollment
        }
      : inactivePublishedFlow().enrollment
  };
}

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

function activeEnrollmentDetail(): FlowEnrollmentDetailResponse {
  return {
    schemaVersion: "flow-enrollment-detail.v1",
    enrollment: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId,
      state: "active",
      definitionRevision: 7,
      enrollmentRevision: 1,
      activeVersionId: versionId,
      activeActivationEpochId: epochId,
      activeSince: "2026-08-04T18:00:00.000Z",
      lastPausedAt: null
    },
    activeActivationEpoch: {
      schemaVersion: "flow-activation-epoch.v1",
      id: epochId,
      flowId,
      flowVersionId: versionId,
      sequence: 1,
      effectiveFrom: "2026-08-04T18:00:00.000Z",
      effectiveTo: null,
      manifestDigest: `sha256:${"a".repeat(64)}`,
      rolloutPolicyRevision: 2,
      activatedByActorSubjectId: "55555555-5555-4555-8555-555555555555",
      activateCommandId: "66666666-6666-4666-8666-666666666666",
      closeReason: null,
      closedByActorSubjectId: null,
      closeCommandId: null
    }
  };
}
