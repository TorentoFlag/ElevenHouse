import { describe, expect, it, vi } from "vitest";
import { createAstroDiaryCommandAttemptRegistry } from "./astroDiaryCommandAttemptRegistry";

describe("client AstroDiary command attempts", () => {
  it("reuses one idempotency key for the identical failed intent", () => {
    const createRequestId = vi
      .fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const attempts = createAstroDiaryCommandAttemptRegistry(createRequestId);
    const intent = { journalId: "journal-1", body: "My entry", moodId: "calm" };
    const first = attempts.acquire("save", intent);
    expect(attempts.acquire("save", intent)).toBe(first);
    expect(createRequestId).toHaveBeenCalledTimes(1);
  });

  it("rotates the key after the server acknowledges the exact intent", () => {
    const createRequestId = vi
      .fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const attempts = createAstroDiaryCommandAttemptRegistry(createRequestId);
    const intent = { journalId: "journal-1", body: "My entry" };
    const first = attempts.acquire("save", intent);
    attempts.acknowledge("save", first);
    expect(attempts.acquire("save", intent)).not.toBe(first);
  });
});
