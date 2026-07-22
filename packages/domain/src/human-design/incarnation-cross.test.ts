import { describe, expect, it } from "vitest";
import { deriveHumanDesignIncarnationCross } from "./incarnation-cross";
import type { HumanDesignActivation } from "./human-design-types";

const activation = (
  side: HumanDesignActivation["side"],
  body: HumanDesignActivation["body"],
  gate: HumanDesignActivation["gate"],
  line: HumanDesignActivation["line"]
): HumanDesignActivation => ({
  side,
  body,
  gate,
  line,
  longitude: gate
});

const crossActivations = (
  personalityLine: HumanDesignActivation["line"],
  designLine: HumanDesignActivation["line"]
): readonly HumanDesignActivation[] => [
  activation("personality", "sun", 41, personalityLine),
  activation("personality", "earth", 31, personalityLine),
  activation("design", "sun", 34, designLine),
  activation("design", "earth", 20, designLine)
];

describe("Human Design incarnation cross derivation", () => {
  it("derives Right Angle cross mechanics from 1/3 profile activations", () => {
    expect(deriveHumanDesignIncarnationCross(crossActivations(1, 3))).toEqual({
      angle: "right_angle",
      profileCode: "1/3",
      gates: {
        personalitySun: { gate: 41, line: 1 },
        personalityEarth: { gate: 31, line: 1 },
        designSun: { gate: 34, line: 3 },
        designEarth: { gate: 20, line: 3 }
      },
      gateSequence: [41, 31, 34, 20]
    });
  });

  it("derives Juxtaposition cross mechanics from 4/1 profile activations", () => {
    expect(deriveHumanDesignIncarnationCross(crossActivations(4, 1))).toMatchObject({
      angle: "juxtaposition",
      profileCode: "4/1"
    });
  });

  it("derives Left Angle cross mechanics from 5/1 profile activations", () => {
    expect(deriveHumanDesignIncarnationCross(crossActivations(5, 1))).toMatchObject({
      angle: "left_angle",
      profileCode: "5/1"
    });
  });

  it("rejects unsupported profile pairs instead of guessing an angle", () => {
    expect(() => deriveHumanDesignIncarnationCross(crossActivations(1, 1))).toThrow(
      "Unsupported Human Design incarnation cross profile: 1/1"
    );
  });
});
