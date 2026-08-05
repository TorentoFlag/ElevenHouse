import {
  flowGraphV2Schema,
  flowPresentationV1Schema,
  listFlowDefinitionTemplatesV2ResponseSchema,
  type CreateFlowDefinitionV2Request,
  type FlowApprovalMode,
  type FlowDefinitionCommandRejectionResponse,
  type FlowDefinitionOriginV1,
  type FlowDefinitionTemplateDescriptorV2,
  type FlowGraphV2,
  type FlowPresentationV1,
  type ListFlowDefinitionTemplatesV2Query,
  type ListFlowDefinitionTemplatesV2Response
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";

export type FlowDefinitionPreparedCreate = {
  readonly name: string;
  readonly origin: FlowDefinitionOriginV1;
  readonly approvalMode: FlowApprovalMode;
  readonly graph: FlowGraphV2;
  readonly presentation: FlowPresentationV1 | null;
};

export type FlowDefinitionCreatePreparation =
  | { readonly kind: "accepted"; readonly value: FlowDefinitionPreparedCreate }
  | {
      readonly kind: "rejected";
      readonly response: FlowDefinitionCommandRejectionResponse;
    };

type FlowDefinitionTemplateLocale = ListFlowDefinitionTemplatesV2Query["locale"];
type FlowDefinitionTemplateParameters = Extract<
  CreateFlowDefinitionV2Request["source"],
  { readonly type: "template" }
>["parameters"];

type LocalizedText = {
  readonly ru: string;
  readonly en: string;
};

type TemplateDefinition = Omit<FlowDefinitionTemplateDescriptorV2, "name" | "description"> & {
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  readonly create?: (input: {
    readonly locale: FlowDefinitionTemplateLocale;
    readonly parameters: FlowDefinitionTemplateParameters;
  }) => {
    readonly graph: FlowGraphV2;
    readonly presentation: FlowPresentationV1;
  };
};

const availableTemplateKey = "manual-consultation-preparation";
const templateProductIdSchema = z.string().uuid();

const templateDefinitions: readonly TemplateDefinition[] = [
  {
    schemaVersion: "flow-definition-template.v2",
    key: availableTemplateKey,
    version: 2,
    name: {
      ru: "Подготовка консультации вручную",
      en: "Manual consultation preparation"
    },
    description: {
      ru: "Создать внутреннюю задачу подготовки и завершить её вручную.",
      en: "Create an internal preparation task and complete it manually."
    },
    category: "service_delivery",
    availability: "available",
    recommendedApprovalMode: "manual_approve",
    parameters: [],
    requiredCapabilities: [],
    blockerCode: null,
    create: ({ locale }) => createManualPreparationTemplate(locale)
  },
  {
    schemaVersion: "flow-definition-template.v2",
    key: "booking-natal-preparation",
    version: 1,
    name: {
      ru: "Подготовка натальной консультации",
      en: "Natal consultation preparation"
    },
    description: {
      ru: "После подтверждённой записи собирает данные рождения и ставит расчёт натальной карты.",
      en: "After a confirmed booking, collects birth data and requests a natal chart calculation."
    },
    category: "service_delivery",
    availability: "available",
    recommendedApprovalMode: "manual_approve",
    parameters: [
      {
        key: "product_ids",
        kind: "product_ids",
        required: true,
        minimumItems: 1,
        maximumItems: 100
      }
    ],
    requiredCapabilities: [
      "bookings.events.booking_confirmed",
      "charts.calculate.natal.booking_context",
      "clients.birth_data.read.service_preparation",
      "products.read"
    ],
    blockerCode: null,
    create: ({ locale, parameters }) =>
      createBookingNatalPreparationTemplate(locale, requireProductIds(parameters))
  }
];

export function getFlowDefinitionTemplateCatalogV2(
  locale: FlowDefinitionTemplateLocale
): ListFlowDefinitionTemplatesV2Response {
  return listFlowDefinitionTemplatesV2ResponseSchema.parse({
    schemaVersion: "flow-definition-template-catalog.v2",
    catalogVersion: 3,
    locale,
    templates: templateDefinitions.map((template) => ({
      schemaVersion: template.schemaVersion,
      key: template.key,
      version: template.version,
      name: template.name[locale],
      description: template.description[locale],
      category: template.category,
      availability: template.availability,
      recommendedApprovalMode: template.recommendedApprovalMode,
      parameters: template.parameters,
      requiredCapabilities: template.requiredCapabilities,
      blockerCode: template.blockerCode
    }))
  });
}

export function prepareFlowDefinitionV2Creation(
  request: CreateFlowDefinitionV2Request
): FlowDefinitionCreatePreparation {
  if (request.source.type === "blank") {
    const draft = createBlankDraft(request.locale);
    return {
      kind: "accepted",
      value: {
        name: request.name,
        origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
        approvalMode: request.approvalMode,
        ...draft
      }
    };
  }

  const source = request.source;
  const template = templateDefinitions.find((candidate) => candidate.key === source.templateKey);
  if (!template) {
    return rejected(404, {
      code: "FLOW_TEMPLATE_NOT_FOUND",
      templateKey: source.templateKey
    });
  }
  if (source.templateVersion !== template.version) {
    return rejected(409, {
      code: "FLOW_TEMPLATE_VERSION_CONFLICT",
      templateKey: template.key,
      requestedVersion: source.templateVersion,
      currentVersion: template.version
    });
  }
  if (template.availability !== "available" || !template.create) {
    if (!template.blockerCode) throw new TypeError("Unavailable flow template requires a blocker");
    return rejected(409, {
      code: "FLOW_TEMPLATE_NOT_AVAILABLE",
      templateKey: template.key,
      reasonCode: template.blockerCode
    });
  }

  const parameterPaths = invalidTemplateParameterPaths(template, source.parameters);
  if (parameterPaths.length > 0) {
    return rejected(422, {
      code: "FLOW_TEMPLATE_PARAMETERS_INVALID",
      templateKey: template.key,
      parameterPaths: [...parameterPaths]
    });
  }

  const draft = template.create({ locale: request.locale, parameters: source.parameters });
  return {
    kind: "accepted",
    value: {
      name: request.name,
      origin: {
        schemaVersion: "flow-definition-origin.v1",
        type: "template",
        templateKey: template.key,
        templateVersion: template.version
      },
      approvalMode: request.approvalMode,
      ...draft
    }
  };
}

function createBlankDraft(locale: FlowDefinitionTemplateLocale): {
  readonly graph: FlowGraphV2;
  readonly presentation: FlowPresentationV1;
} {
  const nodeId = "manual-client";
  return {
    graph: flowGraphV2Schema.parse({
      schemaVersion: "flow-graph.v2",
      nodes: [
        {
          id: nodeId,
          kind: "manual_client",
          displayTitle: locale === "ru" ? "Клиент выбран вручную" : "Client selected manually",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: {}
        }
      ],
      edges: []
    }),
    presentation: flowPresentationV1Schema.parse({
      schemaVersion: "flow-presentation.v1",
      nodes: [{ nodeId, position: { x: 80, y: 120 } }],
      viewport: { x: 0, y: 0, zoom: 1 }
    })
  };
}

function createManualPreparationTemplate(locale: FlowDefinitionTemplateLocale): {
  readonly graph: FlowGraphV2;
  readonly presentation: FlowPresentationV1;
} {
  const graph = flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual-client",
        kind: "manual_client",
        displayTitle: locale === "ru" ? "Клиент выбран вручную" : "Client selected manually",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "preparation-work-item",
        kind: "astrologer_work_item",
        displayTitle: locale === "ru" ? "Подготовить консультацию" : "Prepare consultation",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          taskKind: "consultation_preparation",
          taskTitle: locale === "ru" ? "Подготовить консультацию" : "Prepare consultation",
          priority: "normal"
        }
      },
      {
        id: "preparation-completed",
        kind: "completed",
        displayTitle:
          locale === "ru" ? "Задача подготовки выполнена" : "Preparation task completed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "manual_preparation_task_completed" }
      }
    ],
    edges: [
      {
        id: "manual-to-work-item",
        sourceNodeId: "manual-client",
        targetNodeId: "preparation-work-item",
        sourceHandle: "next"
      },
      {
        id: "work-item-to-completed",
        sourceNodeId: "preparation-work-item",
        targetNodeId: "preparation-completed",
        sourceHandle: "success"
      }
    ]
  });
  return {
    graph,
    presentation: flowPresentationV1Schema.parse({
      schemaVersion: "flow-presentation.v1",
      nodes: [
        { nodeId: "manual-client", position: { x: 80, y: 120 } },
        { nodeId: "preparation-work-item", position: { x: 400, y: 120 } },
        { nodeId: "preparation-completed", position: { x: 720, y: 120 } }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    })
  };
}

