import type { FlowGraph, FlowNodePosition } from "@elevenhouse/contracts";

export type FlowBuilderCanvasProps = {
  readonly graph: FlowGraph;
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onMoveNode: (nodeId: string, position: FlowNodePosition) => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowBuilderCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  classNames
}: FlowBuilderCanvasProps) {
  const selectedNodeIndex = graph.nodes.findIndex((node) => node.id === selectedNodeId);
  const selectedNode = selectedNodeIndex >= 0 ? graph.nodes[selectedNodeIndex] : null;
  const selectedPosition = selectedNode ? nodePosition(selectedNode, selectedNodeIndex) : null;

  return (
    <section className={classNames?.builderCanvas ?? ""} aria-label="Схема воронки">
      {selectedNode && selectedPosition ? (
        <div className={classNames?.builderCanvasControls ?? ""}>
          <button
            type="button"
            onClick={() => onMoveNode(selectedNode.id, { x: selectedPosition.x + 40, y: selectedPosition.y })}
            aria-label={`Сместить вправо: ${selectedNode.title}`}
          >
            Сместить вправо
          </button>
        </div>
      ) : null}
      <div className={classNames?.builderEdges ?? ""} aria-label="Связи воронки">
        {graph.edges.map((edge) => {
          const fromNode = graph.nodes.find((node) => node.id === edge.fromNodeId);
          const toNode = graph.nodes.find((node) => node.id === edge.toNodeId);

          return fromNode && toNode ? (
            <span key={edge.id}>
              {fromNode.title} -&gt; {toNode.title}
            </span>
          ) : null;
        })}
      </div>
      <div className={classNames?.builderNodeGrid ?? ""}>
        {graph.nodes.map((node, index) => {
          const position = nodePosition(node, index);

          return (
            <button
              key={node.id}
              className={classNames?.builderNode ?? ""}
              style={{ left: position.x, top: position.y }}
              data-selected={selectedNodeId === node.id ? "true" : undefined}
              type="button"
              aria-label={`Выбрать узел: ${node.title}`}
              onClick={() => onSelectNode(node.id)}
            >
              <span>{node.category}</span>
              <strong>{node.title}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function nodePosition(node: FlowGraph["nodes"][number], index: number): FlowNodePosition {
  return node.position ?? { x: 48 + (index % 3) * 240, y: 80 + Math.floor(index / 3) * 160 };
}
