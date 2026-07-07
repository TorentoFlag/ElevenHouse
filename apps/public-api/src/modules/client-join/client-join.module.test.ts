import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { ClientJoinModule } from "./client-join.module";
import { ClientJoinService } from "./client-join.service";

describe("ClientJoinModule", () => {
  it("wires the client join service dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClientJoinModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .compile();

    expect(moduleRef.get(ClientJoinService)).toBeInstanceOf(ClientJoinService);

    await moduleRef.close();
  });
});
