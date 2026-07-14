import { describe, expect, it } from "vitest";
import {
  createInitialNumerologyForm,
  createParticipantFormState,
  getNumerologyFormErrors,
  toCreateNumerologyRequest,
  toPreviewNumerologyRequest,
  type NumerologyFormState
} from "./numerologyFormModel";

describe("numerologyFormModel", () => {
  it("validates required participant fields", () => {
    const state = createInitialNumerologyForm();

    expect(getNumerologyFormErrors(state)).toEqual([
      "Введите название расчета",
      "Клиент: введите полное имя",
      "Клиент: укажите дату рождения"
    ]);
  });

  it("creates an individual Pythagorean request without client-side method settings", () => {
    const request = toCreateNumerologyRequest(validState());

    expect(request).toMatchObject({
      mode: "individual",
      methodCode: "pythagorean",
      periodRequest: { kind: "current_year" }
    });
    expect(request.participants).toHaveLength(1);
    expect(request).not.toHaveProperty("settings");
  });

  it("sends only the CRM identity and keeps preview free of persistence metadata", () => {
    const state = {
      ...validState(),
      subject: {
        ...validState().subject,
        source: "crm_client" as const,
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
        displayName: "Голубев Антон",
        fullName: "Stale browser name",
        birthDate: "1999-01-01"
      }
    };

    const persisted = toCreateNumerologyRequest(state);
    const preview = toPreviewNumerologyRequest(state);

    expect(persisted.participants[0]).toEqual({
      role: "subject",
      source: "crm_client",
      clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
    });
    expect(preview).not.toHaveProperty("title");
  });

  it("uses an explicit preview period without adding a personal day", () => {
    const request = toPreviewNumerologyRequest(validState(), {
      kind: "explicit",
      personalYear: { year: 2027 },
      personalMonths: { year: 2027 }
    });

    expect(request.periodRequest).toEqual({
      kind: "explicit",
      personalYear: { year: 2027 },
      personalMonths: { year: 2027 }
    });
  });

  it("requires two participants for compatibility mode", () => {
    const state = {
      ...validState(),
      mode: "compatibility",
      partner: {
        ...createParticipantFormState("manual"),
        ...validState().partner,
        fullName: "",
        birthDate: ""
      }
    } satisfies NumerologyFormState;

    expect(getNumerologyFormErrors(state)).toContain("Партнер: введите полное имя");
    expect(() => toCreateNumerologyRequest(state)).toThrow();
  });
});

function validState(): NumerologyFormState {
  return {
    ...createInitialNumerologyForm(),
    title: "Мария, психоматрица",
    subject: {
      ...createParticipantFormState("manual"),
      source: "manual",
      clientId: "",
      displayName: "",
      fullName: "Мария Иванова",
      birthDate: "1990-03-14"
    },
    partner: {
      ...createParticipantFormState("manual"),
      source: "manual",
      clientId: "",
      displayName: "",
      fullName: "Алексей Петров",
      birthDate: "1988-11-02"
    }
  };
}
