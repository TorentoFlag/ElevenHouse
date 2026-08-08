import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { FlowRuntimeControlController } from "./flow-runtime-control.controller";

const body = {
  expectedRevision: 1,
  policy: {
    schemaVersion: "flow-runtime-rollout-policy.v2",
    mode: "definition_only",
    canaryOwnerSubjectIds: [],
    allowedRequirementKeys: [],
    killSwitches: {
      enrollment: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      claim: { global: false, ownerSubjectIds: [], capabilityKeys: [] },
      externalDispatch: { global: false, ownerSubjectIds: [], capabilityKeys: [] }
    },
    readinessLeaseTtlMs: 30_000,
    tokenLeaseDurationMs: 60_000
  },
  reason: "Fail closed during maintenance"
};

describe("FlowRuntimeControlController", () => {
  it("allows a super-admin to issue the authenticated idempotent command", async () => {
    const service = { replace: vi.fn(async () => ({ policy: { revision: 2 }, command: {} })), readCurrent: vi.fn() };
    const controller = new FlowRuntimeControlController(service as never);

    await controller.replace(
      { currentAdminAccount: { id: "11111111-1111-4111-8111-111111111111", roles: ["super_admin"] } } as never,
      "runtime-control-0001",
      body
    );

    expect(service.replace).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "runtime-control-0001",
      body
    );
  });

  it("does not expose mutation authority to a regular admin or no session", () => {
    const controller = new FlowRuntimeControlController({ replace: vi.fn(), readCurrent: vi.fn() } as never);
    expect(() =>
      controller.replace(
        { currentAdminAccount: { id: "11111111-1111-4111-8111-111111111111", roles: ["admin"] } } as never,
        "runtime-control-0001",
        body
      )
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.replace({} as never, "runtime-control-0001", body)
    ).toThrow(UnauthorizedException);
  });
});
