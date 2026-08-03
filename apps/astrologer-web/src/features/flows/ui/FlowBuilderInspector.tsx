import type { FlowGraphV2, FlowNodeV2 } from "@elevenhouse/contracts";
import { flowNodeKindLabel } from "../model/flowDisplay";

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

  return (
    <div className={classNames?.builderInspectorSection ?? ""} aria-label={copy.settings}>
      <div className={classNames?.builderInspectorHeader ?? ""}>
        <span className={classNames?.builderInspectorIcon ?? ""} aria-hidden="true">
          {nodeInitial[selectedNode.kind]}
        </span>
        <div>
          <p className={classNames?.builderInspectorCategory ?? ""}>
            {flowNodeKindLabel(selectedNode.kind, locale)}
          </p>
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
      <label className={className}>
        <span>{copy.productIds}</span>
        <textarea
          name="flowProductIds"
          value={node.config.productIds.join("\n")}
          disabled={!editable}
          onChange={(event) =>
            onChangeNode({
              ...node,
              config: {
                productIds: event.target.value
                  .split(/\s+/)
                  .map((value) => value.trim())
                  .filter(Boolean)
              }
            })
          }
        />
      </label>
    );
  }
  if (node.kind === "manual_client") {
    return <p className={className}>{copy.manualTrigger}</p>;
  }
  if (node.kind === "birth_data_available") {
    return (
      <label className={className}>
        <span>{copy.purpose}</span>
        <input value={copy.servicePreparation} disabled readOnly />
      </label>
    );
  }
  if (node.kind === "astrologer_work_item") {
    return (
      <>
        <label className={className}>
          <span>{copy.taskTitle}</span>
          <input
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

  const label =
    node.kind === "completed"
      ? copy.goalKey
      : node.kind === "suppressed"
        ? copy.reasonCode
        : copy.errorCode;
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
        pattern="[a-z0-9][a-z0-9_-]*"
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

const nodeInitial = {
  booking_confirmed: "B",
  manual_client: "M",
  birth_data_available: "?",
  astrologer_work_item: "T",
  astrologer_approval: "A",
  completed: "✓",
  suppressed: "S",
  failed: "!"
} satisfies Record<FlowNodeV2["kind"], string>;

const inspectorCopy = {
  ru: {
    selectNode: "Выберите узел на схеме",
    settings: "Настройки узла",
    kind: "Тип",
    contract: "Контракт",
    connections: "Связи",
    title: "Название узла",
    productIds: "Продукты записи",
    manualTrigger: "Ручной запуск получает выбранного астрологом клиента.",
    purpose: "Назначение данных",
    servicePreparation: "Подготовка услуги",
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
    productIds: "Booking products",
    manualTrigger: "A manual start receives a client selected by the astrologer.",
    purpose: "Data purpose",
    servicePreparation: "Service preparation",
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
