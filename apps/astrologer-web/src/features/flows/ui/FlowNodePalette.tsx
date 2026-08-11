import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { FlowPaletteNodeId } from "../model/flowDraftEditor";
import { flowPaletteNodeGroups } from "../model/flowDraftEditor";
import { getFlowNodeVisual } from "./flowsVisualModel";

export type FlowNodePaletteProps = {
  readonly locale: "ru" | "en";
  readonly connectionLabel: string | null;
  readonly onAddNode: (nodeId: FlowPaletteNodeId) => void;
  readonly isDisabled?: boolean;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowNodePalette({
  locale,
  connectionLabel,
  onAddNode,
  isDisabled = false,
  classNames
}: FlowNodePaletteProps) {
  const className = (name: string) => classNames?.[name] ?? "";
  const copy = paletteCopy[locale];

  return (
    <aside className={className("builderPalette")} aria-label={copy.palette}>
      <h2>{copy.nodes}</h2>
      <p className={className("builderPaletteHint")}>
        {connectionLabel ? `${copy.addAfter}: ${connectionLabel}` : copy.chooseOutput}
      </p>
      <div className={className("builderPaletteGroups")}>
        <section className={className("builderPaletteGroup")}>
          <h3>{copy.triggers}</h3>
          <div className={className("builderPaletteItems")}>
            <button className={className("builderPaletteItem")} type="button" disabled>
              <span
                className={className("builderPaletteIcon")}
                data-flow-palette-icon
                data-tone="trigger"
                aria-hidden="true"
              >
                <Icon iconName="users" size={15} />
              </span>
              <span className={className("builderPaletteItemContent")}>
                <strong data-flow-palette-title>{copy.existingTrigger}</strong>
                <small data-flow-palette-subtitle>{copy.oneTrigger}</small>
              </span>
            </button>
          </div>
        </section>
        {flowPaletteNodeGroups.map((group) => (
          <section key={group.id} className={className("builderPaletteGroup")}>
            <h3>{group.label[locale]}</h3>
            <div className={className("builderPaletteItems")}>
              {group.nodes.map((node) => {
                const visual = getFlowNodeVisual(node.id, locale);
                return (
                  <button
                    key={node.id}
                    className={className("builderPaletteItem")}
                    type="button"
                    aria-label={`${copy.addNode}: ${node.label[locale]}`}
                    disabled={isDisabled || connectionLabel === null}
                    onClick={() => onAddNode(node.id)}
                  >
                    <span
                      className={className("builderPaletteIcon")}
                      data-flow-palette-icon
                      data-tone={visual.tone}
                      aria-hidden="true"
                    >
                      <Icon iconName={visual.iconName} size={15} />
                    </span>
                    <span className={className("builderPaletteItemContent")}>
                      <strong data-flow-palette-title>{node.label[locale]}</strong>
                      <small data-flow-palette-subtitle>{node.description[locale]}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

const paletteCopy = {
  ru: {
    palette: "Палитра узлов",
    nodes: "Узлы",
    addAfter: "Добавить в ветку",
    chooseOutput: "Выберите свободный выход на схеме",
    triggers: "Триггеры",
    existingTrigger: "Старт воронки",
    oneTrigger: "В V2-графе допускается ровно один триггер",
    addNode: "Добавить узел"
  },
  en: {
    palette: "Node palette",
    nodes: "Nodes",
    addAfter: "Add to branch",
    chooseOutput: "Select an available output on the graph",
    triggers: "Triggers",
    existingTrigger: "Flow start",
    oneTrigger: "A V2 graph has exactly one trigger",
    addNode: "Add node"
  }
} as const;
