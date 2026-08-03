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

type LocalizedText = {
  readonly ru: string;
  readonly en: string;
};

type TemplateDefinition = Omit<FlowDefinitionTemplateDescriptorV2, "name" | "description"> & {
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  readonly create?: (locale: FlowDefinitionTemplateLocale) => {
    readonly graph: FlowGraphV2;
    readonly presentation: FlowPresentationV1;
  };
};

const availableTemplateKey = "manual-consultation-preparation";

const templateDefinitions: readonly TemplateDefinition[] = [
  {
    schemaVersion: "flow-definition-template.v2",
    key: availableTemplateKey,
    version: 1,
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
    create: createManualPreparationTemplate
  },
  legacyTemplate({
    key: "session-prep",
    category: "service_delivery",
    name: { ru: "Подготовка к живой сессии", en: "Live session preparation" },
    description: {
      ru: "Legacy-сценарий требует строгих контрактов данных рождения, карты и уведомлений.",
      en: "This legacy scenario requires strict birth-data, chart and notification contracts."
    },
    requiredCapabilities: ["birth_data", "chart_engine", "messaging"]
  }),
  legacyTemplate({
    key: "async-recorded-reading",
    category: "sales",
    name: { ru: "Разбор в записи", en: "Recorded reading" },
    description: {
      ru: "Legacy-сценарий требует продуктов, расчётов, AI-review и безопасной доставки.",
      en: "This legacy scenario requires products, calculations, AI review and safe delivery."
    },
    requiredCapabilities: ["products", "chart_engine", "ai_drafts", "delivery"]
  }),
  legacyTemplate({
    key: "lead-magnet-upsell",
    category: "sales",
    name: { ru: "Лид-магнит и предложение", en: "Lead magnet and offer" },
    description: {
      ru: "Legacy-сценарий требует messaging, consent, scoring и attribution.",
      en: "This legacy scenario requires messaging, consent, scoring and attribution."
    },
    requiredCapabilities: ["messaging", "consent", "scoring", "attribution"]
  }),
  legacyTemplate({
    key: "sleeping-client-reactivation",
    category: "retention",
    name: { ru: "Реактивация клиента", en: "Client reactivation" },
    description: {
      ru: "Legacy-сценарий требует сегментов, астрокалендаря, consent и messaging.",
      en: "This legacy scenario requires segments, astro calendar, consent and messaging."
    },
    requiredCapabilities: ["segments", "astro_calendar", "consent", "messaging"]
  }),
  legacyTemplate({
    key: "post-session-follow-up",
    category: "retention",
    name: { ru: "Сопровождение после сессии", en: "Post-session follow-up" },
    description: {
      ru: "Legacy-сценарий требует итогов сессии, messaging, consent и attribution.",
      en: "This legacy scenario requires session outcomes, messaging, consent and attribution."
    },
    requiredCapabilities: ["session_outcomes", "messaging", "consent", "attribution"]
  })
];

export function getFlowDefinitionTemplateCatalogV2(
  locale: FlowDefinitionTemplateLocale
): ListFlowDefinitionTemplatesV2Response {
  return listFlowDefinitionTemplatesV2ResponseSchema.parse({
    schemaVersion: "flow-definition-template-catalog.v2",
    catalogVersion: 1,
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

  const parameterPaths = Object.keys(source.parameters).sort();
  if (parameterPaths.length > 0) {
    return rejected(422, {
      code: "FLOW_TEMPLATE_PARAMETERS_INVALID",
      templateKey: template.key,
      parameterPaths
    });
  }

  const draft = template.create(request.locale);
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
        displayTitle: locale === "ru" ? "Подготовка завершена" : "Preparation completed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "consultation_prepared" }
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

function legacyTemplate(input: {
  readonly key: string;
  readonly category: TemplateDefinition["category"];
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  readonly requiredCapabilities: readonly string[];
}): TemplateDefinition {
  return {
    schemaVersion: "flow-definition-template.v2",
    key: input.key,
    version: 1,
    name: input.name,
    description: input.description,
    category: input.category,
    availability: "legacy_read_only",
    recommendedApprovalMode: "manual_approve",
    parameters: [],
    requiredCapabilities: [...input.requiredCapabilities],
    blockerCode: "FLOW_TEMPLATE_LEGACY_GRAPH_ONLY"
  };
}

function rejected(
  statusCode: FlowDefinitionCommandRejectionResponse["statusCode"],
  body: FlowDefinitionCommandRejectionResponse["body"]
): FlowDefinitionCreatePreparation {
  return { kind: "rejected", response: { statusCode, body } };
}