function createBookingNatalPreparationTemplate(
  locale: FlowDefinitionTemplateLocale,
  productIds: readonly string[]
): { readonly graph: FlowGraphV2; readonly presentation: FlowPresentationV1 } {
  const graph = flowGraphV2Schema.parse({
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "booking-confirmed",
        kind: "booking_confirmed",
        displayTitle: locale === "ru" ? "Запись подтверждена" : "Booking confirmed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: [...productIds] }
      },
      {
        id: "birth-data-ready",
        kind: "birth_data_available",
        displayTitle: locale === "ru" ? "Данные рождения готовы" : "Birth data ready",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { purpose: "service_preparation" }
      },
      {
        id: "birth-data-request",
        kind: "astrologer_work_item",
        displayTitle: locale === "ru" ? "Запросить данные рождения" : "Request birth data",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          taskKind: "birth_data_collection",
          taskTitle: locale === "ru" ? "Запросить данные рождения" : "Request birth data",
          instructions:
            locale === "ru"
              ? "Получите данные от клиента и внесите их в единый профиль клиента."
              : "Collect the data from the client and enter it in the client's single birth profile.",
          priority: "high",
          completionRequirements: { resultSummary: "optional" }
        }
      },
      {
        id: "natal-chart-request",
        kind: "natal_chart_request",
        displayTitle: locale === "ru" ? "Рассчитать натальную карту" : "Calculate natal chart",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {
          interpretationMode: "adult_natal",
          settings: {
            zodiac: "tropical",
            houseSystem: "placidus",
            nodeType: "true",
            aspectPreset: "major",
            orbMultiplier: 1
          }
        }
      },
      {
        id: "natal-preparation-completed",
        kind: "completed",
        displayTitle: locale === "ru" ? "Карта поставлена в расчёт" : "Chart calculation requested",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "natal_chart_calculation_requested" }
      }
    ],
    edges: [
      {
        id: "booking-to-birth-data",
        sourceNodeId: "booking-confirmed",
        targetNodeId: "birth-data-ready",
        sourceHandle: "next"
      },
      {
        id: "birth-data-ready-to-chart",
        sourceNodeId: "birth-data-ready",
        targetNodeId: "natal-chart-request",
        sourceHandle: "true"
      },
      {
        id: "birth-data-missing-to-request",
        sourceNodeId: "birth-data-ready",
        targetNodeId: "birth-data-request",
        sourceHandle: "false"
      },
      {
        id: "birth-data-request-to-recheck",
        sourceNodeId: "birth-data-request",
        targetNodeId: "birth-data-ready",
        sourceHandle: "success"
      },
      {
        id: "chart-request-to-completed",
        sourceNodeId: "natal-chart-request",
        targetNodeId: "natal-preparation-completed",
        sourceHandle: "next"
      }
    ]
  });
  return {
    graph,
    presentation: flowPresentationV1Schema.parse({
      schemaVersion: "flow-presentation.v1",
      nodes: [
        { nodeId: "booking-confirmed", position: { x: 80, y: 220 } },
        { nodeId: "birth-data-ready", position: { x: 360, y: 220 } },
        { nodeId: "birth-data-request", position: { x: 640, y: 390 } },
        { nodeId: "natal-chart-request", position: { x: 640, y: 120 } },
        { nodeId: "natal-preparation-completed", position: { x: 920, y: 120 } }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    })
  };
}

