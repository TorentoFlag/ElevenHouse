import {
  buildHumanDesignActivations,
  type BuildHumanDesignActivationsInput
} from "./activations";
import {
  deriveDefinedCenters,
  deriveDefinedChannels,
  type HumanDesignDefinedCenter,
  type HumanDesignDefinedChannel
} from "./definition";
import {
  HUMAN_DESIGN_ENGINE_REVISION,
  HUMAN_DESIGN_METHOD_CODE,
  HUMAN_DESIGN_SCHEMA_VERSION,
  type HumanDesignActivation,
  type HumanDesignActivationSide,
  type HumanDesignCelestialBody,
  type HumanDesignGateNumber,
  type HumanDesignLineNumber
} from "./human-design-types";

export type HumanDesignProfile = {
  readonly personalityLine: HumanDesignLineNumber;
  readonly designLine: HumanDesignLineNumber;
  readonly code: `${HumanDesignLineNumber}/${HumanDesignLineNumber}`;
};

export type HumanDesignDefinedGate = {
  readonly gate: HumanDesignGateNumber;
  readonly activatedBy: readonly {
    readonly side: HumanDesignActivationSide;
    readonly body: HumanDesignCelestialBody;
    readonly line: HumanDesignLineNumber;
  }[];
};

export type HumanDesignIndividualBaseResult = {
  readonly methodCode: typeof HUMAN_DESIGN_METHOD_CODE;
  readonly engineRevision: typeof HUMAN_DESIGN_ENGINE_REVISION;
  readonly schemaVersion: typeof HUMAN_DESIGN_SCHEMA_VERSION;
  readonly mode: "individual";
  readonly activations: readonly HumanDesignActivation[];
  readonly definedGates: readonly HumanDesignDefinedGate[];
  readonly definedChannels: readonly HumanDesignDefinedChannel[];
  readonly definedCenters: readonly HumanDesignDefinedCenter[];
  readonly profile: HumanDesignProfile;
};

export function buildHumanDesignIndividualBaseResult(
  input: BuildHumanDesignActivationsInput
): HumanDesignIndividualBaseResult {
  const activations = buildHumanDesignActivations(input);
  const definedChannels = deriveDefinedChannels(activations);
  return {
    methodCode: HUMAN_DESIGN_METHOD_CODE,
    engineRevision: HUMAN_DESIGN_ENGINE_REVISION,
    schemaVersion: HUMAN_DESIGN_SCHEMA_VERSION,
    mode: "individual",
    activations,
    definedGates: buildDefinedGates(activations),
    definedChannels,
    definedCenters: deriveDefinedCenters(definedChannels),
    profile: buildProfile(activations)
  };
}

function buildDefinedGates(activations: readonly HumanDesignActivation[]): readonly HumanDesignDefinedGate[] {
  const gates = new Map<HumanDesignGateNumber, HumanDesignDefinedGate["activatedBy"]>();
  for (const activation of activations) {
    const activatedBy = gates.get(activation.gate) ?? [];
    gates.set(activation.gate, [
      ...activatedBy,
      { side: activation.side, body: activation.body, line: activation.line }
    ]);
  }
  return [...gates.entries()]
    .sort(([firstGate], [secondGate]) => firstGate - secondGate)
    .map(([gate, activatedBy]) => ({ gate, activatedBy }));
}

function buildProfile(activations: readonly HumanDesignActivation[]): HumanDesignProfile {
  const personalitySun = findActivation(activations, "personality", "sun");
  const designSun = findActivation(activations, "design", "sun");
  return {
    personalityLine: personalitySun.line,
    designLine: designSun.line,
    code: `${personalitySun.line}/${designSun.line}`
  };
}

function findActivation(
  activations: readonly HumanDesignActivation[],
  side: HumanDesignActivationSide,
  body: HumanDesignCelestialBody
): HumanDesignActivation {
  const activation = activations.find(
    (candidate) => candidate.side === side && candidate.body === body
  );
  if (!activation) {
    throw new Error(`Missing Human Design activation: ${side}.${body}`);
  }
  return activation;
}
