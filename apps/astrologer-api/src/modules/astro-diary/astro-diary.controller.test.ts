import { describe, expect, it, vi } from "vitest";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { AstroDiaryController } from "./astro-diary.controller";
import type { AstroDiaryService } from "./astro-diary.service";

describe("AstroDiaryController", () => {
  it("routes GET /astro-diary/journals to the service", async () => {
    const service = {
      listJournals: vi.fn(async () => ({ journals: [], total: 0 }))
    } as unknown as AstroDiaryService;
    const controller = new AstroDiaryController(service);
    const request = {
      currentAstrologerAccount: undefined
    } as unknown as AstrologerSessionRequest;

    await expect(controller.listJournals(request)).resolves.toEqual({ journals: [], total: 0 });
    expect(service.listJournals).toHaveBeenCalledWith(request);
  });
});
