import type { BuildHumanDesignActivationsInput } from "../activations";
import type {
  HumanDesignActivationSide,
  HumanDesignCelestialBody,
  HumanDesignGateNumber,
  HumanDesignLineNumber
} from "../human-design-types";
import type { HumanDesignIndividualBaseResult } from "../individual";

type ApprovedHumanDesignFixture = {
  readonly id: string;
  readonly source: {
    readonly name: string;
    readonly url: string;
    readonly accessedAt: string;
    readonly mode: "public_documented_example";
    readonly approval: "approved";
    readonly notes: string;
  };
  readonly input: BuildHumanDesignActivationsInput;
  readonly expected: {
    readonly type: HumanDesignIndividualBaseResult["type"];
    readonly profile: HumanDesignIndividualBaseResult["profile"]["code"];
    readonly derivedAuthority: HumanDesignIndividualBaseResult["authority"];
    readonly derivedDefinition: HumanDesignIndividualBaseResult["definition"];
    readonly definedChannels: readonly HumanDesignIndividualBaseResult["definedChannels"][number]["code"][];
    readonly definedCenters: readonly HumanDesignIndividualBaseResult["definedCenters"][number]["code"][];
    readonly incarnationCross: Partial<HumanDesignIndividualBaseResult["incarnationCross"]>;
    readonly activations: readonly {
      readonly side: HumanDesignActivationSide;
      readonly body: HumanDesignCelestialBody;
      readonly gate: HumanDesignGateNumber;
      readonly line: HumanDesignLineNumber;
    }[];
  };
};

export const HUMAN_DESIGN_APPROVED_FIXTURES = [
  {
    id: "bodygraph-longitudes-human-design-py-wheel-1980-01-01t000000z",
    source: {
      name: "BodyGraph documented longitudes with human-design-py gate-wheel reference",
      url: "https://www.bodygraph.info/; https://github.com/geodetheseeker/human-design-py",
      accessedAt: "2026-07-22",
      mode: "public_documented_example",
      approval: "approved",
      notes:
        "BodyGraph public example supplies date_utc 1980-01-01T00:00:00Z raw longitudes. Gate, line, channel, authority and definition expectations follow the MIT human-design-py gate sequence and channel/type rules because the BodyGraph static example has internally inconsistent longitude-to-gate fields."
    },
    input: {
      personality: {
        sun: 279.9965418124027,
        moon: 83.4394862961934,
        north_node: 150.7368505076125,
        mercury: 268.2378438773714,
        venus: 311.67906616859216,
        mars: 164.25302487885205,
        jupiter: 160.479672380691,
        saturn: 177.2686636970394,
        uranus: 234.32916792687962,
        neptune: 261.20436797622995,
        pluto: 201.8896323079366
      },
      design: {
        sun: 191.996539526008,
        moon: 8.424620306702279,
        north_node: 158.44866958952045,
        mercury: 207.86548205908142,
        venus: 203.00421116514056,
        mars: 126.56935834334396,
        jupiter: 151.46856850846848,
        saturn: 170.62668916663057,
        uranus: 229.2448944543334,
        neptune: 258.35863260059824,
        pluto: 199.1239565139889
      }
    },
    expected: {
      type: "generator",
      profile: "1/3",
      derivedAuthority: "emotional",
      derivedDefinition: "split",
      definedChannels: ["64-47", "40-37", "59-6", "55-39"],
      definedCenters: ["head", "ajna", "heart", "sacral", "solar_plexus", "root"],
      incarnationCross: {
        angle: "right_angle",
        profileCode: "1/3",
        gateSequence: [38, 39, 48, 21],
        gates: {
          personalitySun: { gate: 38, line: 1 },
          personalityEarth: { gate: 39, line: 1 },
          designSun: { gate: 48, line: 3 },
          designEarth: { gate: 21, line: 3 }
        }
      },
      activations: [
        { side: "personality", body: "sun", gate: 38, line: 1 },
        { side: "personality", body: "earth", gate: 39, line: 1 },
        { side: "personality", body: "moon", gate: 12, line: 1 },
        { side: "personality", body: "north_node", gate: 59, line: 1 },
        { side: "personality", body: "south_node", gate: 55, line: 1 },
        { side: "personality", body: "mercury", gate: 11, line: 6 },
        { side: "personality", body: "venus", gate: 19, line: 5 },
        { side: "personality", body: "mars", gate: 64, line: 4 },
        { side: "personality", body: "jupiter", gate: 40, line: 6 },
        { side: "personality", body: "saturn", gate: 6, line: 5 },
        { side: "personality", body: "uranus", gate: 43, line: 6 },
        { side: "personality", body: "neptune", gate: 26, line: 5 },
        { side: "personality", body: "pluto", gate: 32, line: 2 },
        { side: "design", body: "sun", gate: 48, line: 3 },
        { side: "design", body: "earth", gate: 21, line: 3 },
        { side: "design", body: "moon", gate: 17, line: 5 },
        { side: "design", body: "north_node", gate: 40, line: 3 },
        { side: "design", body: "south_node", gate: 37, line: 3 },
        { side: "design", body: "mercury", gate: 50, line: 2 },
        { side: "design", body: "venus", gate: 32, line: 3 },
        { side: "design", body: "mars", gate: 31, line: 5 },
        { side: "design", body: "jupiter", gate: 59, line: 2 },
        { side: "design", body: "saturn", gate: 47, line: 4 },
        { side: "design", body: "uranus", gate: 43, line: 1 },
        { side: "design", body: "neptune", gate: 26, line: 2 },
        { side: "design", body: "pluto", gate: 57, line: 5 }
      ]
    }
  }
] as const satisfies readonly ApprovedHumanDesignFixture[];
