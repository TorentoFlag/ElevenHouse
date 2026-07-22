import { describe, expect, it } from "vitest";
import type { HumanDesignBasePlanetaryLongitudes } from "./activations";
import {
  buildHumanDesignResolvedInputFingerprintPayload,
  createHumanDesignResolvedInputFingerprint
} from "./input-fingerprint";

const longitudes = (
  overrides: Partial<HumanDesignBasePlanetaryLongitudes> = {}
): HumanDesignBasePlanetaryLongitudes => ({
  sun: 302,
  moon: 60,
  north_node: 10,
  mercury: 240,
  venus: 11,
  mars: 12,
  jupiter: 13,
  saturn: 14,
  uranus: 15,
  neptune: 16,
  pluto: 17,
  ...overrides
});

describe("Human Design resolved input fingerprint", () => {
  it("builds a metadata-scoped payload from resolved longitudes", () => {
    expect(
      buildHumanDesignResolvedInputFingerprintPayload({
        personality: longitudes({ sun: 302 }),
        design: longitudes({ sun: 242 })
      })
    ).toMatchObject({
      methodCode: "human_design_classic",
      engineRevision: 1,
      schemaVersion: "human-design-result.v1",
      mode: "individual",
      resolvedLongitudes: {
        personality: { sun: 302 },
        design: { sun: 242 }
      }
    });
  });

  it("returns the same fingerprint for equivalent longitude objects with different key insertion order", () => {
    const first = createHumanDesignResolvedInputFingerprint({
      personality: longitudes({ sun: 302, moon: 60 }),
      design: longitudes({ sun: 242, moon: 61 })
    });
    const second = createHumanDesignResolvedInputFingerprint({
      personality: { ...longitudes({ moon: 60 }), sun: 302 },
      design: { ...longitudes({ moon: 61 }), sun: 242 }
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-individual-resolved-input.v1"
    });
    expect(first.value).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("changes fingerprint when any resolved longitude changes", () => {
    expect(
      createHumanDesignResolvedInputFingerprint({
        personality: longitudes({ sun: 302 }),
        design: longitudes({ sun: 242 })
      })
    ).not.toEqual(
      createHumanDesignResolvedInputFingerprint({
        personality: longitudes({ sun: 302.1 }),
        design: longitudes({ sun: 242 })
      })
    );
  });
});
