import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDrizzleOutboxRelayStore } from "./drizzle-outbox-relay";

describe("createDrizzleOutboxRelayStore", () => {
  it("claims only the event types owned by the relay with a monotonic fence", async () => {
    const executed: SQL[] = [];
    const database = {
      transaction: async (
        callback: (transaction: {
          execute: (query: SQL) => Promise<{
            rows: Array<{
              id: string;
              eventType: string;
              aggregateId: string;
              payload: { jobId: string };
              attempts: number;
              claimFence: string;
            }>;
          }>;
        }) => unknown
      ) =>
        callback({
          execute: async (query: SQL) => {
            executed.push(query);
            return {
              rows: [
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  eventType: "calculation.pdf.requested.v1",
                  aggregateId: "00000000-0000-4000-8000-000000000002",
                  payload: { jobId: "00000000-0000-4000-8000-000000000003" },
                  attempts: 0,
                  claimFence: "9"
                }
              ]
            };
          }
        })
    };
    const now = new Date("2026-07-14T12:00:00.000Z");

    const claimed = await createDrizzleOutboxRelayStore(database as never).claimPending({
      eventTypes: ["calculation.pdf.requested.v1"],
      limit: 10,
      now,
      stalePublishingBefore: new Date("2026-07-14T11:59:00.000Z")
    });

    const query = new PgDialect().sqlToQuery(executed[0] as SQL);
    expect(query.sql).toContain('"outbox_events"."event_type" in ($1)');
    expect(query.sql).toContain('claim_fence = "outbox_events"."claim_fence" + 1');
    expect(query.sql).toContain('"outbox_events"."claim_fence" as "claimFence"');
    expect(query.params).toContain("calculation.pdf.requested.v1");
    expect(claimed).toEqual([
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000001",
        claimFence: 9n
      })
    ]);
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
