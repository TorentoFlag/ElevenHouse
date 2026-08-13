import { describe, expect, it, vi } from "vitest";

import { maintainSessions } from "./session-maintenance";

describe("Session maintenance", () => {
  it("returns explicit expired and ended aggregate ids", async () => {
    const store = {
      expireScheduled: vi.fn(async () => ["expired"]),
      endAbsentActive: vi.fn(async () => ["ended"])
    };
    await expect(
      maintainSessions({ store, now: new Date("2026-08-13T11:30:00Z"), batchSize: 5 })
    ).resolves.toEqual({ expired: ["expired"], ended: ["ended"] });
  });
});
