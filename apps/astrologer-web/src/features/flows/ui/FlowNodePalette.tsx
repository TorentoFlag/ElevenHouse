import type { FlowPaletteNodeId } from "../model/flowDraftEditor";
import { flowPaletteNodeGroups } from "../model/flowDraftEditor";

export type FlowNodePaletteProps = {
  readonly onAddNode: (nodeId: FlowPaletteNodeId) => void;
  readonly isDisabled?: boolean;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowNodePalette({ onAddNode, isDisabled = false, classNames }: FlowNodePaletteProps) {
  const className = (name: string) => classNames?.[name] ?? "";

  return (
    <aside className={className("builderPalette")} aria-label="Палитра узлов">
      <h2>Узлы</h2>
      <p className={className("builderPaletteHint")}>Добавьте шаг после выбранного узла на схеме.</p>
      <div className={className("builderPaletteGroups")}>
        <section className={className("builderPaletteGroup")}>
          <h3>Триггеры</h3>
          <div className={className("builderPaletteItems")}>
            <button className={className("builderPaletteItem")} type="button" disabled>
              <span>trigger</span>
              <strong>Старт воронки</strong>
              <small>В графе уже есть один входной триггер</small>
            </button>
          </div>
        </section>
        {flowPaletteNodeGroups.map((group) => (
          <section key={group.id} className={className("builderPaletteGroup")}>
            <h3>{group.label}</h3>
            <div className={className("builderPaletteItems")}>
              {group.nodes.map((node) => (
                <button
                  key={node.id}
                  className={className("builderPaletteItem")}
                  type="button"
                  aria-label={`Добавить узел: ${node.label}`}
                  disabled={isDisabled}
                  onClick={() => onAddNode(node.id)}
                >
                  <span>{node.node.category}</span>
                  <strong>{node.label}</strong>
                  <small>{node.description}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
