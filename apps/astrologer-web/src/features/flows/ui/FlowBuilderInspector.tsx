import {
  flowTriggerNodeKindV2Values,
  type FlowGraphV2,
  type FlowNodeV2,
  type FlowTriggerNodeKindV2
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { getFlowNodeVisual } from "./flowsVisualModel";

export type FlowBuilderInspectorProps = {
  readonly graph: FlowGraphV2;
  readonly selectedNode: FlowNodeV2 | null;
  readonly locale: "ru" | "en";
  readonly editable: boolean;
  readonly onChangeNode: (node: FlowNodeV2) => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowBuilderInspector({
  graph,
  selectedNode,
  locale,
  editable,
  onChangeNode,
  classNames
}: FlowBuilderInspectorProps) {
  const copy = inspectorCopy[locale];

  if (!selectedNode) {
    return <div className={classNames?.builderInspectorSection ?? ""}>{copy.selectNode}</div>;
  }

  const incomingCount = graph.edges.filter((edge) => edge.targetNodeId === selectedNode.id).length;
  const outgoingCount = graph.edges.filter((edge) => edge.sourceNodeId === selectedNode.id).length;
  const visual = getFlowNodeVisual(selectedNode.kind, locale);

  return (
    <div className={classNames?.builderInspectorSection ?? ""} aria-label={copy.settings}>
      <div className={classNames?.builderInspectorHeader ?? ""}>
        <span
          className={classNames?.builderInspectorIcon ?? ""}
          data-flow-node-tone={visual.tone}
          aria-hidden="true"
        >
          <Icon iconName={visual.iconName} size={18} />
        </span>
        <div>
          <p className={classNames?.builderInspectorCategory ?? ""}>{visual.label}</p>
          <h2>{selectedNode.displayTitle}</h2>
          <p className={classNames?.builderInspectorId ?? ""}>id: {selectedNode.id}</p>
        </div>
      </div>
      <dl className={classNames?.builderInspectorFacts ?? ""}>
        <div>
          <dt>{copy.kind}</dt>
          <dd>{selectedNode.kind}</dd>
        </div>
        <div>
          <dt>{copy.contract}</dt>
          <dd>
            config v{selectedNode.configSchemaVersion} · executor v
            {selectedNode.executorContractVersion}
          </dd>
        </div>
        <div>
          <dt>{copy.connections}</dt>
          <dd>{formatConnections(incomingCount, outgoingCount, locale)}</dd>
        </div>
      </dl>
      <label className={classNames?.builderField ?? ""}>
        <span>{copy.title}</span>
        <input
          name="flowNodeTitle"
          value={selectedNode.displayTitle}
          disabled={!editable}
          maxLength={180}
          onChange={(event) => onChangeNode({ ...selectedNode, displayTitle: event.target.value })}
        />
      </label>
      <NodeConfigFields
        graph={graph}
        node={selectedNode}
        locale={locale}
        editable={editable}
        onChangeNode={onChangeNode}
        className={classNames?.builderField ?? ""}
      />
    </div>
  );
}

function NodeConfigFields({
  graph,
  node,
  locale,
  editable,
  onChangeNode,
  className
}: {
  readonly graph: FlowGraphV2;
  readonly node: FlowNodeV2;
  readonly locale: "ru" | "en";
  readonly editable: boolean;
  readonly onChangeNode: (node: FlowNodeV2) => void;
  readonly className: string;
}) {
  const copy = inspectorCopy[locale];

  if ((flowTriggerNodeKindV2Values as readonly string[]).includes(node.kind)) {
    return (
      <>
        <StartEventKindField
          className={className}
          copy={copy}
          locale={locale}
          value={node.kind as FlowTriggerNodeKindV2}
          editable={editable}
          onChange={(kind) => onChangeNode(createStartNodeFromKind(node, kind, locale))}
        />
        <StartNodeConfigFields
          node={node}
          locale={locale}
          editable={editable}
          onChangeNode={onChangeNode}
          className={className}
        />
      </>
    );
  }

  return (
    <ExecutableNodeConfigFields
      graph={graph}
      node={node}
      locale={locale}
      editable={editable}
      onChangeNode={onChangeNode}
      className={className}
    />
  );
}

function StartNodeConfigFields({
  node,
  locale,
  editable,
  onChangeNode,
  className
}: {
  readonly node: FlowNodeV2;
  readonly locale: "ru" | "en";
  readonly editable: boolean;
  readonly onChangeNode: (node: FlowNodeV2) => void;
  readonly className: string;
}) {
  const copy = inspectorCopy[locale];

  if (node.kind === "booking_confirmed") {
    return (
      <ProductIdsField
        className={className}
        label={copy.bookingProductIds}
        value={node.config.productIds}
        editable={editable}
        onChange={(productIds) => onChangeNode({ ...node, config: { productIds } })}
      />
    );
  }
  if (node.kind === "manual_client") {
    return <p className={className}>{copy.manualTrigger}</p>;
  }
  if (node.kind === "new_lead" || node.kind === "review_received") {
    return (
      <EnrollmentPolicyField
        className={className}
        copy={copy}
        value={node.config.enrollmentPolicy}
        editable={editable}
        onChange={(enrollmentPolicy) => onChangeNode({ ...node, config: { enrollmentPolicy } })}
      />
    );
  }
  if (node.kind === "free_product_received") {
    return (
      <>
        <ProductIdsField
          className={className}
          label={copy.freeProductIds}
          value={node.config.productIds}
          editable={editable}
          onChange={(productIds) =>
            onChangeNode({ ...node, config: { ...node.config, productIds } })
          }
        />
        <EnrollmentPolicyField
          className={className}
          copy={copy}
          value={node.config.enrollmentPolicy}
          editable={editable}
          onChange={(enrollmentPolicy) =>
            onChangeNode({ ...node, config: { ...node.config, enrollmentPolicy } })
          }
        />
      </>
    );
  }
  if (node.kind === "product_purchased") {
    return (
      <>
        <ProductIdsField
          className={className}
          label={copy.purchasedProductIds}
          value={node.config.productIds}
          editable={editable}
          onChange={(productIds) =>
            onChangeNode({ ...node, config: { ...node.config, productIds } })
          }
        />
        <EnrollmentPolicyField
          className={className}
          copy={copy}
          value={node.config.enrollmentPolicy}
          editable={editable}
          onChange={(enrollmentPolicy) =>
            onChangeNode({ ...node, config: { ...node.config, enrollmentPolicy } })
          }
        />
      </>
    );
  }
  if (node.kind === "first_inbound_message") {
    return (
      <EnrollmentPolicyField
        className={className}
        copy={copy}
        value={node.config.enrollmentPolicy}
        editable={editable}
        onChange={(enrollmentPolicy) => onChangeNode({ ...node, config: { enrollmentPolicy } })}
      />
    );
  }
  if (node.kind === "astro_event") {
    return (
      <>
        <StableIdListField
          className={className}
          label={copy.astroEventCodes}
          value={node.config.eventCodes}
          editable={editable}
          onChange={(eventCodes) =>
            onChangeNode({ ...node, config: { ...node.config, eventCodes } })
          }
        />
        <EnrollmentPolicyField
          className={className}
          copy={copy}
          value={node.config.enrollmentPolicy}
          editable={editable}
          onChange={(enrollmentPolicy) =>
            onChangeNode({ ...node, config: { ...node.config, enrollmentPolicy } })
          }
        />
      </>
    );
  }
  if (node.kind === "client_lifecycle_changed") {
    return (
      <>
        <StatusField
          className={className}
          label={copy.fromStatus}
          value={node.config.fromStatus}
          editable={editable}
          copy={copy}
          onChange={(fromStatus) =>
            onChangeNode({ ...node, config: { ...node.config, fromStatus } })
          }
        />
        <StatusField
          className={className}
          label={copy.toStatus}
          value={node.config.toStatus}
          editable={editable}
          copy={copy}
          onChange={(toStatus) => onChangeNode({ ...node, config: { ...node.config, toStatus } })}
        />
        <EnrollmentPolicyField
          className={className}
          copy={copy}
          value={node.config.enrollmentPolicy}
          editable={editable}
          onChange={(enrollmentPolicy) =>
            onChangeNode({ ...node, config: { ...node.config, enrollmentPolicy } })
          }
        />
      </>
    );
  }
  if (node.kind === "schedule_time") {
    return (
      <>
        <label className={className}>
          <span>{copy.scheduleKey}</span>
          <input
            name="flowScheduleKey"
            value={node.config.scheduleKey}
            disabled={!editable}
            pattern={"[a-z0-9][a-z0-9_\\-]*"}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: { ...node.config, scheduleKey: event.target.value }
              })
            }
          />
        </label>
        <EnrollmentPolicyField
          className={className}
          copy={copy}
          value={node.config.enrollmentPolicy}
          editable={editable}
          onChange={(enrollmentPolicy) =>
            onChangeNode({ ...node, config: { ...node.config, enrollmentPolicy } })
          }
        />
      </>
    );
  }
  if (node.kind === "subscription_event") {
    return (
      <>
        <SubscriptionEventTypesField
          className={className}
          copy={copy}
          value={node.config.eventTypes}
          editable={editable}
          onChange={(eventTypes) =>
            onChangeNode({ ...node, config: { ...node.config, eventTypes } })
          }
        />
        <EnrollmentPolicyField
          className={className}
          copy={copy}
          value={node.config.enrollmentPolicy}
          editable={editable}
          onChange={(enrollmentPolicy) =>
            onChangeNode({ ...node, config: { ...node.config, enrollmentPolicy } })
          }
        />
      </>
    );
  }
  return null;
}

