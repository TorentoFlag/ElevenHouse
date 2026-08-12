// @vitest-environment jsdom

import type {
  FlowDefinitionDetail,
  FlowDefinitionSummary,
  FlowDefinitionTemplateDescriptorV2,
  PublishFlowDefinitionResponse
} from "@elevenhouse/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowsPage } from "./FlowsPage";

const mocks = vi.hoisted(() => ({
  locale: "ru" as "ru" | "en",
  useDocumentTitle: vi.fn(),
  useFlowListQuery: vi.fn(),
  useFlowTemplatesQuery: vi.fn(),
  useProductListQuery: vi.fn(),
  useAstrologerTariffEntitlementsQuery: vi.fn(),
  useFlowDefinitionQuery: vi.fn(),
  useFlowActivationReviewQuery: vi.fn(),
  useFlowEnrollmentQuery: vi.fn(),
  useActivateFlowMutation: vi.fn(),
  useArchiveFlowDefinitionMutation: vi.fn(),
  useCreateFlowMutation: vi.fn(),
  useCreateManualFlowRunMutation: vi.fn(),
  useCreateNextFlowDraftMutation: vi.fn(),
  useDeleteFlowDefinitionMutation: vi.fn(),
  useDuplicateFlowDefinitionMutation: vi.fn(),
  usePauseFlowEnrollmentMutation: vi.fn(),
  useUpdateFlowDraftMutation: vi.fn(),
  usePublishFlowMutation: vi.fn(),
  useRestoreFlowDefinitionMutation: vi.fn(),
  useValidateFlowDefinitionMutation: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: () => ({ locale: mocks.locale })
}));
vi.mock("react-router", () => ({
  useLocation: () => ({ search: window.location.search })
}));
vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));
vi.mock("../../features/flows/model/useFlowListQuery", () => ({
  useFlowListQuery: mocks.useFlowListQuery
}));
vi.mock("../../features/flows/model/useFlowTemplatesQuery", () => ({
  useFlowTemplatesQuery: mocks.useFlowTemplatesQuery
}));
vi.mock("../../features/products/model/useProductListQuery", () => ({
  useProductListQuery: mocks.useProductListQuery
}));
vi.mock("../../features/platform-tariffs/model/useAstrologerTariffEntitlementsQuery", () => ({
  useAstrologerTariffEntitlementsQuery: mocks.useAstrologerTariffEntitlementsQuery
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
vi.mock("../../features/flows/model/useArchiveFlowDefinitionMutation", () => ({
  useArchiveFlowDefinitionMutation: mocks.useArchiveFlowDefinitionMutation
}));
vi.mock("../../features/flows/model/useCreateFlowMutation", () => ({
  useCreateFlowMutation: mocks.useCreateFlowMutation
}));
vi.mock("../../features/flows/model/useCreateManualFlowRunMutation", () => ({
  useCreateManualFlowRunMutation: mocks.useCreateManualFlowRunMutation
}));
vi.mock("../../features/flows/model/useCreateNextFlowDraftMutation", () => ({
  useCreateNextFlowDraftMutation: mocks.useCreateNextFlowDraftMutation
}));
vi.mock("../../features/flows/model/useDeleteFlowDefinitionMutation", () => ({
  useDeleteFlowDefinitionMutation: mocks.useDeleteFlowDefinitionMutation
}));
vi.mock("../../features/flows/model/useDuplicateFlowDefinitionMutation", () => ({
  useDuplicateFlowDefinitionMutation: mocks.useDuplicateFlowDefinitionMutation
}));
vi.mock("../../features/flows/model/usePauseFlowEnrollmentMutation", () => ({
  usePauseFlowEnrollmentMutation: mocks.usePauseFlowEnrollmentMutation
}));
vi.mock("../../features/flows/model/useUpdateFlowDraftMutation", () => ({
  useUpdateFlowDraftMutation: mocks.useUpdateFlowDraftMutation
}));
vi.mock("../../features/flows/model/usePublishFlowMutation", () => ({
  usePublishFlowMutation: mocks.usePublishFlowMutation
}));
vi.mock("../../features/flows/model/useRestoreFlowDefinitionMutation", () => ({
  useRestoreFlowDefinitionMutation: mocks.useRestoreFlowDefinitionMutation
}));
vi.mock("../../features/flows/model/useValidateFlowDefinitionMutation", () => ({
  useValidateFlowDefinitionMutation: mocks.useValidateFlowDefinitionMutation
}));
vi.mock("../../features/flows/ui/FlowWorkItemQueuePanel", () => ({
  FlowWorkItemQueuePanel: ({ locale }: { locale: "ru" | "en" }) => (
    <div data-testid="flow-work-item-queue-panel">{locale}</div>
  )
}));
vi.mock("../../features/flows/ui/FlowApprovalQueuePanel", () => ({
  FlowApprovalQueuePanel: ({ locale }: { locale: "ru" | "en" }) => (
    <div data-testid="flow-approval-queue-panel">{locale}</div>
  )
}));
vi.mock("../../features/flows/ui/FlowManualClientRunDialog", () => ({
  FlowManualClientRunDialog: ({ flowName }: { flowName: string }) => (
    <div role="dialog">Ручной запуск: {flowName}</div>
  )
}));

const flow: FlowDefinitionSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Запись на консультацию",
  state: "draft",
  approvalMode: "manual_approve",
  revision: 3,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  activeRunCount: 0,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  enrollment: inactiveEnrollment(3)
};

const flowDetail: Extract<FlowDefinitionDetail, { graphSchemaVersion: "flow-graph.v2" }> = {
  ...flow,
  draftGraph: {
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual-client",
        kind: "manual_client",
        displayTitle: "Клиент выбран вручную",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      }
    ],
    edges: []
  },
  draftPresentation: {
    schemaVersion: "flow-presentation.v1",
    nodes: [{ nodeId: "manual-client", position: { x: 80, y: 120 } }],
    viewport: { x: 0, y: 0, zoom: 1 }
  }
};

