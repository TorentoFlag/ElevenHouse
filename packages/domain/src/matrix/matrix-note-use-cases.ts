import { MatrixNoteNotFoundError, MatrixValidationError } from "./matrix-errors";
import type { MatrixNoteStore } from "./matrix-note-store";
import type { MatrixNote } from "./matrix-note-types";

export function listMatrixNotes(input: {
  readonly store: MatrixNoteStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
}): Promise<readonly MatrixNote[]> {
  return input.store.listByCalculation({
    ownerUserId: required(input.ownerUserId, "Matrix note owner is required"),
    calculationId: required(input.calculationId, "Matrix calculation id is required")
  });
}

export async function createMatrixNote(input: {
  readonly store: MatrixNoteStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly text: string;
  readonly resultChecksum: string;
  readonly idGenerator: () => string;
  readonly now: Date;
}): Promise<MatrixNote> {
  return input.store.create({
    id: required(input.idGenerator(), "Matrix note id is required"),
    ownerUserId: required(input.ownerUserId, "Matrix note owner is required"),
    calculationId: required(input.calculationId, "Matrix calculation id is required"),
    text: normalizeText(input.text),
    resultChecksum: checksum(input.resultChecksum),
    now: input.now.toISOString()
  });
}

export async function updateMatrixNote(input: {
  readonly store: MatrixNoteStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly noteId: string;
  readonly text: string;
  readonly resultChecksum: string;
  readonly now: Date;
}): Promise<MatrixNote> {
  const note = await input.store.update({
    ownerUserId: required(input.ownerUserId, "Matrix note owner is required"),
    calculationId: required(input.calculationId, "Matrix calculation id is required"),
    noteId: required(input.noteId, "Matrix note id is required"),
    text: normalizeText(input.text),
    resultChecksum: checksum(input.resultChecksum),
    now: input.now.toISOString()
  });
  if (!note) throw new MatrixNoteNotFoundError();
  return note;
}

export async function deleteMatrixNote(input: {
  readonly store: MatrixNoteStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly noteId: string;
}): Promise<void> {
  const deleted = await input.store.delete({
    ownerUserId: required(input.ownerUserId, "Matrix note owner is required"),
    calculationId: required(input.calculationId, "Matrix calculation id is required"),
    noteId: required(input.noteId, "Matrix note id is required")
  });
  if (!deleted) throw new MatrixNoteNotFoundError();
}

function normalizeText(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 10_000) {
    throw new MatrixValidationError("Matrix note text must be between 1 and 10000 characters");
  }
  return normalized;
}

function checksum(value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new MatrixValidationError("Matrix note result checksum is invalid");
  }
  return value;
}

function required(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new MatrixValidationError(message);
  return normalized;
}