function ExecutableNodeConfigFields({
  graph,
  node,
  locale,
  editable,
  onChangeNode,
  className
}: {
  readonly graph: FlowGraphV2;
  readonly node: FlowNodeV2;
  readonly locale: "ru" | "en";
  readonly editable: boolean;
  readonly onChangeNode: (node: FlowNodeV2) => void;
  readonly className: string;
}) {
  const copy = inspectorCopy[locale];

  if (node.kind === "birth_data_available") {
    return (
      <label className={className}>
        <span>{copy.purpose}</span>
        <input value={copy.servicePreparation} disabled readOnly />
      </label>
    );
  }
  if (node.kind === "natal_chart_request") {
    return (
      <p className={className}>
        {node.config.interpretationMode === "adult_natal"
          ? locale === "ru"
            ? "Натальная карта взрослого"
            : "Adult natal chart"
          : locale === "ru"
            ? "Натальная карта ребёнка"
            : "Child natal chart"}
      </p>
    );
  }
  if (node.kind === "send_message") {
    return (
      <label className={className}>
        <span>{copy.messageTemplate}</span>
        <textarea
          value={node.config.textTemplate}
          disabled={!editable}
          maxLength={4000}
          onChange={(event) =>
            onChangeNode({ ...node, config: { ...node.config, textTemplate: event.target.value } })
          }
        />
      </label>
    );
  }
  if (node.kind === "natal_chart_ai_draft") {
    const chartNodes = graph.nodes.filter(
      (candidate): candidate is Extract<FlowNodeV2, { kind: "natal_chart_request" }> =>
        candidate.kind === "natal_chart_request"
    );
    return (
      <>
        <label className={className}>
          <span>{copy.chartSource}</span>
          <select
            value={node.config.chartRequestNodeId}
            disabled={!editable}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: { ...node.config, chartRequestNodeId: event.target.value }
              })
            }
          >
            {chartNodes.map((chartNode) => (
              <option key={chartNode.id} value={chartNode.id}>
                {chartNode.displayTitle} ({chartNode.id})
              </option>
            ))}
          </select>
        </label>
        <label className={className}>
          <span>{copy.draftLocale}</span>
          <select
            value={node.config.locale}
            disabled={!editable}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: { ...node.config, locale: event.target.value as typeof node.config.locale }
              })
            }
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className={className}>
          <span>{copy.approvalTitle}</span>
          <input
            value={node.config.approvalTitle}
            disabled={!editable}
            maxLength={180}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: { ...node.config, approvalTitle: event.target.value }
              })
            }
          />
        </label>
        <label className={className}>
          <span>{copy.expires}</span>
          <input
            type="number"
            min={1}
            max={525600}
            value={node.config.expiresAfterMinutes ?? ""}
            disabled={!editable}
            onChange={(event) => {
              const expiresAfterMinutes = event.target.value
                ? Number(event.target.value)
                : undefined;
              const configWithoutExpiry = { ...node.config };
              delete configWithoutExpiry.expiresAfterMinutes;
              onChangeNode({
                ...node,
                config:
                  expiresAfterMinutes === undefined
                    ? configWithoutExpiry
                    : { ...node.config, expiresAfterMinutes }
              });
            }}
          />
        </label>
      </>
    );
  }
  if (node.kind === "astrologer_work_item") {
    return (
      <>
        <label className={className}>
          <span>{copy.taskTitle}</span>
          <input
            name="flowTaskTitle"
            value={node.config.taskTitle}
            disabled={!editable}
            maxLength={180}
            onChange={(event) =>
              onChangeNode({ ...node, config: { ...node.config, taskTitle: event.target.value } })
            }
          />
        </label>
        <label className={className}>
          <span>{copy.instructions}</span>
          <textarea
            name="flowTaskInstructions"
            value={node.config.instructions ?? ""}
            disabled={!editable}
            maxLength={4000}
            onChange={(event) => {
              const configWithoutInstructions = { ...node.config };
              delete configWithoutInstructions.instructions;
              onChangeNode({
                ...node,
                config: event.target.value
                  ? { ...node.config, instructions: event.target.value }
                  : configWithoutInstructions
              });
            }}
          />
        </label>
        <label className={className}>
          <span>{copy.priority}</span>
          <select
            name="flowTaskPriority"
            value={node.config.priority}
            disabled={!editable}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: {
                  ...node.config,
                  priority: event.target.value as typeof node.config.priority
                }
              })
            }
          >
            <option value="low">{copy.priorityLow}</option>
            <option value="normal">{copy.priorityNormal}</option>
            <option value="high">{copy.priorityHigh}</option>
            <option value="urgent">{copy.priorityUrgent}</option>
          </select>
        </label>
      </>
    );
  }
  if (node.kind === "astrologer_approval") {
    return (
      <>
        <label className={className}>
          <span>{copy.approvalTitle}</span>
          <input
            value={node.config.approvalTitle}
            disabled={!editable}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: { ...node.config, approvalTitle: event.target.value }
              })
            }
          />
        </label>
        <label className={className}>
          <span>{copy.approvalKind}</span>
          <select
            value={node.config.approvalKind}
            disabled={!editable}
            onChange={(event) =>
              onChangeNode({
                ...node,
                config: {
                  ...node.config,
                  approvalKind: event.target.value as typeof node.config.approvalKind
                }
              })
            }
          >
            <option value="manual_task">{copy.manualTask}</option>
            <option value="ai_output">{copy.aiOutput}</option>
          </select>
        </label>
        <label className={className}>
          <span>{copy.expires}</span>
          <input
            type="number"
            min={1}
            max={525600}
            value={node.config.expiresAfterMinutes ?? ""}
            disabled={!editable}
            onChange={(event) => {
              const parsed = event.target.value ? Number(event.target.value) : undefined;
              const configWithoutExpiry = { ...node.config };
              delete configWithoutExpiry.expiresAfterMinutes;
              onChangeNode({
                ...node,
                config:
                  parsed === undefined
                    ? configWithoutExpiry
                    : { ...node.config, expiresAfterMinutes: parsed }
              });
            }}
          />
        </label>
      </>
    );
  }

  if (node.kind !== "completed" && node.kind !== "suppressed" && node.kind !== "failed") {
    return null;
  }

  const label =
    node.kind === "completed" ? copy.goalKey : node.kind === "suppressed" ? copy.reasonCode : copy.errorCode;
  const value =
    node.kind === "completed"
      ? node.config.goalKey
      : node.kind === "suppressed"
        ? node.config.reasonCode
        : node.config.errorCode;
  return (
    <label className={className}>
      <span>{label}</span>
      <input
        value={value}
        disabled={!editable}
        pattern={"[a-z0-9][a-z0-9_\\-]*"}
        onChange={(event) => {
          const value = event.target.value;
          if (node.kind === "completed") onChangeNode({ ...node, config: { goalKey: value } });
          else if (node.kind === "suppressed")
            onChangeNode({ ...node, config: { reasonCode: value } });
          else onChangeNode({ ...node, config: { errorCode: value } });
        }}
      />
    </label>
  );
}

