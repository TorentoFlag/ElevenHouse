import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("admin-api health controller", () => {
  it("uses the Nest-injected health service in the runtime controller instance", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService]
    }).compile();

    try {
      expect(moduleRef.get(HealthController).getHealth()).toMatchObject({
        service: "admin-api",
        status: "ok"
      });
    } finally {
      await moduleRef.close();
    }
  });
});
