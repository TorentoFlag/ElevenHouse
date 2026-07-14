import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CalculationRecord, CalculationStore, MatrixNoteStore } from "@elevenhouse/domain";
import {
  matrixInterpretationResponseSchema,
  matrixNoteResponseSchema,
  matrixNotesResponseSchema
} from "@elevenhouse/contracts";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { MatrixNotesService } from "./matrix-notes.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const noteId = "00000000-0000-4000-8000-000000000003";
const currentChecksum = `sha256:${"b".repeat(64)}`;
const previousChecksum = `sha256:${"a".repeat(64)}`;
const now = new Date("2026-07-14T12:00:00.000Z");

describe("MatrixNotesService", () => {
  it("lists notes only for an owned saved Matrix and derives stale after recalculation", async () => {
    const notes = createNoteStore({ resultChecksum: previousChecksum });
    const response = await createService({ notes }).list(calculationId, request());

    matrixNotesResponseSchema.parse(response);
    expect(notes.listByCalculation).toHaveBeenCalledWith({ ownerUserId, calculationId });
    expect(response).toMatchObject({
      currentResultChecksum: currentChecksum,
      notes: [{ id: noteId, resultChecksum: previousChecksum, stale: true }]
    });
    expect(notes.delete).not.toHaveBeenCalled();
  });

  it("creates and updates only when the expected checksum is current", async () => {
    const notes = createNoteStore();
    const service = createService({ notes });
    const created = await service.create(
      calculationId,
      { text: "  Проверить границы. ", expectedResultChecksum: currentChecksum },
      request()
    );
    const updated = await service.update(
      calculationId,
      noteId,
      { text: "  Новый вывод. ", expectedResultChecksum: currentChecksum },
      request()
    );

    matrixNoteResponseSchema.parse(created);
    matrixNoteResponseSchema.parse(updated);
    expect(notes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        calculationId,
        text: "Проверить границы.",
        resultChecksum: currentChecksum
      })
    );
    expect(notes.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        calculationId,
        noteId,
        text: "Новый вывод.",
        resultChecksum: currentChecksum
      })
    );
  });

  it("rejects stale create and update requests without writing", async () => {
    const notes = createNoteStore();
    const service = createService({ notes });

    await expectHttpCode(
      service.create(
        calculationId,
        { text: "Текст", expectedResultChecksum: previousChecksum },
        request()
      ),
      409,
      "MATRIX_RESULT_CHANGED"
    );
    await expectHttpCode(
      service.update(
        calculationId,
        noteId,
        { text: "Текст", expectedResultChecksum: previousChecksum },
        request()
      ),
      409,
      "MATRIX_RESULT_CHANGED"
    );
    expect(notes.create).not.toHaveBeenCalled();
    expect(notes.update).not.toHaveBeenCalled();
  });

  it("rejects another module and a missing owned calculation before note access", async () => {
    const notes = createNoteStore();
    await expectHttpCode(
      createService({ notes, calculation: { ...matrixCalculation(), module: "numerology" } }).list(
        calculationId,
        request()
      ),
      409,
      "MATRIX_CALCULATION_MISMATCH"
    );
    await expectHttpCode(
      createService({ notes, calculation: null }).list(calculationId, request()),
      404,
      "CALCULATION_NOT_FOUND"
    );
    expect(notes.listByCalculation).not.toHaveBeenCalled();
  });

  it("deletes with the owner, calculation and note identity even when a note is stale", async () => {
    const notes = createNoteStore({ resultChecksum: previousChecksum });
    await createService({ notes }).delete(calculationId, noteId, request());
    expect(notes.delete).toHaveBeenCalledWith({ ownerUserId, calculationId, noteId });
  });

  it("resolves the versioned catalog without touching calculation or note storage", async () => {
    const calculations = createCalculationStore(matrixCalculation());
    const notes = createNoteStore();
    const response = await createService({ calculations, notes }).interpretation(
      { locale: "ru", arcana: "9", context: "portrait" },
      request()
    );

    matrixInterpretationResponseSchema.parse(response);
    expect(response.entry).toMatchObject({
      catalogRevision: 1,
      locale: "ru",
      arcana: 9,
      context: "portrait"
    });
    expect(calculations.findByOwnerAndId).not.toHaveBeenCalled();
    expect(notes.listByCalculation).not.toHaveBeenCalled();
  });
});

function createService(
  input: {
    readonly calculations?: CalculationStore;
    readonly notes?: MatrixNoteStore;
    readonly calculation?: CalculationRecord | null;
  } = {}
) {
  return new MatrixNotesService(
    input.calculations ??
      createCalculationStore(
        Object.prototype.hasOwnProperty.call(input, "calculation")
          ? (input.calculation ?? null)
          : matrixCalculation()
      ),
    input.notes ?? createNoteStore(),
    { now: () => now } as SystemClock
  );
}

function createCalculationStore(calculation: CalculationRecord | null): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({ calculations: [], total: 0 })),
    findByOwnerAndId: vi.fn(async (input) =>
      calculation !== null &&
      calculation.ownerUserId === input.ownerUserId &&
      calculation.id === input.calculationId
        ? calculation
        : null
    ),
    findExact: vi.fn(async () => null),
    create: vi.fn(async () => raise()),
    replaceResult: vi.fn(async () => ({ status: "not_found" as const })),
    ensureClientLinks: vi.fn(async () => null),
    linkClient: vi.fn(async () => null),
    publishClientLink: vi.fn(async () => null),
    saveInterpretation: vi.fn(async () => null),
    approveInterpretation: vi.fn(async () => null),
    archive: vi.fn(async () => null)
  };
}

function createNoteStore(input: { readonly resultChecksum?: string } = {}): MatrixNoteStore {
  const base = {
    id: noteId,
    calculationId,
    ownerUserId,
    text: "Проверить границы.",
    resultChecksum: input.resultChecksum ?? currentChecksum,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  return {
    listByCalculation: vi.fn(async () => [base]),
    create: vi.fn(async (createInput) => ({
      ...base,
      id: createInput.id,
      text: createInput.text,
      resultChecksum: createInput.resultChecksum
    })),
    update: vi.fn(async (updateInput) => ({
      ...base,
      text: updateInput.text,
      resultChecksum: updateInput.resultChecksum
    })),
    delete: vi.fn(async () => true)
  };
}

function matrixCalculation(): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "matrix",
    mode: "individual",
    methodCode: "ladini_22",
    title: "Марина — Матрица судьбы",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"c".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: currentChecksum,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function request(): AstrologerSessionRequest {
  return { currentAstrologerAccount: { account: { id: ownerUserId } } } as AstrologerSessionRequest;
}

async function expectHttpCode(
  promise: Promise<unknown>,
  status: number,
  code: string
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected an HTTP exception");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}

function raise(): never {
  throw new Error("Unexpected dependency call");
}
