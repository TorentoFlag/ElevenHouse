import { describe, expect, it } from "vitest";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { chartEngineCopyByLocale } from "./chartEngineCopy";
import {
  attachChartEngineSubmissionTarget,
  prepareChartEngineSubmission
} from "./chartEngineSubmissionRequest";

describe("chartEngineSubmissionRequest", () => {
  it("prepares horary without requiring client birth data", () => {
    expect(
      prepareChartEngineSubmission({
        ...baseInput,
        mode: "horary",
        selectedClient: { ...client, birthData: null }
      })
    ).toEqual({
      kind: "ready",
      draft: {
        mode: "horary",
        clientId: client.value,
        settings,
        question: {
          question: "Should I sign?",
          category: "career",
          date: "2026-08-03",
          time: "12:00",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173
        }
      }
    });
  });

  it("blocks a same-client relationship calculation with typed locale copy", () => {
    expect(
      prepareChartEngineSubmission({
        ...baseInput,
        mode: "synastry",
        selectedPartnerClient: client
      })
    ).toEqual({
      kind: "blocked",
      message: "Choose another client for synastry"
    });
  });

  it("prepares a related birth profile as a typed relationship partner", () => {
    expect(
      prepareChartEngineSubmission({
        ...baseInput,
        mode: "synastry",
        selectedPartnerOption: {
          source: "client_related_profile",
          profile: relatedProfile
        }
      })
    ).toEqual({
      kind: "ready",
      draft: {
        mode: "synastry",
        clientId: client.value,
        partner: {
          source: "client_related_profile",
          relatedProfileId: relatedProfile.id
        },
        settings
      }
    });
  });

  it("keeps the exact recalculation identity when attaching the target", () => {
    const preparation = prepareChartEngineSubmission({
      ...baseInput,
      mode: "progression"
    });
    if (preparation.kind !== "ready") throw new Error(preparation.message);

    expect(
      attachChartEngineSubmissionTarget(preparation.draft, {
        calculationId: "44444444-4444-4444-8444-444444444444",
        expectedResultChecksum: `sha256:${"a".repeat(64)}`
      })
    ).toMatchObject({
      mode: "progression",
      targetDate: "2026-08-04",
      calculationId: "44444444-4444-4444-8444-444444444444",
      expectedResultChecksum: `sha256:${"a".repeat(64)}`
    });
  });
});

const client = {
  value: "22222222-2222-4222-8222-222222222222",
  label: "Marina Krasnova",
  initials: "MK",
  subtitle: "15 Jul 1990 · Rome",
  birthDateDisplay: "15 Jul 1990",
  hasBirthDate: true,
  birthData: {
    id: "55555555-5555-4555-8555-555555555555",
    clientUserId: "22222222-2222-4222-8222-222222222222",
    label: null,
    birthDate: "1990-07-15",
    birthTime: "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: "Rome, Italy",
    birthCountryCode: "IT",
    birthCity: "Rome",
    birthRegion: null,
    birthTimezone: "Europe/Rome",
    birthTimeDstOccurrence: null,
    birthLatitude: 41.9028,
    birthLongitude: 12.4964,
    source: "manual",
    revision: 1,
    lastEditedByUserId: "22222222-2222-4222-8222-222222222222",
    lastEditedByRole: "client",
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z"
  }
} satisfies ClientSelectOption;

const settings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
} as const;

const relatedProfile = {
  id: "66666666-6666-4666-8666-666666666666",
  clientUserId: client.value,
  displayName: "Ivan Ivanov",
  relationshipLabel: "husband",
  birthDate: "1988-07-22",
  birthTime: "09:15",
  birthTimePrecision: "exact",
  birthPlaceText: "Kaliningrad, Russia",
  birthCountryCode: "RU",
  birthCity: "Kaliningrad",
  birthRegion: null,
  birthTimezone: "Europe/Kaliningrad",
  birthTimeDstOccurrence: null,
  birthLatitude: 54.7104,
  birthLongitude: 20.4522,
  source: "manual",
  revision: 1,
  lastEditedByUserId: client.value,
  lastEditedByRole: "astrologer",
  createdAt: "2026-08-03T10:00:00.000Z",
  updatedAt: "2026-08-03T10:00:00.000Z"
} as const;

const baseInput = {
  mode: "natal" as const,
  selectedClient: client,
  selectedPartnerClient: null,
  settings,
  transitMoment: { date: "2026-08-03", time: "12:00" },
  solarReturnYear: 2026,
  progressionTargetDate: "2026-08-04",
  horaryQuestion: {
    question: "Should I sign?",
    category: "career" as const,
    date: "2026-08-03",
    time: "12:00",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  },
  locale: "en" as const,
  copy: chartEngineCopyByLocale.en.controller
};
