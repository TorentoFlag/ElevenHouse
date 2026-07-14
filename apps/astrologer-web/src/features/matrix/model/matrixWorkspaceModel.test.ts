import { describe, expect, it } from "vitest";
import type { CalculationRecordResponse, MatrixData, MatrixReport } from "@elevenhouse/contracts";
import {
  createEmptyMatrixReportEditor,
  findExistingMatrixCalculation,
  getMatrixSelection,
  toMatrixReportEditor,
  toSaveMatrixReportRequest
} from "./matrixWorkspaceModel";

describe("matrixWorkspaceModel", () => {
  it("maps graph selectors to arcana and interpretation contexts", () => {
    expect(getMatrixSelection(matrix, "E")).toMatchObject({
      arcana: 9,
      label: "Портрет · Я",
      context: "portrait"
    });
    expect(getMatrixSelection(matrix, "zone:money")).toMatchObject({
      arcana: 19,
      label: "Деньги · самореализация",
      context: "money"
    });
    expect(getMatrixSelection(matrix, "energy:ajna")).toMatchObject({
      arcana: 8,
      label: "Аджна",
      context: "energy"
    });
  });

  it("finds a saved calculation only for the exact mode and ordered CRM participants", () => {
    const individual = calculation("individual", ["client-a"]);
    const compatibility = calculation("compatibility", ["client-a", "client-b"]);

    expect(
      findExistingMatrixCalculation([individual, compatibility], {
        mode: "compatibility",
        subjectClientId: "client-a",
        partnerClientId: "client-b"
      })
    ).toBe(compatibility);
    expect(
      findExistingMatrixCalculation([individual, compatibility], {
        mode: "compatibility",
        subjectClientId: "client-b",
        partnerClientId: "client-a"
      })
    ).toBeNull();
  });

  it("round-trips editable report fields without inventing report data", () => {
    const empty = createEmptyMatrixReportEditor("ru");
    expect(empty.overview).toBe("");
    expect(empty.reflectionQuestions).toBe("");

    const report = {
      locale: "ru",
      status: "ready",
      content: {
        overview: "Обзор",
        corePortrait: "Портрет",
        strengthsAndTalents: "Таланты",
        growthAreas: "Рост",
        moneyAndRealization: "Деньги",
        relationships: "Отношения",
        lineageThemes: "Род",
        purposes: "Предназначения",
        yearProjection: null,
        reflectionQuestions: ["Вопрос 1", "Вопрос 2"],
        practicalSteps: ["Шаг 1"],
        disclaimer: "Для саморефлексии"
      }
    } as MatrixReport;
    const editor = toMatrixReportEditor(report);

    expect(editor.reflectionQuestions).toBe("Вопрос 1\nВопрос 2");
    expect(toSaveMatrixReportRequest(editor, `sha256:${"a".repeat(64)}`)).toMatchObject({
      status: "ready",
      content: {
        reflectionQuestions: ["Вопрос 1", "Вопрос 2"],
        practicalSteps: ["Шаг 1"],
        yearProjection: null
      }
    });
  });
});

const matrix: MatrixData = {
  points: {
    A: 14,
    B: 3,
    C: 19,
    D: 9,
    E: 9,
    tl: 17,
    tr: 22,
    br: 10,
    bl: 5,
    A1: 5,
    B1: 12,
    C1: 10,
    D1: 18,
    tl1: 8,
    tr1: 4,
    br1: 19,
    bl1: 14
  },
  purposes: { earth: 11, sky: 12, male: 5, female: 13, personal: 18, social: 18, spiritual: 9 },
  zones: { purpose: 18, money: 19, love: 14, energy: 12 },
  energyMap: {
    rows: [
      { code: "sahasrara", physical: 3, energy: 12, emotions: 15 },
      { code: "ajna", physical: 22, energy: 4, emotions: 8 },
      { code: "vishuddha", physical: 19, energy: 10, emotions: 11 },
      { code: "anahata", physical: 10, energy: 19, emotions: 11 },
      { code: "manipura", physical: 9, energy: 18, emotions: 9 },
      { code: "svadhisthana", physical: 5, energy: 14, emotions: 19 },
      { code: "muladhara", physical: 14, energy: 5, emotions: 19 }
    ],
    totals: { physical: 10, energy: 10, emotions: 20 }
  }
};

function calculation(mode: "individual" | "compatibility", clientIds: readonly string[]) {
  return {
    id: `${mode}-id`,
    module: "matrix",
    mode,
    participants: clientIds.map((clientId, index) => ({
      role: index === 0 ? "subject" : "partner",
      source: "crm_client",
      clientId
    }))
  } as CalculationRecordResponse;
}