function invalidTemplateParameterPaths(
  template: TemplateDefinition,
  parameters: Record<string, string | number | boolean | string[]>
): readonly string[] {
  const expected = new Map(template.parameters.map((parameter) => [parameter.key, parameter]));
  const paths = new Set<string>();
  for (const key of Object.keys(parameters)) {
    if (!expected.has(key)) paths.add(key);
  }
  for (const parameter of template.parameters) {
    const value = parameters[parameter.key];
    if (value === undefined) {
      if (parameter.required) paths.add(parameter.key);
      continue;
    }
    if (
      parameter.kind !== "product_ids" ||
      !Array.isArray(value) ||
      value.length < parameter.minimumItems ||
      value.length > parameter.maximumItems ||
      new Set(value).size !== value.length ||
      value.some((productId) => !isUuid(productId))
    ) {
      paths.add(parameter.key);
    }
  }
  return [...paths].sort();
}

function requireProductIds(parameters: Record<string, string | number | boolean | string[]>): readonly string[] {
  const productIds = parameters.product_ids;
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.some((id) => !isUuid(id))) {
    throw new TypeError("Flow natal template requires validated product ids");
  }
  return [...productIds].sort();
}

function isUuid(value: string): boolean {
  return templateProductIdSchema.safeParse(value).success;
}

function rejected(
  statusCode: FlowDefinitionCommandRejectionResponse["statusCode"],
  body: FlowDefinitionCommandRejectionResponse["body"]
): FlowDefinitionCreatePreparation {
  return { kind: "rejected", response: { statusCode, body } };
}
