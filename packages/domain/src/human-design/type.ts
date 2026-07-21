import type { HumanDesignDefinedChannel } from "./definition";
import type { HumanDesignCenterCode } from "./human-design-types";

export type HumanDesignTypeCode =
  | "manifestor"
  | "generator"
  | "manifesting_generator"
  | "projector"
  | "reflector";

export type HumanDesignStrategyCode =
  | "inform_before_acting"
  | "wait_to_respond"
  | "wait_for_invitation"
  | "wait_lunar_cycle";

export type HumanDesignSignatureCode = "peace" | "satisfaction" | "success" | "surprise";

export type HumanDesignNotSelfThemeCode =
  | "anger"
  | "frustration"
  | "bitterness"
  | "disappointment";

export type HumanDesignTypeBasis = {
  readonly definedCenterCount: number;
  readonly sacralDefined: boolean;
  readonly throatDefined: boolean;
  readonly throatConnectedMotorCenters: readonly HumanDesignCenterCode[];
};

export type HumanDesignTypeMechanics = {
  readonly type: HumanDesignTypeCode;
  readonly strategy: HumanDesignStrategyCode;
  readonly signature: HumanDesignSignatureCode;
  readonly notSelfTheme: HumanDesignNotSelfThemeCode;
  readonly basis: HumanDesignTypeBasis;
};

const MOTOR_CENTERS = ["sacral", "root", "solar_plexus", "heart"] as const satisfies readonly HumanDesignCenterCode[];

export function deriveHumanDesignType(
  definedChannels: readonly HumanDesignDefinedChannel[]
): HumanDesignTypeMechanics {
  const graph = buildCenterGraph(definedChannels);
  const definedCenterCount = graph.size;
  const sacralDefined = graph.has("sacral");
  const throatDefined = graph.has("throat");
  const throatConnectedMotorCenters = throatDefined
    ? MOTOR_CENTERS.filter((center) => centerIsReachable(graph, "throat", center))
    : [];
  const basis: HumanDesignTypeBasis = {
    definedCenterCount,
    sacralDefined,
    throatDefined,
    throatConnectedMotorCenters
  };

  if (definedCenterCount === 0) {
    return withMetadata("reflector", basis);
  }
  if (sacralDefined) {
    return withMetadata(
      throatConnectedMotorCenters.length > 0 ? "manifesting_generator" : "generator",
      basis
    );
  }
  if (throatConnectedMotorCenters.some((center) => center !== "sacral")) {
    return withMetadata("manifestor", basis);
  }
  return withMetadata("projector", basis);
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

function withMetadata(type: HumanDesignTypeCode, basis: HumanDesignTypeBasis): HumanDesignTypeMechanics {
  switch (type) {
    case "manifestor":
      return {
        type,
        strategy: "inform_before_acting",
        signature: "peace",
        notSelfTheme: "anger",
        basis
      };
    case "generator":
    case "manifesting_generator":
      return {
        type,
        strategy: "wait_to_respond",
        signature: "satisfaction",
        notSelfTheme: "frustration",
        basis
      };
    case "projector":
      return {
        type,
        strategy: "wait_for_invitation",
        signature: "success",
        notSelfTheme: "bitterness",
        basis
      };
    case "reflector":
      return {
        type,
        strategy: "wait_lunar_cycle",
        signature: "surprise",
        notSelfTheme: "disappointment",
        basis
      };
  }
}
