import type {
  CalculationRecordResponse,
  NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  buildNumerologyPageViewModel,
  getCurrentVersionInterpretation
} from "./numerologyPageModel";

describe("numerologyPageModel", () => {
  it("selects the latest interpretation for the current calculation version", () => {
    const calculation = calculationRecord({
      currentVersionIndex: 1,
      interpretations: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          text: "Old approved interpretation"
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          versionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          text: "Current draft interpretation"
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          text: "Newer old-version interpretation"
        }
      ]
    });

    expect(getCurrentVersionInterpretation(calculation)?.id).toBe(
      "22222222-2222-4222-8222-222222222222"
    );
  });

  it("builds publish disabled reason for unlinked CRM calculations", () => {
    const calculation = calculationRecord({
      currentVersionIndex: 0,
      participantSource: "crm_client",
      clientId: "66666666-6666-4666-8666-666666666666",
      interpretations: []
    });

    expect(buildNumerologyPageViewModel(responseFromCalculation(calculation), null, false)).toMatchObject({
      publishDisabled: true,
      publishDisabledReason: "Сначала привяжите расчет к клиенту"
    });
  });
});

function calculationRecord(input: {
  readonly currentVersionIndex: number;
  readonly participantSource?: "manual" | "crm_client";
  readonly clientId?: string | null;
  readonly interpretations: readonly {
    readonly id: string;
    readonly versionId: string;
    readonly text: string;
  }[];
}): NumerologyCalculationResponse["calculation"] {
  const versions: CalculationRecordResponse["versions"] = [
    version("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 1),
    version("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 2)
  ];

  return {
    id: "44444444-4444-4444-8444-444444444444",
    ownerUserId: "55555555-5555-4555-8555-555555555555",
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    currentMethodVersion: "1.0.0",
    title: "Мария",
    status: "calculated",
    participants: [
      {
        role: "subject",
        source: input.participantSource ?? "manual",
        clientId: input.clientId ?? null,
        displayName: "Мария",
        birthDate: "1990-03-14",
        inputSnapshot: { fullName: "Мария Иванова", birthDate: "1990-03-14" },
        manuallyOverridden: false
      }
    ],
    versions: versions.slice(0, input.currentVersionIndex + 1),
    links: [],
    interpretations: input.interpretations.map((interpretation) => ({
      ...interpretation,
      source: "manual",
      status: "draft",
      modelId: null,
      promptVersion: null,
      approvedAt: null
    })),
    artifacts: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z"
  };
}

function responseFromCalculation(
  calculation: NumerologyCalculationResponse["calculation"]
): NumerologyCalculationResponse {
  const currentVersion = calculation.versions.at(-1)!;

  return {
    calculation,
    currentVersion,
    resultSnapshot: currentVersion.resultSnapshot,
    settingsSnapshot: currentVersion.settingsSnapshot,
    inputSnapshot: currentVersion.inputSnapshot
  };
}

function version(
  id: string,
  versionNumber: number
): CalculationRecordResponse["versions"][number] {
  return {
    id,
    versionNumber,
    methodVersion: "1.0.0",
    settingsSnapshot: { includeNameNumbers: true },
    inputSnapshot: { mode: "individual" },
    resultSnapshot: {
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
      keyNumbers: { lifePath: 9 }
    },
    resultSummary: { keyNumbers: { lifePath: 9 } },
    resultChecksum: `checksum-${versionNumber}`,
    createdAt: "2026-07-06T00:00:00.000Z"
  };
}
