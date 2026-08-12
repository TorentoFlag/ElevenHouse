import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MobileAstrologerSessionController } from "./mobile-session.controller";
import type { MobileAstrologerSessionService } from "./mobile-session.service";

describe("MobileAstrologerSessionController refresh", () => {
  it("returns a typed 400 for an invalid refresh body instead of leaking a Zod exception as 500", async () => {
    const service = { refresh: vi.fn() } as unknown as MobileAstrologerSessionService;
    const controller = new MobileAstrologerSessionController(
      {} as never,
      service
    );

    await expect(controller.refresh({ refreshToken: "too-short" } as never, {} as never)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(service.refresh).not.toHaveBeenCalled();
  });
});
