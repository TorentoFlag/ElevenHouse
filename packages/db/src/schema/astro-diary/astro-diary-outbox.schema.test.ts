import { describe, expect, expectTypeOf, it } from "vitest";

import {
  outboxEvents,
  type AstroDiaryEventDeliveryDispatchRequestedPayload,
  type OutboxEventPayload
} from "../outbox/outbox-events.schema";

describe("AstroDiary outbox payload authority", () => {
  it("admits only the body-free delivery pointer used by the exact fanout graph", () => {
    const payload = {
      schemaVersion: "astro-diary-event-delivery-dispatch-request.v1",
      deliveryId: "00000000-0000-4000-8000-000000000001"
    } as const satisfies AstroDiaryEventDeliveryDispatchRequestedPayload;

    expectTypeOf(payload).toMatchTypeOf<OutboxEventPayload>();
    expect(outboxEvents.payload.dataType).toBe("json");
    expect(Object.keys(payload)).toEqual(["schemaVersion", "deliveryId"]);
  });
});
