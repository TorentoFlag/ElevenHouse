import { describe, expect, it, vi } from "vitest";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { AstroDiaryController } from "./astro-diary.controller";
import type { AstroDiaryService } from "./astro-diary.service";

describe("AstroDiaryController", () => {
  it("routes GET /astro-diary/journals to the service", async () => {
    const service = {
      listJournals: vi.fn(async () => ({ journals: [], total: 0 })),
      getTimeline: vi.fn()
    } as unknown as AstroDiaryService;
    const controller = new AstroDiaryController(service);
    const request = {
      currentAstrologerAccount: undefined
    } as unknown as AstrologerSessionRequest;

    await expect(controller.listJournals(request)).resolves.toEqual({ journals: [], total: 0 });
    expect(service.listJournals).toHaveBeenCalledWith(request);
  });

  it("routes GET /astro-diary/journals/:journalId/timeline to the service", async () => {
    const service = {
      listJournals: vi.fn(),
      getTimeline: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        visibleMaxCursor: 0,
        hasMore: false
      }))
    } as unknown as AstroDiaryService;
    const controller = new AstroDiaryController(service);
    const request = {
      currentAstrologerAccount: undefined
    } as unknown as AstrologerSessionRequest;
    const query = { afterCursor: "3", limit: "25" };

    await expect(controller.getTimeline(request, journalId, query)).resolves.toEqual({
      items: [],
      nextCursor: null,
      visibleMaxCursor: 0,
      hasMore: false
    });
    expect(service.getTimeline).toHaveBeenCalledWith(request, journalId, query);
  });
});

const journalId = "22222222-2222-4222-8222-222222222222";