function ProductIdsField({
  className,
  label,
  value,
  editable,
  onChange
}: {
  readonly className: string;
  readonly label: string;
  readonly value: readonly string[];
  readonly editable: boolean;
  readonly onChange: (productIds: string[]) => void;
}) {
  return (
    <label className={className}>
      <span>{label}</span>
      <textarea
        name="flowProductIds"
        value={value.join("\n")}
        disabled={!editable}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/\s+/)
              .map((entry) => entry.trim())
              .filter(Boolean)
          )
        }
      />
    </label>
  );
}

function StableIdListField({
  className,
  label,
  value,
  editable,
  onChange
}: {
  readonly className: string;
  readonly label: string;
  readonly value: readonly string[];
  readonly editable: boolean;
  readonly onChange: (value: string[]) => void;
}) {
  return (
    <label className={className}>
      <span>{label}</span>
      <textarea
        name="flowStableIds"
        value={value.join("\n")}
        disabled={!editable}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/\s+/)
              .map((entry) => entry.trim())
              .filter(Boolean)
          )
        }
      />
    </label>
  );
}

function EnrollmentPolicyField({
  className,
  copy,
  value,
  editable,
  onChange
}: {
  readonly className: string;
  readonly copy: (typeof inspectorCopy)["ru" | "en"];
  readonly value: "once_per_client" | "each_occurrence" | "after_previous_terminal";
  readonly editable: boolean;
  readonly onChange: (
    value: "once_per_client" | "each_occurrence" | "after_previous_terminal"
  ) => void;
}) {
  return (
    <label className={className}>
      <span>{copy.enrollmentPolicy}</span>
      <select
        name="flowEnrollmentPolicy"
        value={value}
        disabled={!editable}
        onChange={(event) =>
          onChange(
            event.target.value as "once_per_client" | "each_occurrence" | "after_previous_terminal"
          )
        }
      >
        <option value="once_per_client">{copy.enrollmentOncePerClient}</option>
        <option value="each_occurrence">{copy.enrollmentEachOccurrence}</option>
        <option value="after_previous_terminal">{copy.enrollmentAfterPreviousTerminal}</option>
      </select>
    </label>
  );
}

