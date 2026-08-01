import { useEffect, useState } from "react";
import type { FlowGraph } from "@elevenhouse/contracts";

export type FlowBuilderInspectorProps = {
  readonly graph: FlowGraph;
  readonly selectedNode: FlowGraph["nodes"][number] | null;
  readonly onTitleChange: (nodeId: string, title: string) => void;
  readonly onCommitTitle: (nodeId: string, title: string) => void;
  readonly onUpdateConfig: (nodeId: string, config: Record<string, unknown>) => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowBuilderInspector({
  graph,
  selectedNode,
  onTitleChange,
  onCommitTitle,
  onUpdateConfig,
  classNames
}: FlowBuilderInspectorProps) {
  const [title, setTitle] = useState(selectedNode?.title ?? "");
  const [configText, setConfigText] = useState(selectedNode ? JSON.stringify(selectedNode.config, null, 2) : "{}");
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(selectedNode?.title ?? "");
    setConfigText(selectedNode ? JSON.stringify(selectedNode.config, null, 2) : "{}");
    setConfigError(null);
  }, [selectedNode?.id, selectedNode?.title, selectedNode?.config]);

  if (!selectedNode) {
    return <div className={classNames?.builderInspectorSection ?? ""}>Выберите узел на схеме</div>;
  }

  const titleInputId = `flow-node-${selectedNode.id}-title`;
  const configInputId = `flow-node-${selectedNode.id}-config`;
  const incomingCount = graph.edges.filter((edge) => edge.toNodeId === selectedNode.id).length;
  const outgoingCount = graph.edges.filter((edge) => edge.fromNodeId === selectedNode.id).length;
  const approvalMode = "approvalMode" in selectedNode ? selectedNode.approvalMode : null;

  return (
    <div className={classNames?.builderInspectorSection ?? ""} aria-label="Настройки узла">
      <div className={classNames?.builderInspectorHeader ?? ""}>
        <span className={classNames?.builderInspectorIcon ?? ""} aria-hidden="true">
          {categoryInitial[selectedNode.category]}
        </span>
        <div>
          <p className={classNames?.builderInspectorCategory ?? ""}>
            {flowNodeCategoryLabelRu[selectedNode.category]}
          </p>
          <h2>{selectedNode.title}</h2>
          <p className={classNames?.builderInspectorId ?? ""}>id: {selectedNode.id}</p>
        </div>
      </div>
      <dl className={classNames?.builderInspectorFacts ?? ""}>
        <div>
          <dt>Тип</dt>
          <dd>{selectedNode.kind}</dd>
        </div>
        {approvalMode ? (
          <div>
            <dt>Режим</dt>
            <dd>{flowApprovalModeLabelRu[approvalMode] ?? approvalMode}</dd>
          </div>
        ) : null}
        <div>
          <dt>Связи</dt>
          <dd>
            {formatConnectionCount(incomingCount, "вход", "входа", "входов")} ·{" "}
            {formatConnectionCount(outgoingCount, "выход", "выхода", "выходов")}
          </dd>
        </div>
      </dl>
      <label className={classNames?.builderField ?? ""}>
        <span>Название узла</span>
        <input
          id={titleInputId}
          name="flowNodeTitle"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            onTitleChange(selectedNode.id, event.target.value);
          }}
          onBlur={() => onCommitTitle(selectedNode.id, title)}
        />
      </label>
      <label className={classNames?.builderField ?? ""}>
        <span>Конфигурация</span>
        <textarea
          id={configInputId}
          name="flowNodeConfig"
          value={configText}
          onChange={(event) => {
            setConfigText(event.target.value);
            setConfigError(null);
          }}
          onBlur={() => {
            const config = parseConfig(configText);

            if (config) {
              onUpdateConfig(selectedNode.id, config);
            } else {
              setConfigError("Конфигурация должна быть JSON-объектом.");
            }
          }}
        />
      </label>
      {configError ? <p role="alert">{configError}</p> : null}
    </div>
  );
}

const flowNodeCategoryLabelRu = {
  trigger: "Триггер",
  action: "Действие",
  ai: "AI-узел",
  condition: "Логика",
  delay: "Пауза",
  terminal: "Финал",
  handoff: "Человек"
} satisfies Record<FlowGraph["nodes"][number]["category"], string>;

const categoryInitial = {
  trigger: "T",
  action: "A",
  ai: "AI",
  condition: "?",
  delay: "D",
  terminal: "F",
  handoff: "H"
} satisfies Record<FlowGraph["nodes"][number]["category"], string>;

const flowApprovalModeLabelRu = {
  draft_only: "Только черновик",
  manual_approve: "Требует подтверждения",
  auto_internal: "Автоматически внутри",
  auto_send: "Автоотправка"
} satisfies Record<string, string>;

function parseConfig(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);

    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatConnectionCount(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} ${one}`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ${few}`;
  }

  return `${count} ${many}`;
}
