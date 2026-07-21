import { describe, expect, it } from "vitest";
import { deriveDefinedCenters, deriveDefinedChannels } from "./definition";
import type { HumanDesignActivation } from "./human-design-types";

const activation = (gate: HumanDesignActivation["gate"]): HumanDesignActivation => ({
  side: "personality",
  body: "sun",
  longitude: gate,
  gate,
  line: 1
});

describe("Human Design definition derivation", () => {
  it("defines channels only when both endpoint gates are active", () => {
    const channels = deriveDefinedChannels([activation(34), activation(20), activation(59)]);

    expect(channels).toEqual([
      {
        code: "20-34",
        gates: [20, 34],
        centers: ["throat", "sacral"],
        circuit: "integration"
      }
    ]);
  });

  it("derives sorted unique centers from defined channels", () => {
    const centers = deriveDefinedCenters([
      {
        code: "20-34",
        gates: [20, 34],
        centers: ["throat", "sacral"],
        circuit: "integration"
      },
      {
        code: "59-6",
        gates: [59, 6],
        centers: ["sacral", "solar_plexus"],
        circuit: "tribal"
      }
    ]);

    expect(centers).toEqual([
      { code: "throat", definedByChannels: ["20-34"] },
      { code: "sacral", definedByChannels: ["20-34", "59-6"] },
      { code: "solar_plexus", definedByChannels: ["59-6"] }
    ]);
  });
});
