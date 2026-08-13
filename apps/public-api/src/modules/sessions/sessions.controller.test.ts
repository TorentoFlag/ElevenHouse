import { Test } from "@nestjs/testing";
import { SELF_DECLARED_DEPS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

describe("SessionsController", () => {
  it("declares SessionsService explicitly for the tsx runtime", async () => {
    expect(Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, SessionsController)).toEqual(
      expect.arrayContaining([expect.objectContaining({ index: 0, param: SessionsService })])
    );

    const list = vi.fn(async () => ({ sessions: [] }));
    const moduleRef = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [{ provide: SessionsService, useValue: { list } }]
    })
      .overrideGuard(PublicSessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = moduleRef.get(SessionsController);
    const request = {
      headers: {},
      currentCustomerAccount: {
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client"]
        }
      }
    } satisfies PublicSessionRequest;

    await expect(controller.list({}, request)).resolves.toEqual({ sessions: [] });
    expect(list).toHaveBeenCalledWith(
      request.currentCustomerAccount.account.id,
      {},
      expect.any(Date)
    );
  });
});
