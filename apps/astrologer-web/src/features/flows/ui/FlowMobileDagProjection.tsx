import type { FlowGraphV2, FlowSourceHandleV2 } from "@elevenhouse/contracts";
import { getRequiredSourceHandles } from "../model/flowDraftEditor";
import { flowNodeKindLabel, flowSourceHandleLabel } from "../model/flowDisplay";
import styles from "./FlowMobileDagProjection.module.css";

export type FlowMobileDagProjectionProps = {
  readonly graph: FlowGraphV2;
  readonly locale: "ru" | "en";
  readonly selectedNodeId: string | null;
  readonly connectionSource: { readonly nodeId: string; readonly handle: FlowSourceHandleV2 } | null;
  readonly editable: boolean;
  readonly onEditNode: (nodeId: string) => void;
  readonly onSelectSourceHandle: (nodeId: string, handle: FlowSourceHandleV2) => void;
};

export function FlowMobileDagProjection({
  graph,
  locale,
  selectedNodeId,
  connectionSource,
  editable,
  onEditNode,
  onSelectSourceHandle
}: FlowMobileDagProjectionProps) {
  const copy = mobileDagCopy[locale];

  return (
    <section className={styles.projection} aria-label={copy.projection}>
      <ol className={styles.nodes}>
        {graph.nodes.map((node) => {
          const outgoing = graph.edges.filter((edge) => edge.sourceNodeId === node.id);
          const occupiedHandles = new Set(outgoing.map((edge) => edge.sourceHandle));
          const isSelected = selectedNodeId === node.id;

          return (
            <li key={node.id} className={styles.node} data-selected={isSelected ? "true" : undefined}>
              <div className={styles.nodeHeader}>
                <button
                  className={styles.nodeSelect}
                  type="button"
                  aria-label={`${copy.selectNode}: ${node.displayTitle}`}
                  onClick={() => onEditNode(node.id)}
                >
                  <span>{flowNodeKindLabel(node.kind, locale)}</span>
                  <strong>{node.displayTitle}</strong>
                </button>
                <button
                  className={styles.nodeEdit}
                  type="button"
                  aria-label={`${copy.editNode}: ${node.displayTitle}`}
                  onClick={() => onEditNode(node.id)}
                >
                  {copy.edit}
                </button>
              </div>
              {getRequiredSourceHandles(node).length > 0 ? (
                <div className={styles.handles} aria-label={`${copy.outputs}: ${node.displayTitle}`}>
                  {getRequiredSourceHandles(node).map((handle) => {
                    const selected =
                      connectionSource?.nodeId === node.id && connectionSource.handle === handle;
                    const occupied = occupiedHandles.has(handle);

                    return (
                      <button
                        key={handle}
                        type="button"
                        disabled={!editable || occupied}
                        data-selected={selected ? "true" : undefined}
                        aria-label={`${copy.continueFrom} ${node.displayTitle}: ${flowSourceHandleLabel(
                          handle,
                          locale
                        )}`}
                        onClick={() => onSelectSourceHandle(node.id, handle)}
                      >
                        {flowSourceHandleLabel(handle, locale)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {outgoing.length > 0 ? (
                <ul className={styles.connections} aria-label={`${copy.connections}: ${node.displayTitle}`}>
                  {outgoing.map((edge) => {
                    const target = graph.nodes.find((candidate) => candidate.id === edge.targetNodeId);
                    return (
                      <li key={edge.id}>
                        <span>{flowSourceHandleLabel(edge.sourceHandle, locale)}</span>
                        <strong>{target?.displayTitle ?? edge.targetNodeId}</strong>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const mobileDagCopy = {
  ru: {
    projection: "Мобильная схема воронки",
    edit: "Настроить",
    editNode: "Настроить узел",
    selectNode: "Выбрать узел",
    outputs: "Выходы",
    connections: "Связи",
    continueFrom: "Продолжить из"
  },
  en: {
    projection: "Mobile flow graph",
    edit: "Configure",
    editNode: "Configure node",
    selectNode: "Select node",
    outputs: "Outputs",
    connections: "Connections",
    continueFrom: "Continue from"
  }
} as const;
