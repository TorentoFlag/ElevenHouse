import type { HumanDesignDefinedChannel } from "./definition";
import type { HumanDesignCenterCode } from "./human-design-types";

export type HumanDesignAuthorityCode =
  | "emotional"
  | "sacral"
  | "splenic"
  | "ego"
  | "self_projected"
  | "mental"
  | "lunar";

export type HumanDesignAuthorityBasis = {
  readonly definedCenters: readonly HumanDesignCenterCode[];
  readonly priority: readonly HumanDesignAuthorityCode[];
  readonly selectedBy: string;
};

export type HumanDesignAuthorityMechanics = {
  readonly authority: HumanDesignAuthorityCode;
  readonly basis: HumanDesignAuthorityBasis;
};

const AUTHORITY_PRIORITY = [
  "emotional",
  "sacral",
  "splenic",
  "ego",
  "self_projected",
  "mental",
  "lunar"
] as const satisfies readonly HumanDesignAuthorityCode[];

export function deriveHumanDesignAuthority(
  definedChannels: readonly HumanDesignDefinedChannel[]
): HumanDesignAuthorityMechanics {
  const graph = buildCenterGraph(definedChannels);
  const definedCenters = [...graph.keys()].sort();
  const centerIsDefined = (center: HumanDesignCenterCode): boolean => graph.has(center);
  const selectedBasis = (selectedBy: string): HumanDesignAuthorityBasis => ({
    definedCenters,
    priority: AUTHORITY_PRIORITY,
    selectedBy
  });

  if (centerIsDefined("solar_plexus")) {
    return { authority: "emotional", basis: selectedBasis("solar_plexus_defined") };
  }
  if (centerIsDefined("sacral")) {
    return { authority: "sacral", basis: selectedBasis("sacral_defined") };
  }
  if (centerIsDefined("spleen")) {
    return { authority: "splenic", basis: selectedBasis("spleen_defined") };
  }
  if (centerIsDefined("heart")) {
    return { authority: "ego", basis: selectedBasis("heart_defined") };
  }
  if (
    centerIsDefined("g") &&
    centerIsDefined("throat") &&
    centerIsReachable(graph, "g", "throat")
  ) {
    return { authority: "self_projected", basis: selectedBasis("g_throat_connected") };
  }
  if (definedCenters.length > 0) {
    return {
      authority: "mental",
      basis: selectedBasis("defined_centers_without_inner_authority")
    };
  }
  return { authority: "lunar", basis: selectedBasis("no_defined_centers") };
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

function centerIsReachable(
  graph: Map<HumanDesignCenterCode, Set<HumanDesignCenterCode>>,
  from: HumanDesignCenterCode,
  to: HumanDesignCenterCode
): boolean {
  const visited = new Set<HumanDesignCenterCode>();
  const stack: HumanDesignCenterCode[] = [from];
  while (stack.length > 0) {
    const center = stack.pop();
    if (!center || visited.has(center)) continue;
    if (center === to) return true;
    visited.add(center);
    stack.push(...(graph.get(center) ?? []));
  }
  return false;
}
