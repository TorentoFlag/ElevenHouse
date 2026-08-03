// @vitest-environment jsdom

import type {
  FlowDefinitionDetailV2,
  FlowDefinitionSummaryV2,
  FlowDefinitionTemplateDescriptorV2,
  FlowRuntimeAvailability
} from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowsPage } from "./FlowsPage";

const mocks = vi.hoisted(() => ({
  locale: "ru" as "ru" | "en",
  useDocumentTitle: vi.fn(),
  useFlowListQuery: vi.fn(),
  useFlowTemplatesQuery: vi.fn(),
  useFlowDefinitionQuery: vi.fn(),
  useActivateFlowMutation: vi.fn(),
  useCreateFlowMutation: vi.fn(),
  useCreateNextFlowDraftMutation: vi.fn(),
  useMigrateFlowDefinitionMutation: vi.fn(),
  usePauseFlowMutation: vi.fn(),
  useUpdateFlowDraftMutation: vi.fn(),
  usePublishFlowMutation: vi.fn(),
  useValidateFlowDefinitionMutation: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: () => ({ locale: mocks.locale })
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
vi.mock("../../features/flows/model/useFlowDefinitionQuery", () => ({
  useFlowDefinitionQuery: mocks.useFlowDefinitionQuery
}));
vi.mock("../../features/flows/model/useActivateFlowMutation", () => ({
  useActivateFlowMutation: mocks.useActivateFlowMutation
}));
vi.mock("../../features/flows/model/useCreateFlowMutation", () => ({
  useCreateFlowMutation: mocks.useCreateFlowMutation
}));
vi.mock("../../features/flows/model/useCreateNextFlowDraftMutation", () => ({
  useCreateNextFlowDraftMutation: mocks.useCreateNextFlowDraftMutation
}));
vi.mock("../../features/flows/model/useMigrateFlowDefinitionMutation", () => ({
  useMigrateFlowDefinitionMutation: mocks.useMigrateFlowDefinitionMutation
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
vi.mock("../../features/flows/model/useValidateFlowDefinitionMutation", () => ({
  useValidateFlowDefinitionMutation: mocks.useValidateFlowDefinitionMutation
}));

const definitionOnlyRuntime: FlowRuntimeAvailability = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
};

const flow: FlowDefinitionSummaryV2 = {
  schemaVersion: "flow-definition-summary.v2",
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Запись на консультацию",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 3,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  migrationRequired: false
};

const flowDetail: Extract<FlowDefinitionDetailV2, { graphSchemaVersion: "flow-graph.v2" }> = {
  ...flow,
  schemaVersion: "flow-definition-detail.v2",
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
  version: 1,
  name: "Подготовка консультации вручную",
  description: "Создать внутреннюю задачу подготовки и завершить ее вручную.",
  category: "service_delivery",
  availability: "available",
  recommendedApprovalMode: "manual_approve",
  parameters: [],
  requiredCapabilities: [],
  blockerCode: null
};

const detailResponses = new Map<string, FlowDefinitionDetailV2>();

describe("FlowsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detailResponses.clear();
    detailResponses.set(flow.id, flowDetail);
    mocks.locale = "ru";
    window.history.replaceState(null, "", "/flows");
    mocks.useFlowListQuery.mockReturnValue({
      data: {
        schemaVersion: "flow-definition-list.v2",
        flows: [flow],
        total: 1,
        runtime: definitionOnlyRuntime
      },
      isLoading: false,
      isError: false,
      error: null
    });
    mocks.useFlowTemplatesQuery.mockReturnValue({
      data: {
        schemaVersion: "flow-definition-template-catalog.v2",
        catalogVersion: 1,
        locale: "ru",
        templates: [availableTemplate]
      },
      isLoading: false,
      isError: false,
      error: null
    });
    mocks.useFlowDefinitionQuery.mockImplementation((flowId: string | null) => ({
      data: flowId ? detailResponses.get(flowId) : undefined,
      isLoading: false,
      error: null
    }));
    mocks.useCreateFlowMutation.mockReturnValue(mutation());
    mocks.useCreateNextFlowDraftMutation.mockReturnValue(mutation());
    mocks.useMigrateFlowDefinitionMutation.mockReturnValue(mutation());
    mocks.useActivateFlowMutation.mockReturnValue(mutation());
    mocks.usePauseFlowMutation.mockReturnValue(mutation());
    mocks.useUpdateFlowDraftMutation.mockReturnValue(mutation());
    mocks.usePublishFlowMutation.mockReturnValue(mutation());
    mocks.useValidateFlowDefinitionMutation.mockReturnValue(
      mutation(vi.fn((_input, options) => options?.onSuccess(validValidation())))
    );
  });

  afterEach(() => cleanup());

  it("loads the V2 list and localized template catalog", () => {
    render(<FlowsPage />);

    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("Воронки");
    expect(mocks.useFlowListQuery).toHaveBeenCalledWith({
      state: "all",
      runtimeStatus: "all",
      limit: 50,
      offset: 0
    });
    expect(mocks.useFlowTemplatesQuery).toHaveBeenCalledWith("ru");
    expect(screen.getAllByText(flow.name)).toHaveLength(2);
  });

  it("creates a server-backed template definition and opens its returned detail", () => {
    const createdDetail: FlowDefinitionDetailV2 = {
      ...flowDetail,
      id: "33333333-3333-4333-8333-333333333333",
      name: availableTemplate.name
    };
    detailResponses.set(createdDetail.id, createdDetail);
    const mutate = vi.fn((_input, options) => options?.onSuccess(createdDetail));
    mocks.useCreateFlowMutation.mockReturnValue(mutation(mutate));
    render(<FlowsPage />);

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
            templateVersion: 1,
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
    render(<FlowsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Новая воронка" })[0]!);
    const templateButton = screen.getByRole("button", {
      name: new RegExp(availableTemplate.name)
    });
    fireEvent.click(templateButton);
    fireEvent.click(screen.getByRole("button", { name: "Начать с пустого сценария" }));
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
    mocks.useUpdateFlowDraftMutation.mockReturnValue(mutation(updateDraft));
    mocks.usePublishFlowMutation.mockReturnValue(mutation(publish));
    render(<FlowsPage />);

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
  });

  it("creates the next draft from the exact published version", () => {
    const versioned = versionedFlow();
    const detail: Extract<FlowDefinitionDetailV2, { graphSchemaVersion: "flow-graph.v2" }> = {
      ...flowDetail,
      state: versioned.state,
      runtimeStatus: versioned.runtimeStatus,
      revision: versioned.revision,
      latestPublishedVersionId: versioned.latestPublishedVersionId,
      latestPublishedVersion: versioned.latestPublishedVersion,
      publishedAt: versioned.publishedAt
    };
    detailResponses.set(flow.id, detail);
    listFlows([versioned]);
    const mutate = vi.fn();
    mocks.useCreateNextFlowDraftMutation.mockReturnValue(mutation(mutate));
    render(<FlowsPage />);

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
    render(<FlowsPage />);

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

  it("migrates a legacy definition explicitly with optimistic revision", () => {
    const legacy = legacyFlow();
    detailResponses.set(legacy.id, legacy);
    listFlows([legacySummary(legacy)]);
    const mutate = vi.fn();
    mocks.useMigrateFlowDefinitionMutation.mockReturnValue(mutation(mutate));
    render(<FlowsPage />);

    openFlow(legacy.name);
    fireEvent.click(screen.getByRole("button", { name: "Мигрировать в V2" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        flowId: legacy.id,
        body: {
          schemaVersion: "flow-definition-migrate.v2",
          expectedRevision: legacy.revision,
          targetGraphSchemaVersion: "flow-graph.v2"
        },
        idempotencyKey: expect.stringMatching(/^flows:migrate:/)
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("downloads the exact legacy server detail as JSON", () => {
    const legacy = legacyFlow();
    detailResponses.set(legacy.id, legacy);
    listFlows([legacySummary(legacy)]);
    const createObjectURL = vi.fn(() => "blob:legacy-flow");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    try {
      render(<FlowsPage />);
      openFlow(legacy.name);
      fireEvent.click(screen.getByRole("button", { name: "Скачать JSON" }));

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(click.mock.instances[0]).toMatchObject({
        href: "blob:legacy-flow",
        download: `flow-${legacy.id}-legacy-v1.json`
      });
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:legacy-flow");
    } finally {
      click.mockRestore();
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectURL
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectURL
      });
    }
  });

  it("blocks activation from definition-only evidence but permits pausing persisted active state", () => {
    const versioned = versionedFlow();
    const active: FlowDefinitionSummaryV2 = {
      ...versioned,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Активная воронка",
      runtimeStatus: "active"
    };
    listFlows([versioned, active]);
    const activate = vi.fn();
    const pause = vi.fn();
    mocks.useActivateFlowMutation.mockReturnValue(mutation(activate));
    mocks.usePauseFlowMutation.mockReturnValue(mutation(pause));
    render(<FlowsPage />);

    const unavailable = screen.getAllByRole("switch", {
      name: "Исполнение этой версии воронки недоступно"
    });
    unavailable.forEach((control) => fireEvent.click(control));
    expect(activate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getAllByRole("switch", {
        name: "Исполнение отключено; сохраненную активацию можно поставить на паузу"
      })[0]!
    );
    expect(pause).toHaveBeenCalledWith(active.id);
  });

  it("opens an AstroCalendar recommendation without inventing unsupported graph context", () => {
    const unavailableTemplate: FlowDefinitionTemplateDescriptorV2 = {
      ...availableTemplate,
      key: "sleeping-client-reactivation",
      name: "Реактивация клиента",
      availability: "legacy_read_only",
      requiredCapabilities: ["segments", "astro_calendar", "consent", "messaging"],
      blockerCode: "FLOW_TEMPLATE_LEGACY_GRAPH_ONLY"
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
    render(<FlowsPage />);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/запрошенный интеграцией, пока нельзя создать/)).toBeTruthy();
    const templateButton = screen.getByRole("button", { name: /Реактивация клиента/ });
    expect(templateButton).toHaveProperty("disabled", true);
    fireEvent.click(templateButton);
    expect(create).not.toHaveBeenCalled();
  });
});

function mutation(mutate = vi.fn()) {
  return { mutate, isPending: false, error: null, reset: vi.fn() };
}

function validValidation() {
  return {
    schemaVersion: "flow-definition-validation.v1" as const,
    graphSchemaVersion: "flow-graph.v2" as const,
    publishable: true,
    activatable: false,
    issues: [],
    activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE" as const],
    normalizedGraph: flowDetail.draftGraph,
    capabilityManifest: {
      schemaVersion: "flow-capability-manifest.v1" as const,
      executionSemanticsVersion: "flow-interpreter.v1" as const,
      nodeExecutors: [
        {
          kind: "manual_client" as const,
          configSchemaVersion: 1 as const,
          executorContractVersion: 1 as const
        }
      ],
      requiredCapabilities: []
    }
  };
}

function listFlows(flows: readonly FlowDefinitionSummaryV2[]) {
  mocks.useFlowListQuery.mockReturnValue({
    data: {
      schemaVersion: "flow-definition-list.v2",
      flows,
      total: flows.length,
      runtime: definitionOnlyRuntime
    },
    isLoading: false,
    isError: false,
    error: null
  });
}

function openFlow(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Открыть схему: ${name}` }));
}

function versionedFlow(): FlowDefinitionSummaryV2 {
  return {
    ...flow,
    state: "versioned",
    runtimeStatus: "published",
    revision: 5,
    latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
    latestPublishedVersion: 1,
    publishedAt: "2026-07-30T14:45:00.000Z"
  };
}

function legacyFlow(): Extract<FlowDefinitionDetailV2, { graphSchemaVersion: "flow-graph.v1" }> {
  return {
    schemaVersion: "flow-definition-detail.v2",
    id: flow.id,
    ownerUserId: flow.ownerUserId,
    name: "Legacy-входящие",
    state: "draft",
    runtimeStatus: "draft",
    approvalMode: "manual_approve",
    revision: 6,
    draftBaseVersionId: null,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    publishedAt: null,
    graphSchemaVersion: "flow-graph.v1",
    origin: null,
    migrationRequired: true,
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
    draftPresentation: null
  };
}

function legacySummary(
  detail: Extract<FlowDefinitionDetailV2, { graphSchemaVersion: "flow-graph.v1" }>
): FlowDefinitionSummaryV2 {
  return {
    schemaVersion: "flow-definition-summary.v2",
    id: detail.id,
    ownerUserId: detail.ownerUserId,
    name: detail.name,
    state: detail.state,
    runtimeStatus: detail.runtimeStatus,
    approvalMode: detail.approvalMode,
    revision: detail.revision,
    draftBaseVersionId: detail.draftBaseVersionId,
    latestPublishedVersionId: detail.latestPublishedVersionId,
    latestPublishedVersion: detail.latestPublishedVersion,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    publishedAt: detail.publishedAt,
    graphSchemaVersion: "flow-graph.v1",
    origin: null,
    migrationRequired: true
  };
}
