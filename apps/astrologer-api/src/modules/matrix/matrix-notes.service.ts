import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  createMatrixNote,
  deleteMatrixNote,
  getCalculation,
  listMatrixNotes,
  resolveMatrixInterpretation,
  updateMatrixNote,
  type CalculationRecord,
  type CalculationStore,
  type MatrixNote,
  type MatrixNoteStore
} from "@elevenhouse/domain";
import {
  calculationIdParamSchema,
  createMatrixNoteRequestSchema,
  matrixInterpretationQuerySchema,
  matrixInterpretationResponseSchema,
  matrixNoteIdParamSchema,
  matrixNoteResponseSchema,
  matrixNotesResponseSchema,
  updateMatrixNoteRequestSchema,
  type CreateMatrixNoteRequest,
  type MatrixInterpretationQuery,
  type MatrixInterpretationResponse,
  type MatrixNoteResponse,
  type MatrixNotesResponse,
  type UpdateMatrixNoteRequest
} from "@elevenhouse/contracts";
import { SystemClock } from "../clock/system-clock.service";
import { requireOwnerUserId } from "../calculations/calculations.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { mapMatrixError, matrixHttpError } from "./matrix-http-errors";
import { MATRIX_NOTE_STORE } from "./matrix-notes.tokens";

@Injectable()
export class MatrixNotesService {
  constructor(
    @Inject(CALCULATION_STORE) private readonly calculationStore: CalculationStore,
    @Inject(MATRIX_NOTE_STORE) private readonly noteStore: MatrixNoteStore,
    private readonly clock: SystemClock
  ) {}

  async list(
    calculationId: string,
    request: AstrologerSessionRequest
  ): Promise<MatrixNotesResponse> {
    const params = parseContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      const notes = await listMatrixNotes({
        store: this.noteStore,
        ownerUserId,
        calculationId: calculation.id
      });
      return matrixNotesResponseSchema.parse({
        notes: notes.map((note) => toResponseNote(note, calculation.resultChecksum)),
        currentResultChecksum: calculation.resultChecksum
      });
    });
  }

  async create(
    calculationId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixNoteResponse> {
    const params = parseContract<{ calculationId: string }>(calculationIdParamSchema, {
      calculationId
    });
    const parsedBody = parseContract<CreateMatrixNoteRequest>(createMatrixNoteRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      requireCurrentChecksum(calculation, parsedBody.expectedResultChecksum);
      const note = await createMatrixNote({
        store: this.noteStore,
        ownerUserId,
        calculationId: calculation.id,
        text: parsedBody.text,
        resultChecksum: calculation.resultChecksum,
        idGenerator: randomUUID,
        now: this.clock.now()
      });
      return noteResponse(note, calculation.resultChecksum);
    });
  }

  async update(
    calculationId: string,
    noteId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<MatrixNoteResponse> {
    const params = parseContract<{ calculationId: string; noteId: string }>(
      matrixNoteIdParamSchema,
      { calculationId, noteId }
    );
    const parsedBody = parseContract<UpdateMatrixNoteRequest>(updateMatrixNoteRequestSchema, body);
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      requireCurrentChecksum(calculation, parsedBody.expectedResultChecksum);
      const note = await updateMatrixNote({
        store: this.noteStore,
        ownerUserId,
        calculationId: calculation.id,
        noteId: params.noteId,
        text: parsedBody.text,
        resultChecksum: calculation.resultChecksum,
        now: this.clock.now()
      });
      return noteResponse(note, calculation.resultChecksum);
    });
  }

  async delete(
    calculationId: string,
    noteId: string,
    request: AstrologerSessionRequest
  ): Promise<void> {
    const params = parseContract<{ calculationId: string; noteId: string }>(
      matrixNoteIdParamSchema,
      { calculationId, noteId }
    );
    const ownerUserId = requireOwnerUserId(request);
    return mapMatrixError(async () => {
      const calculation = await this.ownedMatrix(ownerUserId, params.calculationId);
      await deleteMatrixNote({
        store: this.noteStore,
        ownerUserId,
        calculationId: calculation.id,
        noteId: params.noteId
      });
    });
  }

  interpretation(
    query: unknown,
    request: AstrologerSessionRequest
  ): MatrixInterpretationResponse {
    requireOwnerUserId(request);
    const parsed = parseContract<MatrixInterpretationQuery>(matrixInterpretationQuerySchema, query);
    return matrixInterpretationResponseSchema.parse({ entry: resolveMatrixInterpretation(parsed) });
  }

  private async ownedMatrix(ownerUserId: string, calculationId: string) {
    const calculation = await getCalculation({
      store: this.calculationStore,
      ownerUserId,
      calculationId
    });
    assertSupportedMatrix(calculation);
    return calculation;
  }
}

function assertSupportedMatrix(calculation: CalculationRecord): void {
  if (calculation.module !== "matrix" || calculation.methodCode !== "ladini_22") {
    throw matrixHttpError(
      409,
      "MATRIX_CALCULATION_MISMATCH",
      "Calculation is not a supported Matrix record"
    );
  }
}

function requireCurrentChecksum(calculation: CalculationRecord, expected: string): void {
  if (calculation.resultChecksum !== expected) {
    throw matrixHttpError(
      409,
      "MATRIX_RESULT_CHANGED",
      "Matrix result changed; reload before saving the note"
    );
  }
}

function noteResponse(note: MatrixNote, currentResultChecksum: string): MatrixNoteResponse {
  return matrixNoteResponseSchema.parse({
    note: toResponseNote(note, currentResultChecksum),
    currentResultChecksum
  });
}

function toResponseNote(note: MatrixNote, currentResultChecksum: string) {
  return {
    id: note.id,
    calculationId: note.calculationId,
    text: note.text,
    resultChecksum: note.resultChecksum,
    stale: note.resultChecksum !== currentResultChecksum,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  };
}

function parseContract<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  value: unknown
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw matrixHttpError(400, "MATRIX_VALIDATION_FAILED", "Invalid Matrix request");
  }
  return result.data as T;
}
