import { useEffect, useState } from "react";
import type { FlowGraph } from "@elevenhouse/contracts";

export type FlowBuilderInspectorProps = {
  readonly selectedNode: FlowGraph["nodes"][number] | null;
  readonly onTitleChange: (nodeId: string, title: string) => void;
  readonly onCommitTitle: (nodeId: string, title: string) => void;
  readonly onUpdateConfig: (nodeId: string, config: Record<string, unknown>) => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowBuilderInspector({
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

  return (
    <div className={classNames?.builderInspectorSection ?? ""} aria-label="Настройки узла">
      <p className={classNames?.builderInspectorCategory ?? ""}>{selectedNode.category}</p>
      <h2>{selectedNode.title}</h2>
      <p className={classNames?.builderInspectorId ?? ""}>id: {selectedNode.id}</p>
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
