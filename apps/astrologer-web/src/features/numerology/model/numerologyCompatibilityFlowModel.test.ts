import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { createInitialNumerologyForm } from "./numerologyFormModel";
import {
  buildCompatibilityFormState,
  buildIndividualFormState,
  findExistingCalculationForParticipants,
  getFirstCompatibilityPartner
} from "./numerologyCompatibilityFlowModel";

describe("numerologyCompatibilityFlowModel", () => {
  it("selects the first CRM partner with birth data excluding the subject", () => {
    const subject = clientOption("subject-client", "Голубев Антон", "2000-08-19");

    expect(
      getFirstCompatibilityPartner(
        [
          subject,
          clientOption("missing-birth", "Без даты", null),
          clientOption("partner-client", "Марина Краснова", "1990-03-14")
        ],
        subject.value
      )?.value
    ).toBe("partner-client");
  });

  it("builds a compatibility form state from the active subject and partner clients", () => {
    const state = buildCompatibilityFormState(
      createInitialNumerologyForm(),
      clientOption("subject-client", "Голубев Антон", "2000-08-19"),
      clientOption("partner-client", "Марина Краснова", "1990-03-14")
    );

    expect(state).toMatchObject({
      mode: "compatibility",
      title: "Голубев Антон + Марина Краснова, совместимость",
      subject: {
        source: "crm_client",
        clientId: "subject-client",
        fullName: "Голубев Антон",
        birthDate: "2000-08-19"
      },
      partner: {
        source: "crm_client",
        clientId: "partner-client",
        fullName: "Марина Краснова",
        birthDate: "1990-03-14"
      }
    });
  });

  it("builds an individual form state from the active subject and clears partner mode", () => {
    const state = buildIndividualFormState(
      buildCompatibilityFormState(
        createInitialNumerologyForm(),
        clientOption("subject-client", "Голубев Антон", "2000-08-19"),
        clientOption("partner-client", "Марина Краснова", "1990-03-14")
      ),
      clientOption("subject-client", "Голубев Антон", "2000-08-19")
    );

    expect(state.mode).toBe("individual");
    expect(state.title).toBe("Голубев Антон, психоматрица");
    expect(state.partner).toMatchObject({ source: "manual", clientId: "", fullName: "" });
  });

  it("finds an existing saved compatibility calculation for the selected CRM pair", () => {
    const matching = calculationRecord({
      id: "matching",
      mode: "compatibility",
      subjectClientId: "subject-client",
      partnerClientId: "partner-client"
    });
    const reversed = calculationRecord({
      id: "reversed",
      mode: "compatibility",
      subjectClientId: "partner-client",
      partnerClientId: "subject-client"
    });

    expect(
      findExistingCalculationForParticipants([reversed, matching], {
        mode: "compatibility",
        subjectClientId: "subject-client",
        partnerClientId: "partner-client"
      })?.id
    ).toBe("matching");
  });
});

function clientOption(value: string, label: string, birthDate: string | null): ClientSelectOption {
  return {
    value,
    label,
    initials: label
      .split(" ")
      .map((part) => part[0])
      .join(""),
    subtitle: birthDate ?? "Дата рождения не заполнена",
    birthDateDisplay: birthDate ?? "—",
    hasBirthDate: Boolean(birthDate),
    birthData: birthDate
      ? {
          id: "55555555-5555-4555-8555-555555555555",
          clientUserId: value,
          label: "Основные данные",
          birthDate,
          birthTime: null,
          birthTimePrecision: "unknown",
          birthPlaceText: null,
          birthCountryCode: null,
          birthCity: null,
          birthRegion: null,
          birthTimezone: null,
          birthTimeDstOccurrence: null,
          birthLatitude: null,
          birthLongitude: null,
          source: "manual",
          isPrimary: true,
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        }
      : null
  };
}

function calculationRecord(input: {
  readonly id: string;
  readonly mode: "individual" | "compatibility";
  readonly subjectClientId: string;
  readonly partnerClientId?: string;
}): CalculationRecordResponse {
  const participants: CalculationRecordResponse["participants"] = [
    {
      role: "subject",
      source: "crm_client",
      clientId: input.subjectClientId,
      displayName: "Subject"
    }
  ];

  if (input.mode === "compatibility") {
    participants.push({
      role: "partner",
      source: "crm_client",
      clientId: input.partnerClientId ?? null,
      displayName: "Partner"
    });
  }

  return {
    id: input.id,
    ownerUserId: "owner",
    module: "numerology",
    mode: input.mode,
    methodCode: "pythagorean",
    title: input.id,
    status: "calculated",
    requestFingerprint: `sha256:${"a".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: `sha256:${"b".repeat(64)}`,
    participants,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z"
  };
}
