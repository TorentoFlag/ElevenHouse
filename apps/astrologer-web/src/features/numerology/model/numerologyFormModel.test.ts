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
  it("validates required participant fields without requiring a preview title", () => {
    const state = createInitialNumerologyForm();

    expect(getNumerologyFormErrors(state)).toEqual([
      "Клиент: введите полное имя",
      "Клиент: укажите дату рождения"
    ]);
  });

  it("creates an individual Pythagorean request without client-side method settings", () => {
    const request = toCreateNumerologyRequest(validCrmState());

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
      ...validCrmState(),
      subject: {
        ...validCrmState().subject,
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

  it("previews manual input without a title or persistence validation", () => {
    const state = { ...validState(), title: "" };

    expect(toPreviewNumerologyRequest(state)).toMatchObject({
      mode: "individual",
      participants: [{ source: "manual", calculationName: "Мария Иванова" }]
    });
  });

  it("derives a compatibility title when persisting a mixed preview", () => {
    const state = {
      ...validState(),
      mode: "compatibility" as const,
      title: "",
      subject: validCrmState().subject
    };

    expect(toCreateNumerologyRequest(state)).toMatchObject({
      title: "Голубев Антон + Алексей Петров, совместимость"
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

function validCrmState(): NumerologyFormState {
  return {
    ...validState(),
    subject: {
      ...createParticipantFormState("crm_client"),
      source: "crm_client",
      clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
      displayName: "Голубев Антон",
      fullName: "Голубев Антон",
      birthDate: "2000-08-19"
    }
  };
}
