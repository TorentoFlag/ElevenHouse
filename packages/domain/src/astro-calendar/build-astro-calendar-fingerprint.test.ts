import { describe, expect, it } from "vitest";

import { buildAstroCalendarFingerprint } from "./build-astro-calendar-fingerprint";

const baseInput = {
  astrologerId: "11111111-1111-4111-8111-111111111111",
  range: {
    start: "2026-07-01",
    end: "2026-07-30"
  },
  timeZone: "Europe/Moscow",
  clientIds: ["33333333-3333-4333-8333-333333333333", "22222222-2222-4222-8222-222222222222"],
  eventTypes: ["client.birthday", "global.ingress"],
  settings: {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  }
} as const;

describe("buildAstroCalendarFingerprint", () => {
  it("is stable for reordered client and event filters", () => {
    const first = buildAstroCalendarFingerprint(baseInput);
    const second = buildAstroCalendarFingerprint({
      ...baseInput,
      clientIds: [...baseInput.clientIds].reverse(),
      eventTypes: [...baseInput.eventTypes].reverse()
    });

    expect(first).toEqual(second);
    expect(first).toEqual({
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "astro-calendar-generation.v1",
      value: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
  });

  it("changes when a generation input changes", () => {
    const original = buildAstroCalendarFingerprint(baseInput);

    expect(
      buildAstroCalendarFingerprint({
        ...baseInput,
        timeZone: "Europe/Rome"
      })
    ).not.toEqual(original);
    expect(
      buildAstroCalendarFingerprint({
        ...baseInput,
        settings: { ...baseInput.settings, houseSystem: "whole_sign" }
      })
    ).not.toEqual(original);
  });
});
