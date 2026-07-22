import type {
  HumanDesignActivation,
  HumanDesignActivationSide,
  HumanDesignCelestialBody,
  HumanDesignGateNumber,
  HumanDesignLineNumber
} from "./human-design-types";

export type HumanDesignIncarnationCrossAngle =
  | "right_angle"
  | "juxtaposition"
  | "left_angle";

export type HumanDesignIncarnationCrossActivation = {
  readonly gate: HumanDesignGateNumber;
  readonly line: HumanDesignLineNumber;
};

export type HumanDesignIncarnationCross = {
  readonly angle: HumanDesignIncarnationCrossAngle;
  readonly profileCode: `${HumanDesignLineNumber}/${HumanDesignLineNumber}`;
  readonly gates: {
    readonly personalitySun: HumanDesignIncarnationCrossActivation;
    readonly personalityEarth: HumanDesignIncarnationCrossActivation;
    readonly designSun: HumanDesignIncarnationCrossActivation;
    readonly designEarth: HumanDesignIncarnationCrossActivation;
  };
  readonly gateSequence: readonly [
    HumanDesignGateNumber,
    HumanDesignGateNumber,
    HumanDesignGateNumber,
    HumanDesignGateNumber
  ];
};

const RIGHT_ANGLE_PROFILES = new Set(["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6"]);
const LEFT_ANGLE_PROFILES = new Set(["5/1", "5/2", "6/2", "6/3"]);

export function deriveHumanDesignIncarnationCross(
  activations: readonly HumanDesignActivation[]
): HumanDesignIncarnationCross {
  const personalitySun = toCrossActivation(findActivation(activations, "personality", "sun"));
  const personalityEarth = toCrossActivation(findActivation(activations, "personality", "earth"));
  const designSun = toCrossActivation(findActivation(activations, "design", "sun"));
  const designEarth = toCrossActivation(findActivation(activations, "design", "earth"));
  const profileCode = `${personalitySun.line}/${designSun.line}` as const;
  return {
    angle: angleFromProfile(profileCode),
    profileCode,
    gates: {
      personalitySun,
      personalityEarth,
      designSun,
      designEarth
    },
    gateSequence: [
      personalitySun.gate,
      personalityEarth.gate,
      designSun.gate,
      designEarth.gate
    ]
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

function toCrossActivation(activation: HumanDesignActivation): HumanDesignIncarnationCrossActivation {
  return {
    gate: activation.gate,
    line: activation.line
  };
}

function angleFromProfile(
  profileCode: `${HumanDesignLineNumber}/${HumanDesignLineNumber}`
): HumanDesignIncarnationCrossAngle {
  if (RIGHT_ANGLE_PROFILES.has(profileCode)) return "right_angle";
  if (profileCode === "4/1") return "juxtaposition";
  if (LEFT_ANGLE_PROFILES.has(profileCode)) return "left_angle";
  throw new Error(`Unsupported Human Design incarnation cross profile: ${profileCode}`);
}
