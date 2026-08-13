import { describe, expect, it, vi } from "vitest";

import { SessionsService } from "./sessions.service";

describe("client SessionsService", () => {
  it("lists only projections returned by the participant-authorized store", async () => {
    const listForActor = vi.fn(async () => []);
    const service = new SessionsService(
      { listForActor, getForActor: vi.fn(), listMessages: vi.fn(), listRealtimeEvents: vi.fn() },
      {} as never,
      {} as never
    );
    await expect(
      service.list("client", { rangeStartAt: "2026-08-13T00:00:00Z", rangeEndAt: "2026-08-14T00:00:00Z" }, new Date())
    ).resolves.toEqual({ sessions: [] });
    expect(listForActor).toHaveBeenCalledWith(expect.objectContaining({ actor: { userId: "client", role: "client" } }));
  });
});
