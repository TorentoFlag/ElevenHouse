import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { messagingChannelConnections, messagingRealtimeEvents } from "../../schema";
import { createDrizzleMessagingReadStore } from "./drizzle-messaging-read-store";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-22T10:00:00.000Z");

describe("createDrizzleMessagingReadStore realtime events", () => {
  it("lists owner-scoped realtime events after the cursor", async () => {
    const fake = createRealtimeDatabase([
      {
        eventId: 42n,
        astrologerUserId,
        type: "message.received",
        threadId: "44444444-4444-4444-8444-444444444444",
        messageId: "77777777-7777-4777-8777-777777777777",
        channelConnectionId: "55555555-5555-4555-8555-555555555555",
        externalIdentityId: null,
        createdAt: now
      }
    ]);

    await expect(
      createDrizzleMessagingReadStore(fake.database as never).listRealtimeEvents({
        astrologerUserId,
        afterEventId: "41",
        limit: 100
      })
    ).resolves.toEqual({
      events: [
        {
          eventId: "42",
          astrologerUserId,
          type: "message.received",
          occurredAt: now.toISOString(),
          threadId: "44444444-4444-4444-8444-444444444444",
          messageId: "77777777-7777-4777-8777-777777777777",
          channelConnectionId: "55555555-5555-4555-8555-555555555555",
          externalIdentityId: undefined
        }
      ]
    });
    const whereSql = renderWhere(fake.wheres[0]);
    expect(whereSql.sql).toContain('"messaging_realtime_events"."astrologer_user_id" =');
    expect(whereSql.sql).toContain('"messaging_realtime_events"."event_id" >');
    expect(whereSql.params).toContain(astrologerUserId);
    expect(whereSql.params).toContain(41n);
    expect(renderWhere(fake.orderByColumns[0] as SQL).sql).toContain(
      '"messaging_realtime_events"."event_id" asc'
    );
    expect(fake.limits).toEqual([100]);
  });
});

describe("createDrizzleMessagingReadStore Telegram Business reconciliation", () => {
  it("lists active Telegram Business connections with provider business ids", async () => {
    const fake = createChannelConnectionDatabase([
      {
        channelConnectionId: "55555555-5555-4555-8555-555555555555",
        businessConnectionId: "bc_123"
      }
    ]);

    await expect(
      createDrizzleMessagingReadStore(fake.database as never)
        .listTelegramBusinessConnectionReconciliationCandidates({
          astrologerUserId
        })
    ).resolves.toEqual({
      candidates: [
        {
          channelConnectionId: "55555555-5555-4555-8555-555555555555",
          businessConnectionId: "bc_123"
        }
      ]
    });
    const whereSql = renderWhere(fake.wheres[0]);
    expect(whereSql.sql).toContain('"messaging_channel_connections"."astrologer_user_id" =');
    expect(whereSql.sql).toContain('"messaging_channel_connections"."provider" =');
    expect(whereSql.sql).toContain('"messaging_channel_connections"."mode" =');
    expect(whereSql.sql).toContain('"messaging_channel_connections"."status" in');
    expect(whereSql.sql).toContain('"messaging_channel_connections"."external_account_id" is not null');
    expect(whereSql.params).toContain(astrologerUserId);
    expect(whereSql.params).toContain("telegram");
    expect(whereSql.params).toContain("telegram_business_bot");
    expect(whereSql.params).toContain("active");
    expect(whereSql.params).toContain("reauth_required");
    expect(fake.limits).toEqual([10]);
  });
});

function createRealtimeDatabase(rows: readonly Record<string, unknown>[]) {
  const wheres: SQL[] = [];
  const orderByColumns: unknown[] = [];
  const limits: number[] = [];
  const database = {
    select: () => selectChain(rows, {
      onWhere: (where) => wheres.push(where),
      onOrderBy: (column) => orderByColumns.push(column),
      onLimit: (limit) => limits.push(limit)
    })
  };
  return { database, wheres, orderByColumns, limits };
}

function createChannelConnectionDatabase(rows: readonly Record<string, unknown>[]) {
  const wheres: SQL[] = [];
  const limits: number[] = [];
  const database = {
    select: () => {
      const query = {
        from: (table: unknown) => {
          expect(table).toBe(messagingChannelConnections);
          return query;
        },
        where: (where: SQL) => {
          wheres.push(where);
          return query;
        },
        orderBy: () => query,
        limit: async (limit: number) => {
          limits.push(limit);
          return rows;
        }
      };
      return query;
    }
  };
  return { database, wheres, limits };
}

function selectChain(
  rows: readonly Record<string, unknown>[],
  listeners: {
    readonly onWhere: (where: SQL) => void;
    readonly onOrderBy: (column: unknown) => void;
    readonly onLimit: (limit: number) => void;
  }
) {
  const query = {
    from: (table: unknown) => {
      expect(table).toBe(messagingRealtimeEvents);
      return query;
    },
    where: (where: SQL) => {
      listeners.onWhere(where);
      return query;
    },
    orderBy: (column: unknown) => {
      listeners.onOrderBy(column);
      return query;
    },
    limit: async (limit: number) => {
      listeners.onLimit(limit);
      return rows;
    }
  };
  return query;
}

function renderWhere(where: SQL | undefined) {
  if (!where) throw new Error("Expected Drizzle where");
  return new PgDialect().sqlToQuery(where);
}
