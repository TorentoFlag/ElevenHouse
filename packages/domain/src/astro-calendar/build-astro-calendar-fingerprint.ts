import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import type {
  AstroCalendarGenerationFingerprint,
  AstroCalendarSettingsFingerprintInput
} from "./astro-calendar-types";

export function buildAstroCalendarFingerprint(
  input: AstroCalendarSettingsFingerprintInput
): AstroCalendarGenerationFingerprint {
  return {
    algorithm: "sha256",
    canonicalization: "json-stable-v1",
    scope: "astro-calendar-generation.v1",
    value: sha256CanonicalJson(buildAstroCalendarFingerprintPayload(input))
  };
}

export function buildAstroCalendarFingerprintPayload(
  input: AstroCalendarSettingsFingerprintInput
): CanonicalJson {
  return {
    scope: "astro-calendar-generation.v1",
    astrologerId: input.astrologerId,
    range: {
      start: input.range.start,
      end: input.range.end
    },
    timeZone: input.timeZone,
    clientIds: [...new Set(input.clientIds)].sort(),
    eventTypes: [...new Set(input.eventTypes)].sort(),
    settings: input.settings
  };
}
