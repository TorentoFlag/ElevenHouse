import { describe, expect, it, vi } from "vitest";
import { createAstroDiaryCommandAttemptRegistry } from "./astroDiaryCommandAttemptRegistry";

describe("createAstroDiaryCommandAttemptRegistry", () => {
  it("reuses one idempotency key for an unchanged failed intent", () => {
    const createRequestId = vi
      .fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const attempts = createAstroDiaryCommandAttemptRegistry(createRequestId);
    const intent = { journalId: "journal-1", body: "Saved reply", expectedJournalVersion: 4 };

    const first = attempts.acquire("save", intent);
    const retry = attempts.acquire("save", intent);

    expect(retry).toBe(first);
    expect(createRequestId).toHaveBeenCalledTimes(1);
  });

  it("rotates the key only after the exact intent is acknowledged", () => {
    const createRequestId = vi
      .fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const attempts = createAstroDiaryCommandAttemptRegistry(createRequestId);
    const intent = { journalId: "journal-1", body: "Saved reply", expectedJournalVersion: 4 };

    const first = attempts.acquire("save", intent);
    attempts.acknowledge("save", first);

    expect(attempts.acquire("save", intent)).not.toBe(first);
  });
});
