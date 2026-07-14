import { describe, expect, it } from "vitest";
import {
  createMatrixNoteRequestSchema,
  matrixInterpretationQuerySchema,
  matrixInterpretationResponseSchema,
  matrixNoteIdParamSchema,
  matrixNoteResponseSchema,
  matrixNotesResponseSchema,
  updateMatrixNoteRequestSchema
} from "./matrix-notes";

const calculationId = "00000000-0000-4000-8000-000000000001";
const noteId = "00000000-0000-4000-8000-000000000002";
const checksum = `sha256:${"a".repeat(64)}`;

describe("Matrix notes and interpretation contracts", () => {
  it("accepts bounded plain note mutations with an expected checksum", () => {
    const body = { text: "  Важно обсудить границы.  ", expectedResultChecksum: checksum };
    expect(createMatrixNoteRequestSchema.parse(body)).toEqual(body);
    expect(updateMatrixNoteRequestSchema.parse(body)).toEqual(body);
    expect(() => createMatrixNoteRequestSchema.parse({ ...body, text: "   " })).toThrow();
    expect(() =>
      createMatrixNoteRequestSchema.parse({ ...body, text: "x".repeat(10_001) })
    ).toThrow();
    expect(() => createMatrixNoteRequestSchema.parse({ ...body, visibility: "client" })).toThrow();
  });

  it("requires calculation and note UUID params", () => {
    expect(matrixNoteIdParamSchema.parse({ calculationId, noteId })).toEqual({
      calculationId,
      noteId
    });
    expect(() => matrixNoteIdParamSchema.parse({ calculationId: "bad", noteId })).toThrow();
  });

  it("parses current and stale private note responses", () => {
    const note = {
      id: noteId,
      calculationId,
      text: "Важно обсудить границы.",
      resultChecksum: checksum,
      stale: false,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z"
    } as const;
    expect(matrixNoteResponseSchema.parse({ note, currentResultChecksum: checksum })).toMatchObject(
      {
        note: { stale: false }
      }
    );
    expect(
      matrixNotesResponseSchema.parse({
        notes: [{ ...note, stale: true }],
        currentResultChecksum: `sha256:${"b".repeat(64)}`
      })
    ).toMatchObject({ notes: [{ stale: true }] });
  });

  it("accepts only supported interpretation query dimensions", () => {
    expect(
      matrixInterpretationQuerySchema.parse({ locale: "ru", arcana: "9", context: "portrait" })
    ).toEqual({ locale: "ru", arcana: 9, context: "portrait" });
    expect(() =>
      matrixInterpretationQuerySchema.parse({ locale: "de", arcana: 9, context: "portrait" })
    ).toThrow();
    expect(() =>
      matrixInterpretationQuerySchema.parse({ locale: "ru", arcana: 23, context: "portrait" })
    ).toThrow();
    expect(() =>
      matrixInterpretationQuerySchema.parse({ locale: "ru", arcana: 9, context: "medical" })
    ).toThrow();
  });

  it("parses a strict versioned interpretation entry", () => {
    const entry = {
      catalogRevision: 1,
      locale: "ru",
      arcana: 9,
      context: "portrait",
      title: "Отшельник — внутренний ориентир",
      constructive: "Способность углубляться и видеть суть.",
      shadow: "Риск закрыться от обратной связи.",
      reflectionQuestions: ["Где уединение помогает, а где ограничивает?"],
      practicalRecommendations: ["Запланировать время и для анализа, и для диалога."],
      reportSummary: "Глубина становится ресурсом, когда соединена с контактом."
    } as const;
    expect(matrixInterpretationResponseSchema.parse({ entry })).toEqual({ entry });
    expect(() =>
      matrixInterpretationResponseSchema.parse({ entry: { ...entry, catalogRevision: 2 } })
    ).toThrow();
  });
});