function StartEventKindField({
  className,
  copy,
  locale,
  value,
  editable,
  onChange
}: {
  readonly className: string;
  readonly copy: (typeof inspectorCopy)["ru" | "en"];
  readonly locale: "ru" | "en";
  readonly value: FlowTriggerNodeKindV2;
  readonly editable: boolean;
  readonly onChange: (value: FlowTriggerNodeKindV2) => void;
}) {
  return (
    <label className={className}>
      <span>{copy.startEventKind}</span>
      <select
        name="flowStartEventKind"
        value={value}
        disabled={!editable}
        onChange={(event) => onChange(event.target.value as FlowTriggerNodeKindV2)}
      >
        {flowTriggerNodeKindV2Values.map((kind) => (
          <option key={kind} value={kind}>
            {startEventKindLabels[locale][kind]}
          </option>
        ))}
      </select>
    </label>
  );
}

function createStartNodeFromKind(
  currentNode: FlowNodeV2,
  kind: FlowTriggerNodeKindV2,
  locale: "ru" | "en"
): FlowNodeV2 {
  const base = {
    id: currentNode.id,
    displayTitle: startEventKindLabels[locale][kind],
    configSchemaVersion: 1 as const,
    executorContractVersion: 1 as const
  };
  const enrollmentPolicy = "once_per_client" as const;

  if (kind === "booking_confirmed") return { ...base, kind, config: { productIds: [] } };
  if (kind === "manual_client") return { ...base, kind, config: {} };
  if (kind === "new_lead") return { ...base, kind, config: { enrollmentPolicy } };
  if (kind === "free_product_received") {
    return { ...base, kind, config: { productIds: [], enrollmentPolicy } };
  }
  if (kind === "product_purchased") {
    return { ...base, kind, config: { productIds: [], enrollmentPolicy } };
  }
  if (kind === "first_inbound_message") return { ...base, kind, config: { enrollmentPolicy } };
  if (kind === "astro_event") {
    return { ...base, kind, config: { eventCodes: [], enrollmentPolicy } };
  }
  if (kind === "client_lifecycle_changed") {
    return {
      ...base,
      kind,
      config: { fromStatus: "new", toStatus: "active", enrollmentPolicy }
    };
  }
  if (kind === "schedule_time") {
    return { ...base, kind, config: { scheduleKey: "", enrollmentPolicy } };
  }
  if (kind === "review_received") return { ...base, kind, config: { enrollmentPolicy } };
  return { ...base, kind: "subscription_event", config: { eventTypes: [], enrollmentPolicy } };
}

