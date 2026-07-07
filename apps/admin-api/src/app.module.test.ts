import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module";
import { HealthService } from "./modules/health/health.service";

describe("admin-api app module", () => {
  it("compiles with the health module registered", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    expect(moduleRef.get(HealthService)).toBeInstanceOf(HealthService);
  });
});
