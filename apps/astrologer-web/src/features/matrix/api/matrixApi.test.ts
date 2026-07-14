import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { updateMatrixNote } from "./matrixApi";

const calculationId = "00000000-0000-4000-8000-000000000001";
const noteId = "00000000-0000-4000-8000-000000000002";
const checksum = `sha256:${"a".repeat(64)}`;
const body = { text: "Уточнить границы контроля.", expectedResultChecksum: checksum };

afterEach(() => vi.restoreAllMocks());

describe("matrixApi", () => {
  it("updates a note with parsed route params and the plain request body", async () => {
    const response = {
      note: {
        id: noteId,
        calculationId,
        text: body.text,
        resultChecksum: checksum,
        stale: false,
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z"
      },
      currentResultChecksum: checksum
    };
    const put = vi.spyOn(application.http, "put").mockResolvedValue(response);

    await expect(updateMatrixNote({ calculationId, noteId, body })).resolves.toEqual(response);
    expect(put).toHaveBeenCalledWith(
      `/matrix/calculations/${calculationId}/notes/${noteId}`,
      body,
      { csrf: true }
    );
  });
});
