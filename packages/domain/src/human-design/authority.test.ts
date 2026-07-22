import { describe, expect, it } from "vitest";
import type { HumanDesignDefinedChannel } from "./definition";
import { deriveHumanDesignAuthority } from "./authority";

const channel = (
  overrides: Pick<HumanDesignDefinedChannel, "code" | "gates" | "centers">
): HumanDesignDefinedChannel => ({
  circuit: "collective",
  ...overrides
});

describe("Human Design authority derivation", () => {
  it("selects Lunar authority when no centers are defined", () => {
    expect(deriveHumanDesignAuthority([])).toEqual({
      authority: "lunar",
      basis: {
        definedCenters: [],
        priority: ["emotional", "sacral", "splenic", "ego", "self_projected", "mental", "lunar"],
        selectedBy: "no_defined_centers"
      }
    });
  });

  it("selects Emotional authority when Solar Plexus is defined", () => {
    expect(
      deriveHumanDesignAuthority([
        channel({ code: "59-6", gates: [59, 6], centers: ["sacral", "solar_plexus"] })
      ])
    ).toMatchObject({
      authority: "emotional",
      basis: {
        selectedBy: "solar_plexus_defined"
      }
    });
  });

  it("selects Sacral authority when Sacral is defined without Solar Plexus", () => {
    expect(
      deriveHumanDesignAuthority([
        channel({ code: "20-34", gates: [20, 34], centers: ["throat", "sacral"] })
      ])
    ).toMatchObject({
      authority: "sacral",
      basis: {
        selectedBy: "sacral_defined"
      }
    });
  });

  it("selects Splenic authority before Ego and Self-Projected authority", () => {
    expect(
      deriveHumanDesignAuthority([
        channel({ code: "10-57", gates: [10, 57], centers: ["g", "spleen"] }),
        channel({ code: "25-51", gates: [25, 51], centers: ["g", "heart"] }),
        channel({ code: "31-7", gates: [31, 7], centers: ["throat", "g"] })
      ])
    ).toMatchObject({
      authority: "splenic",
      basis: {
        selectedBy: "spleen_defined"
      }
    });
  });

  it("selects Ego authority when Heart is defined and higher authorities are absent", () => {
    expect(
      deriveHumanDesignAuthority([
        channel({ code: "45-21", gates: [45, 21], centers: ["throat", "heart"] })
      ])
    ).toMatchObject({
      authority: "ego",
      basis: {
        selectedBy: "heart_defined"
      }
    });
  });

  it("selects Self-Projected authority when G and Throat are connected without higher authorities", () => {
    expect(
      deriveHumanDesignAuthority([
        channel({ code: "31-7", gates: [31, 7], centers: ["throat", "g"] })
      ])
    ).toMatchObject({
      authority: "self_projected",
      basis: {
        selectedBy: "g_throat_connected"
      }
    });
  });

  it("selects Mental authority for defined charts without inner authority centers", () => {
    expect(
      deriveHumanDesignAuthority([
        channel({ code: "17-62", gates: [17, 62], centers: ["ajna", "throat"] })
      ])
    ).toMatchObject({
      authority: "mental",
      basis: {
        selectedBy: "defined_centers_without_inner_authority"
      }
    });
  });
});
