import { describe, expect, it } from "vitest";
import { buildHumanDesignCompatibilityResult } from "./compatibility";
import { HUMAN_DESIGN_APPROVED_FIXTURES } from "./fixtures/approved-fixtures";
import { buildHumanDesignIndividualBaseResult } from "./individual";
import { buildHumanDesignTransitResult } from "./transit";
import { buildHumanDesignAiContext } from "./ai-context";

describe("humanDesignAiContext", () => {
  it("builds an anonymous individual context without raw birth or longitude data", () => {
    const result = individual(0);
    const context = buildHumanDesignAiContext({
      locale: "ru",
      result,
      resultChecksum: result.resultChecksum.value
    });
    const serialized = JSON.stringify(context);

    expect(context.subject).toMatchObject({
      type: result.type,
      authority: result.authority,
      profile: result.profile.code
    });
    expect(context.subject.definedChannels).toEqual(result.definedChannels.map((item) => item.code));
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("inputFingerprint");
    expect(serialized).not.toContain("birth");
    expect(serialized).not.toContain("Amsterdam");
  });

  it("adds compatibility dynamics without participant names", () => {
    const compatibility = buildHumanDesignCompatibilityResult({
      subject: individual(0),
      partner: individual(1)
    });
    const context = buildHumanDesignAiContext({
      locale: "en",
      result: compatibility,
      resultChecksum: compatibility.resultChecksum.value
    });

    expect(context.mode).toBe("compatibility");
    expect(context.partner?.profile).toBe(compatibility.participants.partner.profile.code);
    expect(context.compatibility?.dynamicCounts).toEqual(compatibility.dynamicCounts);
    expect(JSON.stringify(context)).not.toContain("displayName");
  });

  it("binds optional transit context to the current natal checksum", () => {
    const result = individual(0);
    const transit = buildHumanDesignTransitResult({
      natal: result,
      transit: HUMAN_DESIGN_APPROVED_FIXTURES[1]!.input.personality,
      transitSnapshot: {
        instant: "2026-07-23T09:15:00.000Z",
        date: "2026-07-23",
        time: "12:15",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      }
    });
    const context = buildHumanDesignAiContext({
      locale: "ru",
      result,
      resultChecksum: result.resultChecksum.value,
      transit
    });

    expect(context.transit?.snapshot).toEqual({
      instant: "2026-07-23T09:15:00.000Z",
      date: "2026-07-23",
      time: "12:15",
      timezone: "Europe/Moscow"
    });
    expect(context.transit?.summary.transitActivationCount).toBe(13);
    expect(() =>
      buildHumanDesignAiContext({
        locale: "ru",
        result: individual(1),
        resultChecksum: individual(1).resultChecksum.value,
        transit
      })
    ).toThrow("not bound");
  });
});

function individual(index: number) {
  return buildHumanDesignIndividualBaseResult(HUMAN_DESIGN_APPROVED_FIXTURES[index]!.input);
}
