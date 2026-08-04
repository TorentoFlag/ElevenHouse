import type {
  CalculationRecordResponse,
  NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  createNewNumerologyEditorState,
  createRecalculationEditorState,
  getActiveNumerologyCalculations,
  toNumerologyCreateRequest,
  toNumerologyRecalculateRequest,
  toSavedCalculationListItem,
  updateNumerologyEditorParticipant
} from "./numerologySavedWorkspaceModel";

describe("numerologySavedWorkspaceModel", () => {
  it("keeps active calculations ordered by their latest update", () => {
    const older = calculation({
      id: "11111111-1111-4111-8111-111111111111",
      links: [clientLink("44444444-4444-4444-8444-444444444444")],
      updatedAt: "2026-07-01T10:00:00.000Z"
    });
    const newer = calculation({
      id: "22222222-2222-4222-8222-222222222222",
      links: [clientLink("55555555-5555-4555-8555-555555555555")],
      updatedAt: "2026-07-02T10:00:00.000Z"
    });
    const unlinked = calculation({
      id: "44444444-4444-4444-8444-444444444444",
      updatedAt: "2026-07-04T10:00:00.000Z"
    });
    const archived = calculation({
      id: "33333333-3333-4333-8333-333333333333",
      status: "archived",
      updatedAt: "2026-07-03T10:00:00.000Z"
    });

    expect(
      getActiveNumerologyCalculations([older, archived, unlinked, newer]).map((item) => item.id)
    ).toEqual([newer.id, older.id]);
  });

  it("builds saved-list metadata from stored participants", () => {
    expect(toSavedCalculationListItem(calculation({}))).toMatchObject({
      title: "Мария, психоматрица",
      participantLabel: "Мария Иванова",
      modeLabel: "Личный расчёт"
    });
  });

  it("starts a blank manual individual calculation", () => {
    const editor = createNewNumerologyEditorState();

    expect(editor.kind).toBe("create");
    expect(editor.calculationId).toBeNull();
    expect(editor.form).toMatchObject({
      mode: "individual",
      subject: { source: "manual", fullName: "", birthDate: "" }
    });
  });

  it("prefills a new calculation with the current CRM subject", () => {
    const subject = {
      ...createNewNumerologyEditorState().form.subject,
      source: "crm_client" as const,
      clientId: "44444444-4444-4444-8444-444444444444",
      displayName: "Антон Голубев",
      fullName: "Антон Голубев",
      birthDate: "2000-08-19"
    };

    expect(createNewNumerologyEditorState(subject).form.subject).toEqual(subject);
  });

  it("rehydrates the current record for replacement recalculation", () => {
    const saved = calculation({});
    const editor = createRecalculationEditorState(saved);

    expect(editor.kind).toBe("recalculate");
    expect(editor.calculationId).toBe(saved.id);
    expect(editor.form).toMatchObject({
      title: saved.title,
      mode: "individual",
      subject: {
        source: "manual",
        fullName: "Мария Иванова",
        birthDate: "1990-03-14"
      }
    });
  });

  it("changes a participant source without mutating the prior editor", () => {
    const editor = createNewNumerologyEditorState();
    const next = updateNumerologyEditorParticipant(editor, "subject", {
      source: "crm_client",
      clientId: "44444444-4444-4444-8444-444444444444",
      displayName: "Антон Голубев"
    });

    expect(editor.form.subject.source).toBe("manual");
    expect(next.form.subject).toMatchObject({
      source: "crm_client",
      clientId: "44444444-4444-4444-8444-444444444444",
      displayName: "Антон Голубев"
    });
  });

  it("projects explicit create and replacement requests", () => {
    const createEditor = updateNumerologyEditorParticipant(
      createNewNumerologyEditorState(),
      "subject",
      {
        source: "crm_client",
        clientId: "44444444-4444-4444-8444-444444444444",
        fullName: "Мария Иванова",
        displayName: "Мария Иванова",
        birthDate: "1990-03-14"
      }
    );
    const titledCreate = {
      ...createEditor,
      form: { ...createEditor.form, title: "Мария, психоматрица" }
    };
    const recalculateEditor = createRecalculationEditorState(calculation({}));

    expect(toNumerologyCreateRequest(titledCreate)).toMatchObject({
      title: "Мария, психоматрица",
      mode: "individual",
      participants: [
        {
          source: "crm_client",
          clientId: "44444444-4444-4444-8444-444444444444"
        }
      ]
    });
    expect(toNumerologyRecalculateRequest(recalculateEditor)).toMatchObject({
      title: "Мария, психоматрица",
      mode: "individual",
      participants: [{ source: "manual", calculationName: "Мария Иванова" }]
    });
  });
});

function calculation(overrides: Partial<CalculationRecordResponse>): CalculationRecordResponse {
  const result = individualResult();
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    module: "numerology",
    mode: "individual",
    interpretationMode: null,
    methodCode: "pythagorean",
    title: "Мария, психоматрица",
    status: "calculated",
    requestFingerprint: `sha256:${"a".repeat(64)}`,
    inputData: {
      participants: [
        {
          role: "subject",
          source: "manual",
          clientId: null,
          displayName: "Мария Иванова",
          calculationName: "Мария Иванова",
          calculationNameSource: "manual_entry",
          birthDate: "1990-03-14"
        }
      ],
      periods: {}
    },
    resultData: result,
    resultSummary: {},
    resultChecksum: `sha256:${"b".repeat(64)}`,
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        displayName: "Мария Иванова"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    ...overrides
  } as CalculationRecordResponse;
}

function clientLink(clientId: string): CalculationRecordResponse["links"][number] {
  return {
    clientId,
    visibility: "private_to_astrologer",
    linkedAt: "2026-07-01T10:00:00.000Z",
    publishedAt: null
  };
}

function individualResult(): NumerologyCalculationResponse["result"] {
  return {
    methodCode: "pythagorean",
    mode: "individual",
    participant: {
      calculationName: "Мария Иванова",
      calculationNameSource: "manual_entry",
      birthDate: "1990-03-14"
    },
    keyNumbers: { lifePath: 9, birthday: 5, expression: 9, soul: 3, personality: 6 },
    periods: {},
    psychomatrix: {
      sourceDigits: [1, 4, 0, 3, 1, 9, 9, 0],
      workingNumbers: { first: 27, second: 9, third: 25, fourth: 7 },
      cells: {
        "1": "11",
        "2": "",
        "3": "3",
        "4": "4",
        "5": "",
        "6": "",
        "7": "7",
        "8": "",
        "9": "999"
      }
    },
    strengthLines: [
      ["goal", "Целеустремлённость", ["1", "4", "7"]],
      ["family", "Семейность", ["2", "5", "8"]],
      ["stability", "Стабильность", ["3", "6", "9"]],
      ["self_esteem", "Самооценка", ["1", "2", "3"]],
      ["material", "Материя и быт", ["4", "5", "6"]],
      ["talent", "Талант", ["7", "8", "9"]],
      ["spirituality", "Духовность", ["1", "5", "9"]],
      ["temperament", "Темперамент", ["3", "5", "7"]]
    ].map(([code, label, cells]) => ({
      code,
      label,
      cells,
      value: 1,
      level: "weak",
      levelLabel: "Слабая линия"
    })) as never
  } as NumerologyCalculationResponse["result"];
}