const subscriptionEventTypes = [
  "started",
  "renewed",
  "cancelled",
  "expired",
  "payment_failed"
] as const;

const startEventKindLabels = {
  ru: {
    booking_confirmed: "Событие записи",
    manual_client: "Ручной запуск",
    new_lead: "Новый лид",
    free_product_received: "Бесплатный продукт",
    product_purchased: "Куплен продукт",
    first_inbound_message: "Первое сообщение",
    astro_event: "Астрособытие",
    client_lifecycle_changed: "Изменение статуса",
    schedule_time: "Дата / расписание",
    review_received: "Получен отзыв",
    subscription_event: "Событие подписки"
  },
  en: {
    booking_confirmed: "Booking event",
    manual_client: "Manual start",
    new_lead: "New lead",
    free_product_received: "Free product",
    product_purchased: "Product purchased",
    first_inbound_message: "First message",
    astro_event: "Astro event",
    client_lifecycle_changed: "Status changed",
    schedule_time: "Date / schedule",
    review_received: "Review received",
    subscription_event: "Subscription event"
  }
} satisfies Record<"ru" | "en", Record<FlowTriggerNodeKindV2, string>>;

function SubscriptionEventTypesField({
  className,
  copy,
  value,
  editable,
  onChange
}: {
  readonly className: string;
  readonly copy: (typeof inspectorCopy)["ru" | "en"];
  readonly value: readonly (typeof subscriptionEventTypes)[number][];
  readonly editable: boolean;
  readonly onChange: (value: (typeof subscriptionEventTypes)[number][]) => void;
}) {
  return (
    <label className={className}>
      <span>{copy.subscriptionEventTypes}</span>
      <select
        name="flowSubscriptionEventTypes"
        multiple
        value={[...value]}
        disabled={!editable}
        onChange={(event) =>
          onChange(
            Array.from(event.currentTarget.selectedOptions).map(
              (option) => option.value as (typeof subscriptionEventTypes)[number]
            )
          )
        }
      >
        {subscriptionEventTypes.map((eventType) => (
          <option key={eventType} value={eventType}>
            {copy.subscriptionEventTypeLabels[eventType]}
          </option>
        ))}
      </select>
    </label>
  );
}

