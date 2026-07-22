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
    readonly mode: "public_documented_example" | "live_public_trial" | "reference_boundary_case";
    readonly approval: "approved";
    readonly notes: string;
  };
  readonly input: BuildHumanDesignActivationsInput;
  readonly expected: {
    readonly type: HumanDesignIndividualBaseResult["type"];
    readonly profile: HumanDesignIndividualBaseResult["profile"]["code"];
    readonly derivedAuthority: HumanDesignIndividualBaseResult["authority"];
    readonly externalAuthorityLabel?: string;
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
  },
  {
    id: "humandesignapi-live-trial-amsterdam-1990-09-05-2117",
    source: {
      name: "HumanDesignAPI live public trial",
      url: "https://humandesignapi.nl/; https://api.humandesignapi.nl/v2/sample/visual-trial",
      accessedAt: "2026-07-22",
      mode: "live_public_trial",
      approval: "approved",
      notes:
        "Live trial response for birthdate 1990-09-05, birthtime 21:17, location Amsterdam. The external response exposes type, profile, strategy, authority, definition, centers, channels and all 26 activations, but not raw planetary longitudes; fixture input longitudes were captured from local chart-engine for the same birth data."
    },
    input: {
      personality: {
        sun: 162.96571331320797,
        moon: 352.3567170463005,
        north_node: 306.8964004982856,
        mercury: 167.58012900828666,
        venus: 148.09295982556213,
        mars: 62.567412282634706,
        jupiter: 123.78794557147471,
        saturn: 288.9509768246774,
        uranus: 275.634388774691,
        neptune: 281.8849395402568,
        pluto: 225.4573245894658
      },
      design: {
        sun: 74.96592371057716,
        moon: 227.10104832113268,
        north_node: 308.76706522624244,
        mercury: 51.40261272489362,
        venus: 37.54724950483911,
        mars: 4.101847957710002,
        jupiter: 103.8406867534296,
        saturn: 294.5435037095621,
        uranus: 278.52489404364763,
        neptune: 283.94609938897344,
        pluto: 225.61099467776478
      }
    },
    expected: {
      type: "projector",
      profile: "2/4",
      derivedAuthority: "mental",
      externalAuthorityLabel: "Sounding Board",
      derivedDefinition: "single",
      definedChannels: ["64-47"],
      definedCenters: ["head", "ajna"],
      incarnationCross: {
        angle: "right_angle",
        profileCode: "2/4",
        gateSequence: [64, 63, 35, 5],
        gates: {
          personalitySun: { gate: 64, line: 2 },
          personalityEarth: { gate: 63, line: 2 },
          designSun: { gate: 35, line: 4 },
          designEarth: { gate: 5, line: 4 }
        }
      },
      activations: [
        { side: "personality", body: "sun", gate: 64, line: 2 },
        { side: "personality", body: "earth", gate: 63, line: 2 },
        { side: "personality", body: "moon", gate: 22, line: 6 },
        { side: "personality", body: "north_node", gate: 41, line: 6 },
        { side: "personality", body: "south_node", gate: 31, line: 6 },
        { side: "personality", body: "mercury", gate: 47, line: 1 },
        { side: "personality", body: "venus", gate: 29, line: 4 },
        { side: "personality", body: "mars", gate: 20, line: 3 },
        { side: "personality", body: "jupiter", gate: 31, line: 2 },
        { side: "personality", body: "saturn", gate: 54, line: 5 },
        { side: "personality", body: "uranus", gate: 58, line: 2 },
        { side: "personality", body: "neptune", gate: 38, line: 3 },
        { side: "personality", body: "pluto", gate: 1, line: 3 },
        { side: "design", body: "sun", gate: 35, line: 4 },
        { side: "design", body: "earth", gate: 5, line: 4 },
        { side: "design", body: "moon", gate: 1, line: 5 },
        { side: "design", body: "north_node", gate: 19, line: 2 },
        { side: "design", body: "south_node", gate: 33, line: 2 },
        { side: "design", body: "mercury", gate: 23, line: 3 },
        { side: "design", body: "venus", gate: 27, line: 6 },
        { side: "design", body: "mars", gate: 17, line: 1 },
        { side: "design", body: "jupiter", gate: 39, line: 5 },
        { side: "design", body: "saturn", gate: 61, line: 5 },
        { side: "design", body: "uranus", gate: 58, line: 5 },
        { side: "design", body: "neptune", gate: 38, line: 5 },
        { side: "design", body: "pluto", gate: 1, line: 3 }
      ]
    }
  },
  {
    id: "reference-gate-line-boundaries-41-19-transition",
    source: {
      name: "Reference gate and line boundary case",
      url: "internal:human-design-classic-gate-wheel.v1",
      accessedAt: "2026-07-22",
      mode: "reference_boundary_case",
      approval: "approved",
      notes:
        "Deterministic boundary fixture for start-inclusive and end-exclusive gate/line mapping: gate 41 start, just before line 2, exact line 2 boundary, just before gate 19 and exact gate 19 start. Expected mechanics are derived from the approved classic gate wheel and stored to prevent accidental boundary regressions."
    },
    input: {
      personality: {
        sun: 302,
        moon: 302.937499999,
        north_node: 302.9375,
        mercury: 307.624999999,
        venus: 307.625,
        mars: 324.5,
        jupiter: 60.125,
        saturn: 10,
        uranus: 20,
        neptune: 30,
        pluto: 40
      },
      design: {
        sun: 242,
        moon: 240.125,
        north_node: 60.125,
        mercury: 240.125,
        venus: 50,
        mars: 70,
        jupiter: 80,
        saturn: 90,
        uranus: 100,
        neptune: 110,
        pluto: 120
      }
    },
    expected: {
      type: "manifesting_generator",
      profile: "1/3",
      derivedAuthority: "emotional",
      derivedDefinition: "split",
      definedChannels: ["45-21", "20-34", "30-41"],
      definedCenters: ["throat", "heart", "sacral", "solar_plexus", "root"],
      incarnationCross: {
        angle: "right_angle",
        profileCode: "1/3",
        gateSequence: [41, 31, 34, 20],
        gates: {
          personalitySun: { gate: 41, line: 1 },
          personalityEarth: { gate: 31, line: 1 },
          designSun: { gate: 34, line: 3 },
          designEarth: { gate: 20, line: 3 }
        }
      },
      activations: [
        { side: "personality", body: "sun", gate: 41, line: 1 },
        { side: "personality", body: "earth", gate: 31, line: 1 },
        { side: "personality", body: "moon", gate: 41, line: 1 },
        { side: "personality", body: "north_node", gate: 41, line: 2 },
        { side: "personality", body: "south_node", gate: 31, line: 2 },
        { side: "personality", body: "mercury", gate: 41, line: 6 },
        { side: "personality", body: "venus", gate: 19, line: 1 },
        { side: "personality", body: "mars", gate: 30, line: 1 },
        { side: "personality", body: "jupiter", gate: 20, line: 1 },
        { side: "personality", body: "saturn", gate: 21, line: 1 },
        { side: "personality", body: "uranus", gate: 51, line: 6 },
        { side: "personality", body: "neptune", gate: 3, line: 4 },
        { side: "personality", body: "pluto", gate: 24, line: 3 },
        { side: "design", body: "sun", gate: 34, line: 3 },
        { side: "design", body: "earth", gate: 20, line: 3 },
        { side: "design", body: "moon", gate: 34, line: 1 },
        { side: "design", body: "north_node", gate: 20, line: 1 },
        { side: "design", body: "south_node", gate: 34, line: 1 },
        { side: "design", body: "mercury", gate: 34, line: 1 },
        { side: "design", body: "venus", gate: 23, line: 2 },
        { side: "design", body: "mars", gate: 16, line: 5 },
        { side: "design", body: "jupiter", gate: 45, line: 4 },
        { side: "design", body: "saturn", gate: 15, line: 2 },
        { side: "design", body: "uranus", gate: 39, line: 1 },
        { side: "design", body: "neptune", gate: 53, line: 6 },
        { side: "design", body: "pluto", gate: 56, line: 4 }
      ]
    }
  }
] as const satisfies readonly ApprovedHumanDesignFixture[];
