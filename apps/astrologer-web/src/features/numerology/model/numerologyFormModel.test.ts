import { describe, expect, it } from "vitest";
import {
  createInitialNumerologyForm,
  getNumerologyFormErrors,
  toCreateNumerologyRequest,
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

  it("creates an individual Pythagorean request with versioned settings", () => {
    const request = toCreateNumerologyRequest(validState());

    expect(request).toMatchObject({
      mode: "individual",
      methodCode: "pythagorean",
      settings: {
        masterNumbers: { mode: "preserve_selected", values: [11, 22, 33] },
        includeNameNumbers: true,
        includePsychomatrix: true,
        includeStrengthLines: true
      }
    });
    expect(request.participants).toHaveLength(1);
  });

  it("requires two participants for compatibility mode", () => {
    const state = {
      ...validState(),
      mode: "compatibility",
      partner: {
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
      source: "manual",
      clientId: "",
      displayName: "",
      fullName: "Мария Иванова",
      birthDate: "1990-03-14"
    },
    partner: {
      source: "manual",
      clientId: "",
      displayName: "",
      fullName: "Алексей Петров",
      birthDate: "1988-11-02"
    }
  };
}
