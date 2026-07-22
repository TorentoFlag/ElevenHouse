import type { HumanDesignDefinedChannel } from "./definition";
import type {
  HumanDesignCenterCode,
  HumanDesignChannelCode
} from "./human-design-types";

export type HumanDesignDefinitionKindCode =
  | "no_definition"
  | "single"
  | "split"
  | "triple_split"
  | "quadruple_split";

export type HumanDesignDefinitionComponent = {
  readonly centers: readonly HumanDesignCenterCode[];
  readonly channels: readonly HumanDesignChannelCode[];
};

export type HumanDesignDefinitionKindBasis = {
  readonly definedCenterCount: number;
  readonly componentCount: number;
};

export type HumanDesignDefinitionKindMechanics = {
  readonly definition: HumanDesignDefinitionKindCode;
  readonly components: readonly HumanDesignDefinitionComponent[];
  readonly basis: HumanDesignDefinitionKindBasis;
};

export function deriveHumanDesignDefinitionKind(
  definedChannels: readonly HumanDesignDefinedChannel[]
): HumanDesignDefinitionKindMechanics {
  const graph = buildCenterGraph(definedChannels);
  const components = findDefinitionComponents(graph, definedChannels);
  return {
    definition: definitionFromComponentCount(components.length),
    components,
    basis: {
      definedCenterCount: graph.size,
      componentCount: components.length
    }
  };
}

function buildCenterGraph(
  definedChannels: readonly HumanDesignDefinedChannel[]
): Map<HumanDesignCenterCode, Set<HumanDesignCenterCode>> {
  const graph = new Map<HumanDesignCenterCode, Set<HumanDesignCenterCode>>();
  for (const channel of definedChannels) {
    const [firstCenter, secondCenter] = channel.centers;
    connectCenters(graph, firstCenter, secondCenter);
    connectCenters(graph, secondCenter, firstCenter);
  }
  return graph;
}

function connectCenters(
  graph: Map<HumanDesignCenterCode, Set<HumanDesignCenterCode>>,
  from: HumanDesignCenterCode,
  to: HumanDesignCenterCode
): void {
  const neighbors = graph.get(from) ?? new Set<HumanDesignCenterCode>();
  neighbors.add(to);
  graph.set(from, neighbors);
}

function findDefinitionComponents(
  graph: Map<HumanDesignCenterCode, Set<HumanDesignCenterCode>>,
  definedChannels: readonly HumanDesignDefinedChannel[]
): readonly HumanDesignDefinitionComponent[] {
  const visited = new Set<HumanDesignCenterCode>();
  return [...graph.keys()].flatMap((center) => {
    if (visited.has(center)) return [];
    const centers = walkComponent(graph, center, visited);
    const centerSet = new Set(centers);
    return [
      {
        centers,
        channels: definedChannels
          .filter((channel) => channel.centers.every((channelCenter) => centerSet.has(channelCenter)))
          .map((channel) => channel.code)
      }
    ];
  });
}

function walkComponent(
  graph: Map<HumanDesignCenterCode, Set<HumanDesignCenterCode>>,
  start: HumanDesignCenterCode,
  visited: Set<HumanDesignCenterCode>
): readonly HumanDesignCenterCode[] {
  const centers: HumanDesignCenterCode[] = [];
  const queue: HumanDesignCenterCode[] = [start];
  while (queue.length > 0) {
    const center = queue.shift();
    if (!center || visited.has(center)) continue;
    visited.add(center);
    centers.push(center);
    for (const neighbor of graph.get(center) ?? []) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }
  return centers;
}

function definitionFromComponentCount(componentCount: number): HumanDesignDefinitionKindCode {
  switch (componentCount) {
    case 0:
      return "no_definition";
    case 1:
      return "single";
    case 2:
      return "split";
    case 3:
      return "triple_split";
    default:
      return "quadruple_split";
  }
}
