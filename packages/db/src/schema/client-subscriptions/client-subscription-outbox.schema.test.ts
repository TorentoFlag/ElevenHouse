import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  outboxEvents,
  type ClientSubscriptionLifecycleEventDispatchRequestedPayload,
  type OutboxEventPayload
} from "../outbox/outbox-events.schema";

describe("client subscription lifecycle outbox envelope", () => {
  it("types and constrains the exact IDs-only dispatch payload", () => {
    const payload: ClientSubscriptionLifecycleEventDispatchRequestedPayload = {
      schemaVersion: "client-subscription-lifecycle-event-dispatch-request.v1",
      lifecycleEventId: "11111111-1111-4111-8111-111111111111"
    };
    expectTypeOf(payload).toMatchTypeOf<OutboxEventPayload>();

    const constraint = getTableConfig(outboxEvents).checks.find(
      (check) => check.name === "outbox_events_client_subscription_lifecycle_dispatch_check"
    );
    expect(constraint).toBeDefined();
    expect(new PgDialect().sqlToQuery(constraint!.value).sql).toContain(
      "client-subscription-lifecycle-event-dispatch-request.v1"
    );
  });
});
