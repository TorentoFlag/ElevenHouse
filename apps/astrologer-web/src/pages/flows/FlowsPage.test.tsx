// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowsPage } from "./FlowsPage";

const mocks = vi.hoisted(() => ({
  useDocumentTitle: vi.fn(),
  useCreateManualFlowRunMutation: vi.fn(),
  useFlowApprovalsQuery: vi.fn(),
  useFlowListQuery: vi.fn(),
  useFlowRunsQuery: vi.fn(),
  useFlowTemplatesQuery: vi.fn(),
  useActivateFlowMutation: vi.fn(),
  useCreateFlowMutation: vi.fn(),
  useDecideFlowApprovalMutation: vi.fn(),
  usePauseFlowMutation: vi.fn(),
  useUpdateFlowDraftMutation: vi.fn(),
  usePublishFlowMutation: vi.fn(),
  useSimulateFlowRunMutation: vi.fn()
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/flows/model/useFlowListQuery", () => ({
  useFlowListQuery: mocks.useFlowListQuery
}));

vi.mock("../../features/flows/model/useFlowRunsQuery", () => ({
  useFlowRunsQuery: mocks.useFlowRunsQuery
}));

vi.mock("../../features/flows/model/useFlowApprovalsQuery", () => ({
  useFlowApprovalsQuery: mocks.useFlowApprovalsQuery
}));

vi.mock("../../features/flows/model/useFlowTemplatesQuery", () => ({
  useFlowTemplatesQuery: mocks.useFlowTemplatesQuery
}));

vi.mock("../../features/flows/model/useActivateFlowMutation", () => ({
  useActivateFlowMutation: mocks.useActivateFlowMutation
}));

vi.mock("../../features/flows/model/useCreateManualFlowRunMutation", () => ({
  useCreateManualFlowRunMutation: mocks.useCreateManualFlowRunMutation
}));

vi.mock("../../features/flows/model/useCreateFlowMutation", () => ({
  useCreateFlowMutation: mocks.useCreateFlowMutation
}));

vi.mock("../../features/flows/model/useDecideFlowApprovalMutation", () => ({
  useDecideFlowApprovalMutation: mocks.useDecideFlowApprovalMutation
}));

vi.mock("../../features/flows/model/usePauseFlowMutation", () => ({
  usePauseFlowMutation: mocks.usePauseFlowMutation
}));

vi.mock("../../features/flows/model/useUpdateFlowDraftMutation", () => ({
  useUpdateFlowDraftMutation: mocks.useUpdateFlowDraftMutation
}));

vi.mock("../../features/flows/model/usePublishFlowMutation", () => ({
  usePublishFlowMutation: mocks.usePublishFlowMutation
}));

vi.mock("../../features/flows/model/useSimulateFlowRunMutation", () => ({
  useSimulateFlowRunMutation: mocks.useSimulateFlowRunMutation
}));

