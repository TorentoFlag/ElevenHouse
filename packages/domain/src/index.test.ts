import { describe, expect, it } from "vitest";
import { createDomainEvent } from "./index";

describe("createDomainEvent", () => {
  it("serializes domain event timestamps as UTC ISO strings", () => {
    expect(
      createDomainEvent({
        id: "evt_1",
        name: "foundation.checked",
        occurredAt: new Date("2026-06-09T00:00:00.000Z"),
        payload: { service: "public-api" }
      })
    ).toEqual({
      id: "evt_1",
      name: "foundation.checked",
      occurredAt: "2026-06-09T00:00:00.000Z",
      payload: { service: "public-api" }
    });
  });
});