const availableTemplate: FlowDefinitionTemplateDescriptorV2 = {
  schemaVersion: "flow-definition-template.v2",
  key: "manual-consultation-preparation",
  version: 2,
  name: "Подготовка консультации вручную",
  description: "Создать внутреннюю задачу подготовки и завершить ее вручную.",
  category: "service_delivery",
  availability: "available",
  recommendedApprovalMode: "manual_approve",
  parameters: [],
  requiredCapabilities: [],
  blockerCode: null
};

const detailResponses = new Map<string, FlowDefinitionDetail>();

describe("FlowsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detailResponses.clear();
    detailResponses.set(flow.id, flowDetail);
    mocks.locale = "ru";
    window.history.replaceState(null, "", "/flows");
    mocks.useFlowListQuery.mockReturnValue({
      data: {
        flows: [flow],
        total: 1,
        runtime: {
          mode: "definition_only",
          executionAvailable: false,
          reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
          historySemantics: "durable_execution"
        }
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    });
    mocks.useFlowTemplatesQuery.mockReturnValue({
      data: {
        schemaVersion: "flow-definition-template-catalog.v2",
        catalogVersion: 2,
        locale: "ru",
        templates: [availableTemplate]
      },
      isLoading: false,
      isError: false,
      error: null
    });
    mocks.useProductListQuery.mockReturnValue({
      data: { products: [], total: 0, counts: { all: 0, active: 0, draft: 0, archived: 0 } },
      isLoading: false,
      isError: false,
      error: null
    });
    mocks.useAstrologerTariffEntitlementsQuery.mockReturnValue({
      data: {
        products: { read: "allow", mutation: "allow" },
        funnels: { read: "allow", mutation: "allow" }
      },
      isLoading: false,
      isError: false
    });
    mocks.useFlowDefinitionQuery.mockImplementation((flowId: string | null) => ({
      data: flowId ? detailResponses.get(flowId) : undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    }));
    mocks.useFlowActivationReviewQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    mocks.useFlowEnrollmentQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    mocks.useCreateFlowMutation.mockReturnValue(mutation());
    mocks.useCreateManualFlowRunMutation.mockReturnValue({
      ...mutation(),
      mutateAsync: vi.fn()
    });
    mocks.useCreateNextFlowDraftMutation.mockReturnValue(mutation());
    mocks.useActivateFlowMutation.mockReturnValue(mutation());
    mocks.useArchiveFlowDefinitionMutation.mockReturnValue(mutation());
    mocks.useRestoreFlowDefinitionMutation.mockReturnValue(mutation());
    mocks.useDuplicateFlowDefinitionMutation.mockReturnValue(mutation());
    mocks.useDeleteFlowDefinitionMutation.mockReturnValue(mutation());
    mocks.usePauseFlowEnrollmentMutation.mockReturnValue(mutation());
    mocks.useUpdateFlowDraftMutation.mockReturnValue(mutation());
    mocks.usePublishFlowMutation.mockReturnValue(mutation());
    mocks.useValidateFlowDefinitionMutation.mockReturnValue(
      mutation(vi.fn((_input, options) => options?.onSuccess(validValidation())))
    );
  });

  afterEach(() => cleanup());

  it("loads the current definition list and localized template catalog", () => {
    renderFlowsPage();

    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("Воронки");
    expect(mocks.useFlowListQuery).toHaveBeenCalledWith({
      state: "all",
      enrollmentState: "all",
      limit: 50,
      offset: 0
    });
    expect(mocks.useFlowTemplatesQuery).toHaveBeenCalledWith("ru");
    expect(mocks.useProductListQuery).toHaveBeenCalledWith(
      { status: "active", limit: 100, offset: 0 },
      { enabled: true }
    );
    expect(screen.getAllByText(flow.name)).toHaveLength(2);
  });

  it("does not request products when the server entitlement denies product reads", () => {
    mocks.useAstrologerTariffEntitlementsQuery.mockReturnValue({
      data: {
        products: { read: "deny", mutation: "deny" },
        funnels: { read: "deny", mutation: "deny" }
      },
      isLoading: false,
      isError: false
    });

    renderFlowsPage();

    expect(mocks.useProductListQuery).toHaveBeenCalledWith(
      { status: "active", limit: 100, offset: 0 },
      { enabled: false }
    );
  });

  it("filters the list locally while keeping archived flows out of All", () => {
    const archivedFlow = {
      ...flow,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Архивная реактивация",
      state: "archived" as const
    };
    const activeVersionId = "44444444-4444-4444-8444-444444444444";
    const activeFlow = {
      ...flow,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Активная продажа",
      state: "versioned" as const,
      latestPublishedVersionId: activeVersionId,
      latestPublishedVersion: 1,
      publishedAt: "2026-07-30T14:45:00.000Z",
      enrollment: {
        ...inactiveEnrollment(5),
        control: {
          ...inactiveEnrollment(5).control,
          flowId: "55555555-5555-4555-8555-555555555555",
          state: "active" as const,
          enrollmentRevision: 1,
          activeVersionId,
          activeActivationEpochId: "66666666-6666-4666-8666-666666666666",
          activeSince: "2026-07-30T14:45:00.000Z"
        }
      }
    };
    listFlows([flow, archivedFlow, activeFlow]);

    renderFlowsPage();

    expect(screen.getAllByText(flow.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(activeFlow.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(archivedFlow.name)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Архив" }));
    expect(screen.getAllByText(archivedFlow.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(activeFlow.name)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Все" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск по названию воронки" }), {
      target: { value: "актив" }
    });

    expect(screen.getAllByText(activeFlow.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(flow.name)).toBeNull();
    expect(screen.queryByText(archivedFlow.name)).toBeNull();
  });

  it("shows the work-item queue on the flow list and removes it inside the builder", () => {
    renderFlowsPage();

    expect(screen.getByTestId("flow-work-item-queue-panel").textContent).toBe("ru");
    openFlow(flow.name);
    expect(screen.queryByTestId("flow-work-item-queue-panel")).toBeNull();
  });

  it("uses the server-confirmed runtime availability inside the builder", () => {
    renderFlowsPage();

    openFlow(flow.name);

    expect(
      screen.getByText(
        "Исполнение воронки пока недоступно. Сценарий можно редактировать и публиковать."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText("Доступность исполнения этой версии не подтверждена сервером.")
    ).toBeNull();
  });

  it("opens the real manual-client command only for an active published version", () => {
    const active = {
      ...flowDetail,
      state: "versioned" as const,
      revision: 5,
      latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
      latestPublishedVersion: 1,
      publishedAt: "2026-07-30T14:45:00.000Z",
      enrollment: {
        ...flowDetail.enrollment,
        control: {
          ...flowDetail.enrollment.control,
          state: "active" as const,
          definitionRevision: 5,
          enrollmentRevision: 1,
          activeVersionId: "44444444-4444-4444-8444-444444444444",
          activeActivationEpochId: "55555555-5555-4555-8555-555555555555",
          activeSince: "2026-07-30T14:45:00.000Z"
        }
      }
    };
    detailResponses.set(flow.id, active);
    mocks.useFlowListQuery.mockReturnValue({
      data: {
        flows: [
          {
            ...flow,
            state: "versioned",
            revision: active.revision,
            latestPublishedVersionId: active.latestPublishedVersionId,
            latestPublishedVersion: active.latestPublishedVersion,
            publishedAt: active.publishedAt,
            enrollment: active.enrollment
          }
        ],
        total: 1,
        runtime: {
          mode: "enabled",
          executionAvailable: true,
          reasonCode: null,
          historySemantics: "durable_execution"
        }
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    });
    renderFlowsPage();

    openFlow(flow.name);
    fireEvent.click(screen.getByRole("button", { name: "Запустить для клиента" }));

    expect(screen.getByRole("dialog").textContent).toContain(`Ручной запуск: ${flow.name}`);
  });

  it("creates a server-backed template definition and opens its returned detail", () => {
    const createdDetail: FlowDefinitionDetail = {
      ...flowDetail,
      id: "33333333-3333-4333-8333-333333333333",
      name: availableTemplate.name
    };
    detailResponses.set(createdDetail.id, createdDetail);
    const mutate = vi.fn((_input, options) => options?.onSuccess(createdDetail));
    mocks.useCreateFlowMutation.mockReturnValue(mutation(mutate));
    renderFlowsPage();

    fireEvent.click(screen.getAllByRole("button", { name: "Новая воронка" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(availableTemplate.name) }));

    expect(mutate).toHaveBeenCalledWith(
      {
        body: {
          schemaVersion: "flow-definition-create.v2",
          name: availableTemplate.name,
          locale: "ru",
          approvalMode: "manual_approve",
          source: {
            type: "template",
            templateKey: availableTemplate.key,
            templateVersion: availableTemplate.version,
            parameters: {}
          }
        },
        idempotencyKey: expect.stringMatching(/^flows:create:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(screen.getByRole("heading", { name: availableTemplate.name })).toBeTruthy();
  });

  it("reuses each unresolved create key across alternating template and blank attempts", () => {
    const mutate = vi.fn();
    mocks.useCreateFlowMutation.mockReturnValue(mutation(mutate));
    renderFlowsPage();

    fireEvent.click(screen.getAllByRole("button", { name: "Новая воронка" })[0]!);
    const templateButton = screen.getByRole("button", {
      name: new RegExp(availableTemplate.name)
    });
    fireEvent.click(templateButton);
    fireEvent.click(
      screen.getByRole("button", { name: "Пустая воронка Собрать с нуля" })
    );
    fireEvent.click(templateButton);

    expect(mutate).toHaveBeenCalledTimes(3);
    expect(mutate.mock.calls[2]![0].idempotencyKey).toBe(mutate.mock.calls[0]![0].idempotencyKey);
    expect(mutate.mock.calls[1]![0].idempotencyKey).not.toBe(
      mutate.mock.calls[0]![0].idempotencyKey
    );
  });

  it("saves the exact local draft before publishing with the returned revision", () => {
    const updateDraft = vi.fn();
    const publish = vi.fn();
    const activate = vi.fn();
    mocks.useUpdateFlowDraftMutation.mockReturnValue(mutation(updateDraft));
    mocks.usePublishFlowMutation.mockReturnValue(mutation(publish));
    mocks.useActivateFlowMutation.mockReturnValue(mutation(activate));
    renderFlowsPage();

    openFlow(flow.name);
    fireEvent.change(screen.getByLabelText("Название узла"), {
      target: { value: "Выбрать клиента" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(updateDraft).toHaveBeenCalledWith(
      {
        flowId: flow.id,
        body: {
          expectedRevision: 3,
          graph: expect.objectContaining({
            nodes: [
              expect.objectContaining({ id: "manual-client", displayTitle: "Выбрать клиента" })
            ]
          }),
          presentation: flowDetail.draftPresentation
        },
        idempotencyKey: expect.stringMatching(/^flows:update:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(publish).not.toHaveBeenCalled();

    updateDraft.mock.calls[0]![1].onSuccess({ ...flowDetail, revision: 4 });
    expect(publish).toHaveBeenCalledWith(
      {
        flowId: flow.id,
        body: { expectedRevision: 4 },
        idempotencyKey: expect.stringMatching(/^flows:publish:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );

    const publication = publishedFlow();
    act(() => publish.mock.calls[0]![1].onSuccess(publication));

    expect(screen.getByRole("heading", { name: "Проверка запуска" })).toBeTruthy();
    expect(mocks.useFlowActivationReviewQuery).toHaveBeenLastCalledWith(
      publication.flow.id,
      publication.version.id
    );
    expect(activate).not.toHaveBeenCalled();
  });

  it("creates the next draft from the exact published version", () => {
    const versioned = versionedFlow();
    const detail: Extract<FlowDefinitionDetail, { graphSchemaVersion: "flow-graph.v2" }> = {
      ...flowDetail,
      state: versioned.state,
      revision: versioned.revision,
      latestPublishedVersionId: versioned.latestPublishedVersionId,
      latestPublishedVersion: versioned.latestPublishedVersion,
      publishedAt: versioned.publishedAt
    };
    detailResponses.set(flow.id, detail);
    listFlows([versioned]);
    const mutate = vi.fn();
    mocks.useCreateNextFlowDraftMutation.mockReturnValue(mutation(mutate));
    renderFlowsPage();

    openFlow(versioned.name);
    fireEvent.click(screen.getByRole("button", { name: "Создать новую версию" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        flowId: flow.id,
        body: {
          expectedRevision: versioned.revision,
          baseVersionId: versioned.latestPublishedVersionId
        },
        idempotencyKey: expect.stringMatching(/^flows:next-draft:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("blocks persistence when server validation rejects the candidate graph", () => {
    const validate = vi.fn((_input, options) =>
      options?.onSuccess({
        ...validValidation(),
        publishable: false,
        activatable: false,
        issues: [
          {
            code: "missing_required_source_handle",
            severity: "error",
            blocking: true,
            path: "nodes.manual-client.next",
            message: "Node manual_client requires exactly one next edge."
          }
        ],
        activationBlockers: ["FLOW_GRAPH_NOT_PUBLISHABLE"],
        normalizedGraph: null,
        capabilityManifest: null
      })
    );
    const publish = vi.fn();
    mocks.useValidateFlowDefinitionMutation.mockReturnValue(mutation(validate));
    mocks.usePublishFlowMutation.mockReturnValue(mutation(publish));
    renderFlowsPage();

    openFlow(flow.name);
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(validate).toHaveBeenCalledWith(
      { flowId: flow.id, graph: flowDetail.draftGraph },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(publish).not.toHaveBeenCalled();
    expect(screen.getByRole("alert", { name: "Проверка схемы" }).textContent).toContain(
      "missing_required_source_handle"
    );
  });

  it("opens an AstroCalendar recommendation without inventing unsupported graph context", () => {
    const unavailableTemplate: FlowDefinitionTemplateDescriptorV2 = {
      ...availableTemplate,
      key: "sleeping-client-reactivation",
      name: "Реактивация клиента",
      availability: "unavailable",
      requiredCapabilities: ["segments", "astro_calendar", "consent", "messaging"],
      blockerCode: "FLOW_TEMPLATE_CAPABILITY_UNAVAILABLE"
    };
    mocks.useFlowTemplatesQuery.mockReturnValue({
      data: {
        schemaVersion: "flow-definition-template-catalog.v2",
        catalogVersion: 1,
        locale: "ru",
        templates: [unavailableTemplate]
      },
      isLoading: false,
      isError: false,
      error: null
    });
    window.history.replaceState(
      null,
      "",
      "/flows?source=astro_calendar&eventId=client-transit-1&suggestedTemplateKey=sleeping-client-reactivation&clientId=22222222-2222-4222-8222-222222222222"
    );
    const create = vi.fn();
    mocks.useCreateFlowMutation.mockReturnValue(mutation(create));
    renderFlowsPage();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/запрошенный интеграцией, пока нельзя создать/)).toBeTruthy();
    const templateButton = screen.getByRole("button", { name: /Реактивация клиента/ });
    expect(templateButton).toHaveProperty("disabled", true);
    fireEvent.click(templateButton);
    expect(create).not.toHaveBeenCalled();
  });

  it("opens the exact flow when an operational deep link changes on the mounted route", async () => {
    const page = renderFlowsPage();

    window.history.replaceState(null, "", `/flows?flowId=${flow.id}`);
    page.rerender();

    await waitFor(() => expect(mocks.useFlowDefinitionQuery).toHaveBeenCalledWith(flow.id));
    expect(screen.getByText(flowDetail.name)).toBeTruthy();
  });
});

function renderFlowsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const view = () => (
    <QueryClientProvider client={queryClient}>
      <FlowsPage />
    </QueryClientProvider>
  );
  const rendered = render(view());

  return {
    ...rendered,
    rerender: () => rendered.rerender(view())
  };
}

function mutation(mutate = vi.fn()) {
  return { mutate, isPending: false, error: null, reset: vi.fn() };
}

function validValidation() {
  return {
    graphSchemaVersion: "flow-graph.v2" as const,
    publishable: true,
    activatable: false,
    issues: [],
    activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE" as const],
    normalizedGraph: flowDetail.draftGraph,
    capabilityManifest: {
      schemaVersion: "flow-capability-manifest.v2" as const,
      executionSemanticsVersion: "flow-interpreter.v1" as const,
      triggerMatcher: {
        kind: "manual_client" as const,
        configSchemaVersion: 1 as const,
        matcherContractVersion: 1 as const,
        eventSchemaVersion: 1 as const
      },
      nodeExecutors: [],
      requiredCapabilities: []
    }
  };
}

function publishedFlow(): PublishFlowDefinitionResponse {
  const versionId = "44444444-4444-4444-8444-444444444444";
  const publishedAt = "2026-07-30T14:45:00.000Z";
  const capabilityManifest = validValidation().capabilityManifest!;

  return {
    flow: {
      schemaVersion: "flow-definition.v2",
      id: flow.id,
      ownerUserId: flow.ownerUserId,
      name: flow.name,
      origin: flow.origin!,
      state: "versioned",
      approvalMode: flow.approvalMode,
      revision: 4,
      draftBaseVersionId: null,
      draftGraph: flowDetail.draftGraph,
      draftPresentation: flowDetail.draftPresentation,
      latestPublishedVersionId: versionId,
      latestPublishedVersion: 1,
      createdAt: flow.createdAt,
      updatedAt: publishedAt,
      publishedAt
    },
    version: {
      id: versionId,
      flowId: flow.id,
      version: 1,
      sourceRevision: 4,
      status: "published",
      approvalMode: flow.approvalMode,
      graph: flowDetail.draftGraph,
      presentation: flowDetail.draftPresentation,
      capabilityManifest,
      publishedAt
    }
  };
}

function listFlows(flows: readonly FlowDefinitionSummary[]) {
  mocks.useFlowListQuery.mockReturnValue({
    data: {
      flows,
      total: flows.length,
      runtime: {
        mode: "definition_only",
        executionAvailable: false,
        reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
        historySemantics: "durable_execution"
      }
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn()
  });
}

function openFlow(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Открыть схему: ${name}` }));
}

function versionedFlow(): FlowDefinitionSummary {
  return {
    ...flow,
    state: "versioned",
    revision: 5,
    latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
    latestPublishedVersion: 1,
    publishedAt: "2026-07-30T14:45:00.000Z",
    enrollment: inactiveEnrollment(5)
  };
}

function inactiveEnrollment(definitionRevision: number): FlowDefinitionSummary["enrollment"] {
  return {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId: "11111111-1111-4111-8111-111111111111",
      state: "inactive",
      definitionRevision,
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: null
    }
  };
}
