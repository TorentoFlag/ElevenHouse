import { describe, expect, it } from "vitest";
import type { HumanDesignDefinedChannel } from "./definition";
import { deriveHumanDesignType } from "./type";

const channel = (
  overrides: Pick<HumanDesignDefinedChannel, "code" | "gates" | "centers">
): HumanDesignDefinedChannel => ({
  circuit: "collective",
  ...overrides
});

describe("Human Design type derivation", () => {
  it("classifies Reflector when no centers are defined", () => {
    expect(deriveHumanDesignType([])).toEqual({
      type: "reflector",
      strategy: "wait_lunar_cycle",
      signature: "surprise",
      notSelfTheme: "disappointment",
      basis: {
        definedCenterCount: 0,
        sacralDefined: false,
        throatDefined: false,
        throatConnectedMotorCenters: []
      }
    });
  });

  it("classifies Generator when Sacral is defined without motor-to-Throat connection", () => {
    expect(
      deriveHumanDesignType([
        channel({ code: "15-5", gates: [15, 5], centers: ["g", "sacral"] })
      ])
    ).toMatchObject({
      type: "generator",
      strategy: "wait_to_respond",
      signature: "satisfaction",
      notSelfTheme: "frustration",
      basis: {
        sacralDefined: true,
        throatDefined: false,
        throatConnectedMotorCenters: []
      }
    });
  });

  it("classifies Manifesting Generator when Sacral is defined and a motor connects to Throat", () => {
    expect(
      deriveHumanDesignType([
        channel({ code: "20-34", gates: [20, 34], centers: ["throat", "sacral"] })
      ])
    ).toMatchObject({
      type: "manifesting_generator",
      strategy: "wait_to_respond",
      signature: "satisfaction",
      notSelfTheme: "frustration",
      basis: {
        sacralDefined: true,
        throatDefined: true,
        throatConnectedMotorCenters: ["sacral"]
      }
    });
  });

  it("classifies Manifestor when Sacral is open and a non-Sacral motor connects to Throat", () => {
    expect(
      deriveHumanDesignType([
        channel({ code: "45-21", gates: [45, 21], centers: ["throat", "heart"] })
      ])
    ).toMatchObject({
      type: "manifestor",
      strategy: "inform_before_acting",
      signature: "peace",
      notSelfTheme: "anger",
      basis: {
        sacralDefined: false,
        throatDefined: true,
        throatConnectedMotorCenters: ["heart"]
      }
    });
  });

  it("classifies Projector when Sacral is open and no motor connects to Throat", () => {
    expect(
      deriveHumanDesignType([
        channel({ code: "17-62", gates: [17, 62], centers: ["ajna", "throat"] }),
        channel({ code: "32-54", gates: [32, 54], centers: ["spleen", "root"] })
      ])
    ).toMatchObject({
      type: "projector",
      strategy: "wait_for_invitation",
      signature: "success",
      notSelfTheme: "bitterness",
      basis: {
        sacralDefined: false,
        throatDefined: true,
        throatConnectedMotorCenters: []
      }
    });
  });

  it("detects indirect motor-to-Throat paths through the defined channel graph", () => {
    expect(
      deriveHumanDesignType([
        channel({ code: "3-60", gates: [3, 60], centers: ["sacral", "root"] }),
        channel({ code: "30-41", gates: [30, 41], centers: ["solar_plexus", "root"] }),
        channel({ code: "35-36", gates: [35, 36], centers: ["throat", "solar_plexus"] })
      ])
    ).toMatchObject({
      type: "manifesting_generator",
      basis: {
        sacralDefined: true,
        throatDefined: true,
        throatConnectedMotorCenters: ["sacral", "root", "solar_plexus"]
      }
    });
  });
});
