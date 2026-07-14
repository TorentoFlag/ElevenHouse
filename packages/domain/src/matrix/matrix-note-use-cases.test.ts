import { describe, expect, it, vi } from "vitest";
import type { MatrixNoteStore } from "./matrix-note-store";
import {
  createMatrixNote,
  deleteMatrixNote,
  listMatrixNotes,
  updateMatrixNote
} from "./matrix-note-use-cases";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const noteId = "00000000-0000-4000-8000-000000000003";
const checksum = `sha256:${"a".repeat(64)}`;
const now = new Date("2026-07-14T00:00:00.000Z");

describe("Matrix note use cases", () => {
  it("lists notes through an owner-scoped calculation key", async () => {
    const store = createStore();
    await listMatrixNotes({ store, ownerUserId, calculationId });
    expect(store.listByCalculation).toHaveBeenCalledWith({ ownerUserId, calculationId });
  });

  it("creates a trimmed checksum-bound note with injected identity and time", async () => {
    const store = createStore();
    const note = await createMatrixNote({
      store,
      ownerUserId,
      calculationId,
      text: "  Проверить тему границ.  ",
      resultChecksum: checksum,
      idGenerator: () => noteId,
      now
    });
    expect(store.create).toHaveBeenCalledWith({
      id: noteId,
      ownerUserId,
      calculationId,
      text: "Проверить тему границ.",
      resultChecksum: checksum,
      now: now.toISOString()
    });
    expect(note.id).toBe(noteId);
  });

  it("updates text and rebinds the note to the supplied current checksum", async () => {
    const store = createStore();
    await updateMatrixNote({
      store,
      ownerUserId,
      calculationId,
      noteId,
      text: "  Новый вывод. ",
      resultChecksum: checksum,
      now
    });
    expect(store.update).toHaveBeenCalledWith({
      ownerUserId,
      calculationId,
      noteId,
      text: "Новый вывод.",
      resultChecksum: checksum,
      now: now.toISOString()
    });
  });

  it("fails explicitly when update or delete cannot find the owned note", async () => {
    const store = createStore({ updateResult: null, deleteResult: false });
    await expect(
      updateMatrixNote({
        store,
        ownerUserId,
        calculationId,
        noteId,
        text: "Текст",
        resultChecksum: checksum,
        now
      })
    ).rejects.toThrow("Matrix note was not found");
    await expect(deleteMatrixNote({ store, ownerUserId, calculationId, noteId })).rejects.toThrow(
      "Matrix note was not found"
    );
  });

  it.each(["", "   ", "x".repeat(10_001)])("rejects invalid note text", async (text) => {
    await expect(
      createMatrixNote({
        store: createStore(),
        ownerUserId,
        calculationId,
        text,
        resultChecksum: checksum,
        idGenerator: () => noteId,
        now
      })
    ).rejects.toThrow("between 1 and 10000");
  });
});

function createStore(
  input: { readonly updateResult?: null; readonly deleteResult?: false } = {}
): MatrixNoteStore {
  const note = {
    id: noteId,
    calculationId,
    ownerUserId,
    text: "Проверить тему границ.",
    resultChecksum: checksum,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  return {
    listByCalculation: vi.fn(async () => [note]),
    create: vi.fn(async (createInput) => ({
      ...note,
      id: createInput.id,
      text: createInput.text,
      resultChecksum: createInput.resultChecksum
    })),
    update: vi.fn(async (updateInput) =>
      input.updateResult === null
        ? null
        : { ...note, text: updateInput.text, resultChecksum: updateInput.resultChecksum }
    ),
    delete: vi.fn(async () => input.deleteResult !== false)
  };
}
