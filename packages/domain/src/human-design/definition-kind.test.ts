import { describe, expect, it } from "vitest";
import type { HumanDesignDefinedChannel } from "./definition";
import { deriveHumanDesignDefinitionKind } from "./definition-kind";

const channel = (
  overrides: Pick<HumanDesignDefinedChannel, "code" | "gates" | "centers">
): HumanDesignDefinedChannel => ({
  circuit: "collective",
  ...overrides
});

describe("Human Design definition kind derivation", () => {
  it("classifies No Definition when no centers are defined", () => {
    expect(deriveHumanDesignDefinitionKind([])).toEqual({
      definition: "no_definition",
      components: [],
      basis: {
        definedCenterCount: 0,
        componentCount: 0
      }
    });
  });

  it("classifies Single Definition when all defined centers are connected", () => {
    expect(
      deriveHumanDesignDefinitionKind([
        channel({ code: "20-34", gates: [20, 34], centers: ["throat", "sacral"] }),
        channel({ code: "59-6", gates: [59, 6], centers: ["sacral", "solar_plexus"] })
      ])
    ).toEqual({
      definition: "single",
      components: [
        {
          centers: ["throat", "sacral", "solar_plexus"],
          channels: ["20-34", "59-6"]
        }
      ],
      basis: {
        definedCenterCount: 3,
        componentCount: 1
      }
    });
  });

  it("classifies Split Definition from two disconnected center groups", () => {
    expect(
      deriveHumanDesignDefinitionKind([
        channel({ code: "20-34", gates: [20, 34], centers: ["throat", "sacral"] }),
        channel({ code: "32-54", gates: [32, 54], centers: ["spleen", "root"] })
      ])
    ).toMatchObject({
      definition: "split",
      basis: {
        definedCenterCount: 4,
        componentCount: 2
      }
    });
  });

  it("classifies Triple Split Definition from three disconnected center groups", () => {
    expect(
      deriveHumanDesignDefinitionKind([
        channel({ code: "20-34", gates: [20, 34], centers: ["throat", "sacral"] }),
        channel({ code: "32-54", gates: [32, 54], centers: ["spleen", "root"] }),
        channel({ code: "25-51", gates: [25, 51], centers: ["g", "heart"] })
      ])
    ).toMatchObject({
      definition: "triple_split",
      basis: {
        definedCenterCount: 6,
        componentCount: 3
      }
    });
  });

  it("classifies Quadruple Split Definition from four disconnected center groups", () => {
    expect(
      deriveHumanDesignDefinitionKind([
        channel({ code: "64-47", gates: [64, 47], centers: ["head", "ajna"] }),
        channel({ code: "20-34", gates: [20, 34], centers: ["throat", "sacral"] }),
        channel({ code: "32-54", gates: [32, 54], centers: ["spleen", "root"] }),
        channel({ code: "25-51", gates: [25, 51], centers: ["g", "heart"] })
      ])
    ).toMatchObject({
      definition: "quadruple_split",
      basis: {
        definedCenterCount: 8,
        componentCount: 4
      }
    });
  });
});