describe("FlowsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/flows");
    mocks.useFlowListQuery.mockReturnValue({
      data: { flows: [flow], total: 1 },
      isLoading: false,
      isError: false
    });
    mocks.useFlowTemplatesQuery.mockReturnValue({
      data: { templates: [] },
      isLoading: false,
      isError: false
    });
    mocks.useFlowRunsQuery.mockReturnValue({
      data: { runs: [], total: 0 },
      isLoading: false,
      error: null
    });
    mocks.useFlowApprovalsQuery.mockReturnValue({
      data: { approvals: [], total: 0 },
      isLoading: false,
      error: null
    });
    mocks.useCreateFlowMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    mocks.useCreateManualFlowRunMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    mocks.useDecideFlowApprovalMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    mocks.useActivateFlowMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    mocks.usePauseFlowMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    mocks.useUpdateFlowDraftMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mocks.usePublishFlowMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mocks.useSimulateFlowRunMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
      data: null,
      reset: vi.fn()
    });
  });

  afterEach(() => cleanup());

  it("loads the first flow page and sets the production document title", () => {
    render(<FlowsPage />);

    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("Воронки");
    expect(mocks.useFlowListQuery).toHaveBeenCalledWith({ status: "all", limit: 50, offset: 0 });
    expect(screen.getAllByText("Запись на консультацию")).toHaveLength(2);
  });

  it("creates a server-backed flow and opens the mutation response", () => {
    const createdFlow = { ...flow, id: "33333333-3333-4333-8333-333333333333", name: "Новая воронка" };
    const mutate = vi.fn((_input, options) => options?.onSuccess(createdFlow));
    mocks.useCreateFlowMutation.mockReturnValue({ mutate, isPending: false, error: null });
    render(<FlowsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Новая воронка" })[0]!);

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Новая воронка", graph: expect.any(Object) }),
      expect.any(Object)
    );
    expect(screen.getByRole("heading", { name: "Новая воронка" })).toBeTruthy();
  });

  it("saves the current draft graph before publishing an immutable version", () => {
    const updateDraft = vi.fn();
    const publish = vi.fn();
    mocks.useUpdateFlowDraftMutation.mockReturnValue({ mutate: updateDraft, isPending: false, error: null });
    mocks.usePublishFlowMutation.mockReturnValue({ mutate: publish, isPending: false, error: null });
    render(<FlowsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Открыть схему: Запись на консультацию" }));
    fireEvent.change(screen.getByLabelText("Название узла"), { target: { value: "Новый клиент" } });
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: flow.id,
        body: {
          graph: expect.objectContaining({
            nodes: expect.arrayContaining([
              expect.objectContaining({ id: "lead-created", title: "Новый клиент" })
            ])
          })
        }
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(publish).not.toHaveBeenCalled();

    updateDraft.mock.calls[0]![1].onSuccess();

    expect(publish).toHaveBeenCalledWith(
      flow.id,
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("keeps a newly created builder in sync with the publish response", () => {
    const createdFlow = { ...flow, id: "33333333-3333-4333-8333-333333333333", name: "Новая воронка" };
    const publishedFlow = {
      ...createdFlow,
      status: "published",
      publishedVersionId: "44444444-4444-4444-8444-444444444444",
      publishedVersion: 1,
      publishedAt: "2026-07-30T14:45:00.000Z"
    };
    const create = vi.fn((_input, options) => options?.onSuccess(createdFlow));
    const updateDraft = vi.fn((_input, options) => options?.onSuccess(createdFlow));
    const publish = vi.fn((_flowId, options) =>
      options?.onSuccess({
        flow: publishedFlow,
        version: {
          id: "44444444-4444-4444-8444-444444444444",
          flowId: createdFlow.id,
          version: 1,
          status: "published",
          approvalMode: createdFlow.approvalMode,
          graph: createdFlow.draftGraph,
          publishedAt: "2026-07-30T14:45:00.000Z"
        }
      })
    );
    mocks.useCreateFlowMutation.mockReturnValue({ mutate: create, isPending: false, error: null });
    mocks.useUpdateFlowDraftMutation.mockReturnValue({ mutate: updateDraft, isPending: false, error: null });
    mocks.usePublishFlowMutation.mockReturnValue({ mutate: publish, isPending: false, error: null });

    render(<FlowsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Новая воронка" })[0]!);
    expect(screen.getByText("Черновик")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(screen.getByRole("button", { name: "Опубликована" })).toBeTruthy();
    expect(screen.queryByText("Черновик")).toBeNull();
  });

  it("toggles published flow automation through activation commands", () => {
    const activate = vi.fn();
    const pause = vi.fn();
    mocks.useFlowListQuery.mockReturnValue({
      data: {
        flows: [
          {
            ...flow,
            status: "published",
            publishedVersionId: "44444444-4444-4444-8444-444444444444",
            publishedVersion: 1,
            publishedAt: "2026-07-30T14:45:00.000Z"
          },
          {
            ...otherFlow,
            status: "active",
            publishedVersionId: "55555555-5555-4555-8555-555555555555",
            publishedVersion: 1,
            publishedAt: "2026-07-30T14:45:00.000Z"
          }
        ],
        total: 2
      },
      isLoading: false,
      isError: false
    });
    mocks.useActivateFlowMutation.mockReturnValue({ mutate: activate, isPending: false, error: null });
    mocks.usePauseFlowMutation.mockReturnValue({ mutate: pause, isPending: false, error: null });

    render(<FlowsPage />);

    fireEvent.click(screen.getAllByRole("switch", { name: "Включить автоматизацию" })[0]!);
    fireEvent.click(screen.getAllByRole("switch", { name: "Автоматизация активна" })[0]!);

    expect(activate).toHaveBeenCalledWith(flow.id);
    expect(pause).toHaveBeenCalledWith(otherFlow.id);
  });

  it("does not keep a simulation result when another flow is opened", () => {
    const resetSimulation = vi.fn();
    mocks.useFlowListQuery.mockReturnValue({
      data: { flows: [flow, otherFlow], total: 2 },
      isLoading: false,
      isError: false
    });
    mocks.useSimulateFlowRunMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
      data: {
        flowId: flow.id,
        flowVersionId: "33333333-3333-4333-8333-333333333333",
        plannedSteps: [{ nodeId: "lead-created", status: "planned", reason: null }],
        warnings: []
      },
      reset: resetSimulation
    });

    render(<FlowsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Открыть схему: Другая воронка" }));

    expect(resetSimulation).toHaveBeenCalled();
    expect(screen.queryByText("План выполнения")).toBeNull();
  });

  it("creates an AstroCalendar handoff draft from the suggested template and query context", () => {
    const mutate = vi.fn();
    mocks.useCreateFlowMutation.mockReturnValue({ mutate, isPending: false, error: null });
    mocks.useFlowTemplatesQuery.mockReturnValue({
      data: { templates: [astroCalendarTemplate] },
      isLoading: false,
      isError: false
    });
    window.history.replaceState(
      null,
      "",
      "/flows?source=astro_calendar&eventId=client-transit-1&suggestedTemplateKey=sleeping-client-reactivation&clientId=22222222-2222-4222-8222-222222222222"
    );

    render(<FlowsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Новая воронка" })[0]!);

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Астрокалендарь · Реактивация спящих",
        approvalMode: "manual_approve",
        graph: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: "trigger-astro-event",
              config: expect.objectContaining({
                source: "astro_calendar",
                eventId: "client-transit-1",
                clientId: "22222222-2222-4222-8222-222222222222"
              })
            })
          ])
        })
      }),
      expect.any(Object)
    );
  });
});

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Запись на консультацию",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "lead-created",
        category: "trigger",
        kind: "lead_created",
        title: "Новый лид",
        config: {}
      }
    ],
    edges: []
  },
  publishedVersionId: null,
  publishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null
};

const otherFlow = {
  ...flow,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Другая воронка"
};

const astroCalendarTemplate = {
  key: "sleeping-client-reactivation",
  name: "Реактивация спящих",
  description: "Спящий клиент + астроповод -> заботливый черновик.",
  category: "retention",
  recommendedApprovalMode: "manual_approve",
  requiredCapabilities: ["crm", "astro_calendar", "messaging", "ai_drafts"],
  graph: {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "trigger-astro-event",
        category: "trigger",
        kind: "astro_event",
        title: "Транзит у спящего клиента",
        config: {}
      }
    ],
    edges: []
  }
};