const lifecycleStatuses = [
  "new",
  "active",
  "waiting_for_client",
  "in_service",
  "inactive"
] as const;

function StatusField({
  className,
  label,
  value,
  editable,
  copy,
  onChange
}: {
  readonly className: string;
  readonly label: string;
  readonly value: (typeof lifecycleStatuses)[number] | null;
  readonly editable: boolean;
  readonly copy: (typeof inspectorCopy)["ru" | "en"];
  readonly onChange: (value: (typeof lifecycleStatuses)[number] | null) => void;
}) {
  return (
    <label className={className}>
      <span>{label}</span>
      <select
        name="flowLifecycleStatus"
        value={value ?? ""}
        disabled={!editable}
        onChange={(event) =>
          onChange(
            event.target.value ? (event.target.value as (typeof lifecycleStatuses)[number]) : null
          )
        }
      >
        <option value="">{copy.anyStatus}</option>
        {lifecycleStatuses.map((status) => (
          <option key={status} value={status}>
            {copy.lifecycleStatusLabels[status]}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatConnections(incoming: number, outgoing: number, locale: "ru" | "en"): string {
  if (locale === "en") return `${incoming} input · ${outgoing} output`;
  return `${incoming} ${pluralRu(incoming, "вход", "входа", "входов")} · ${outgoing} ${pluralRu(
    outgoing,
    "выход",
    "выхода",
    "выходов"
  )}`;
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const inspectorCopy = {
  ru: {
    selectNode: "Выберите узел на схеме",
    settings: "Настройки узла",
    kind: "Тип",
    contract: "Контракт",
    connections: "Связи",
    title: "Название узла",
    bookingProductIds: "Продукты записи",
    freeProductIds: "Бесплатные продукты",
    purchasedProductIds: "Купленные продукты",
    astroEventCodes: "Коды астрособытий",
    scheduleKey: "Ключ расписания",
    subscriptionEventTypes: "События подписки",
    startEventKind: "Событие запуска",
    subscriptionEventTypeLabels: {
      started: "Началась",
      renewed: "Продлилась",
      cancelled: "Отменилась",
      expired: "Истекла",
      payment_failed: "Ошибка оплаты"
    },
    enrollmentPolicy: "Сколько раз запускать",
    enrollmentOncePerClient: "Один раз на клиента",
    enrollmentEachOccurrence: "Каждый раз по событию",
    enrollmentAfterPreviousTerminal: "После завершения предыдущего запуска",
    fromStatus: "Статус был",
    toStatus: "Статус стал",
    anyStatus: "Любой",
    lifecycleStatusLabels: {
      new: "Новый",
      active: "Активный",
      waiting_for_client: "Ждём клиента",
      in_service: "В услуге",
      inactive: "Неактивный"
    },
    manualTrigger: "Ручной запуск получает выбранного астрологом клиента.",
    purpose: "Назначение данных",
    servicePreparation: "Подготовка услуги",
    chartSource: "Источник натальной карты",
    draftLocale: "Язык черновика",
    messageTemplate: "Текст сообщения",
    taskTitle: "Название задачи",
    instructions: "Инструкции",
    priority: "Приоритет",
    priorityLow: "Низкий",
    priorityNormal: "Обычный",
    priorityHigh: "Высокий",
    priorityUrgent: "Срочный",
    approvalTitle: "Название решения",
    approvalKind: "Тип решения",
    manualTask: "Ручная проверка",
    aiOutput: "Проверка AI-результата",
    expires: "Срок решения, минут",
    goalKey: "Ключ результата",
    reasonCode: "Код причины",
    errorCode: "Код ошибки"
  },
  en: {
    selectNode: "Select a node on the graph",
    settings: "Node settings",
    kind: "Kind",
    contract: "Contract",
    connections: "Connections",
    title: "Node title",
    bookingProductIds: "Booking products",
    freeProductIds: "Free products",
    purchasedProductIds: "Purchased products",
    astroEventCodes: "Astro event codes",
    scheduleKey: "Schedule key",
    subscriptionEventTypes: "Subscription events",
    startEventKind: "Start event",
    subscriptionEventTypeLabels: {
      started: "Started",
      renewed: "Renewed",
      cancelled: "Cancelled",
      expired: "Expired",
      payment_failed: "Payment failed"
    },
    enrollmentPolicy: "How often to start",
    enrollmentOncePerClient: "Once per client",
    enrollmentEachOccurrence: "Every event occurrence",
    enrollmentAfterPreviousTerminal: "After the previous run finishes",
    fromStatus: "Previous status",
    toStatus: "New status",
    anyStatus: "Any",
    lifecycleStatusLabels: {
      new: "New",
      active: "Active",
      waiting_for_client: "Waiting for client",
      in_service: "In service",
      inactive: "Inactive"
    },
    manualTrigger: "A manual start receives a client selected by the astrologer.",
    purpose: "Data purpose",
    servicePreparation: "Service preparation",
    chartSource: "Natal chart source",
    draftLocale: "Draft language",
    messageTemplate: "Message text",
    taskTitle: "Task title",
    instructions: "Instructions",
    priority: "Priority",
    priorityLow: "Low",
    priorityNormal: "Normal",
    priorityHigh: "High",
    priorityUrgent: "Urgent",
    approvalTitle: "Approval title",
    approvalKind: "Approval kind",
    manualTask: "Manual review",
    aiOutput: "AI output review",
    expires: "Decision deadline, minutes",
    goalKey: "Goal key",
    reasonCode: "Reason code",
    errorCode: "Error code"
  }
} as const;
