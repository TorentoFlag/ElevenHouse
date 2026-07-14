import { describe, expect, it } from "vitest";
import { LADINI_22_GOLDEN_FIXTURES } from "../ladini-22/golden-fixtures";
import { calculateLadini22Compatibility } from "../ladini-22/compatibility";
import type { MatrixNote } from "../matrix-note-types";
import type { MatrixDerivedProjection } from "../matrix-types";
import { buildMatrixReportAiContext } from "./report-context";

const checksum = `sha256:${"a".repeat(64)}`;
const staleChecksum = `sha256:${"b".repeat(64)}`;

describe("Matrix report AI context", () => {
  it("contains only allowed Matrix facts, catalog summaries and selected current note excerpts", () => {
    const result = LADINI_22_GOLDEN_FIXTURES[0]!.expected;
    const context = buildMatrixReportAiContext({
      locale: "ru",
      result,
      resultChecksum: checksum,
      notes: [note("selected", checksum, "  Обратить внимание на личные границы.  "), note("other", checksum, "Секрет")],
      selectedNoteIds: ["selected"],
      projection: projection()
    });

    expect(context.participants).toEqual([{ role: "subject", label: "Марина" }]);
    expect(context.selectedNotes).toEqual([
      { id: "selected", text: "Обратить внимание на личные границы." }
    ]);
    expect(context.interpretations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ context: "portrait", arcana: 9, catalogRevision: 1 }),
        expect.objectContaining({ context: "money", arcana: 19, catalogRevision: 1 }),
        expect.objectContaining({ context: "forecast", arcana: 7, catalogRevision: 1 })
      ])
    );
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("1990-03-14");
    expect(serialized).not.toContain("clientId");
    expect(serialized).not.toContain("ownerUserId");
    expect(serialized).not.toContain("Краснова");
    expect(serialized).not.toContain("Секрет");
  });

  it("rejects unknown and stale selected notes", () => {
    const result = LADINI_22_GOLDEN_FIXTURES[0]!.expected;
    expect(() =>
      buildMatrixReportAiContext({
        locale: "ru",
        result,
        resultChecksum: checksum,
        notes: [note("stale", staleChecksum, "Старое наблюдение")],
        selectedNoteIds: ["stale"],
        projection: null
      })
    ).toThrow("current Matrix result");
    expect(() =>
      buildMatrixReportAiContext({
        locale: "ru",
        result,
        resultChecksum: checksum,
        notes: [],
        selectedNoteIds: ["missing"],
        projection: null
      })
    ).toThrow("not found");
  });

  it("is deterministic and represents compatibility without disclosing surnames or dates", () => {
    const result = calculateLadini22Compatibility({
      first: { displayName: "Марина Краснова", birthDate: "1990-03-14" },
      second: { displayName: "Алексей Иванов", birthDate: "1988-09-07" }
    });
    const input = {
      locale: "en" as const,
      result,
      resultChecksum: checksum,
      notes: [] as readonly MatrixNote[],
      selectedNoteIds: [] as readonly string[],
      projection: null
    };
    const first = buildMatrixReportAiContext(input);
    expect(buildMatrixReportAiContext(input)).toEqual(first);
    expect(first.participants).toEqual([
      { role: "subject", label: "Марина" },
      { role: "partner", label: "Алексей" }
    ]);
    expect(first.interpretations.some((entry) => entry.context === "compatibility")).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/Краснова|Иванов|1990|1988/);
  });

  it("bounds selected note data before it reaches the provider", () => {
    const result = LADINI_22_GOLDEN_FIXTURES[0]!.expected;
    const context = buildMatrixReportAiContext({
      locale: "ru",
      result,
      resultChecksum: checksum,
      notes: [note("long", checksum, `  ${"я".repeat(2_100)}  `)],
      selectedNoteIds: ["long"],
      projection: null
    });
    expect(context.selectedNotes[0]!.text).toHaveLength(2_000);
  });
});

function note(id: string, resultChecksum: string, text: string): MatrixNote {
  return {
    id,
    calculationId: "calculation-id",
    ownerUserId: "owner-id",
    text,
    resultChecksum,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  };
}

function projection(): MatrixDerivedProjection {
  return {
    methodCode: "ladini_22",
    engineRevision: 1,
    timezone: "Europe/Moscow",
    currentDate: "2026-07-14",
    participant: { displayName: "Марина Краснова", birthDate: "1990-03-14" },
    ageCycle: { age: 36, cycleAge: 36, decadeIndex: 3, pointCode: "tr", arcana: 22 },
    yearForecast: { year: 2027, personalYear: 7, challenge: 16, resource: 21 }
  };
}
