import type { ClientBirthDataResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  createChartBirthDataDraft,
  reinitializeChartBirthDataDraft,
  toBirthDataUpsertRequest,
  updateChartBirthDataDraft
} from "./chartBirthDataDraft";

const clientA = "22222222-2222-4222-8222-222222222222";
const clientB = "55555555-5555-4555-8555-555555555555";

describe("chartBirthDataDraft", () => {
  it("reinitializes A to B and cannot submit A's draft into B", () => {
    const draftA = createChartBirthDataDraft(clientA, birthData(clientA, "1990-07-15"));

    expect(() => toBirthDataUpsertRequest(draftA, clientB)).toThrow(
      "CHART_BIRTH_DATA_DRAFT_CLIENT_MISMATCH"
    );
    expect(
      reinitializeChartBirthDataDraft(draftA, clientB, birthData(clientB, "1992-08-12"))
    ).toMatchObject({
      clientId: clientB,
      values: { birthDate: "1992-08-12" }
    });
  });

  it("preserves the current draft when the selected client did not change", () => {
    const draft = updateChartBirthDataDraft(createChartBirthDataDraft(clientA, null), {
      birthDate: "1990-07-15"
    });

    expect(reinitializeChartBirthDataDraft(draft, clientA, birthData(clientA, "1992-08-12"))).toBe(
      draft
    );
  });

  it.each([
    { birthDate: "1991-01-01" },
    { birthTime: "11:30" },
    { birthTimezone: "Europe/Paris" },
    { birthTimePrecision: "approximate" as const }
  ])("clears a stale DST occurrence when civil input changes", (patch) => {
    const draft = createChartBirthDataDraft(clientA, birthData(clientA, "1990-07-15"));

    expect(updateChartBirthDataDraft(draft, patch).values.birthTimeDstOccurrence).toBeNull();
  });

  it("normalizes unknown time precision and validates the shared upsert request", () => {
    const draft = updateChartBirthDataDraft(
      createChartBirthDataDraft(clientA, birthData(clientA, "1990-07-15")),
      { birthTimePrecision: "unknown" }
    );

    expect(toBirthDataUpsertRequest(draft, clientA)).toMatchObject({
      birthTime: null,
      birthTimePrecision: "unknown",
      birthTimeDstOccurrence: null
    });
  });
});

function birthData(clientUserId: string, birthDate: string): ClientBirthDataResponse {
  return {
    id: clientUserId,
    clientUserId,
    label: "Основные данные",
    birthDate,
    birthTime: "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: "Рим",
    birthCountryCode: "IT",
    birthCity: "Рим",
    birthRegion: "Лацио",
    birthTimezone: "Europe/Rome",
    birthTimeDstOccurrence: "first",
    birthLatitude: 41.9028,
    birthLongitude: 12.4964,
    source: "client_profile",
    revision: 1,
    lastEditedByUserId: clientUserId,
    lastEditedByRole: "client",
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z"
  };
}
