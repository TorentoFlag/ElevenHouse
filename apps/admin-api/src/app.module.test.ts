import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "./app.module";
import { HealthService } from "./modules/health/health.service";

describe("admin-api app module", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse";
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
      return;
    }

    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("compiles with the health module registered", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    expect(moduleRef.get(HealthService)).toBeInstanceOf(HealthService);
  });
});
