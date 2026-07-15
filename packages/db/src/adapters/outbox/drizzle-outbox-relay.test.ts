import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDrizzleOutboxRelayStore } from "./drizzle-outbox-relay";

describe("createDrizzleOutboxRelayStore", () => {
  it("claims only the event types owned by the relay", async () => {
    const executed: SQL[] = [];
    const database = {
      transaction: async (
        callback: (transaction: { execute: (query: SQL) => Promise<{ rows: [] }> }) => unknown
      ) =>
        callback({
          execute: async (query: SQL) => {
            executed.push(query);
            return { rows: [] };
          }
        })
    };
    const now = new Date("2026-07-14T12:00:00.000Z");

    await createDrizzleOutboxRelayStore(database as never).claimPending({
      eventTypes: ["calculation.pdf.requested.v1"],
      limit: 10,
      now,
      stalePublishingBefore: new Date("2026-07-14T11:59:00.000Z")
    });

    const query = new PgDialect().sqlToQuery(executed[0] as SQL);
    expect(query.sql).toContain('"outbox_events"."event_type" in ($1)');
    expect(query.params).toContain("calculation.pdf.requested.v1");
  });

  it("refuses an empty event type ownership set", async () => {
    const database = { transaction: async () => ({ rows: [] }) };
    const now = new Date("2026-07-14T12:00:00.000Z");

    await expect(
      createDrizzleOutboxRelayStore(database as never).claimPending({
        eventTypes: [],
        limit: 10,
        now,
        stalePublishingBefore: now
      })
    ).rejects.toThrow("At least one outbox event type is required");
  });
});
