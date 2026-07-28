import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDrizzleTelegramMtprotoSessionProcessingStore } from "./drizzle-telegram-mtproto-session-processing-store";

describe("createDrizzleTelegramMtprotoSessionProcessingStore", () => {
  it("claims only authorized sessions whose lease is free or owned by this worker", async () => {
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
    const now = new Date("2026-07-28T10:00:00.000Z");

    await createDrizzleTelegramMtprotoSessionProcessingStore(database as never).claimAvailable({
      leaseOwner: "notification-worker:pid-1",
      now,
      leaseDurationMs: 60_000,
      limit: 5
    });

    const query = new PgDialect().sqlToQuery(executed[0] as SQL);
    expect(query.sql).toContain("for update skip locked");
    expect(query.sql).toContain("\"messaging_telegram_mtproto_sessions\".\"login_state\" = 'authorized'");
    expect(query.sql).toContain("\"messaging_telegram_mtproto_sessions\".\"session_encrypted\" is not null");
    expect(query.sql).toContain("\"messaging_channel_connections\".\"status\" = 'active'");
    expect(query.sql).toContain("\"messaging_channel_connections\".\"mode\" = 'telegram_mtproto_account'");
    expect(query.sql).toContain("\"messaging_telegram_mtproto_sessions\".\"lease_owner\" =");
    expect(query.sql).toContain("\"messaging_telegram_mtproto_sessions\".\"leased_until\" <=");
    expect(query.params).toContain("notification-worker:pid-1");
  });

  it("renews only a lease owned by the same worker", async () => {
    const updates: Array<{ readonly value: Record<string, unknown> }> = [];
    const database = {
      update: () => ({
        set: (value: Record<string, unknown>) => {
          updates.push({ value });
          return { where: async () => undefined };
        }
      })
    };
    const now = new Date("2026-07-28T10:00:00.000Z");

    await createDrizzleTelegramMtprotoSessionProcessingStore(database as never).heartbeat({
      channelConnectionId: "00000000-0000-4000-8000-000000000004",
      leaseOwner: "notification-worker:pid-1",
      now,
      leaseDurationMs: 60_000
    });

    expect(updates).toEqual([
      {
        value: {
          leasedUntil: new Date("2026-07-28T10:01:00.000Z"),
          lastListenerHeartbeatAt: now,
          updatedAt: now
        }
      }
    ]);
  });

  it("marks a leased session as reauthorization-required without leaking session material", async () => {
    const updates: Array<{ readonly value: Record<string, unknown> }> = [];
    const database = {
      transaction: async (callback: (transaction: unknown) => unknown) => callback(database),
      update: () => ({
        set: (value: Record<string, unknown>) => {
          updates.push({ value });
          return { where: async () => undefined };
        }
      })
    };
    const now = new Date("2026-07-28T10:00:00.000Z");

    await createDrizzleTelegramMtprotoSessionProcessingStore(database as never).markReauthRequired({
      channelConnectionId: "00000000-0000-4000-8000-000000000004",
      leaseOwner: "notification-worker:pid-1",
      errorCode: "TELEGRAM_MTPROTO_REAUTH_REQUIRED",
      errorMessage: "Telegram MTProto session requires reauthorization",
      now
    });

    expect(JSON.stringify(updates)).not.toContain("session:");
    expect(updates).toContainEqual({
      value: {
        loginState: "reauth_required",
        leaseOwner: null,
        leasedUntil: null,
        updatedAt: now
      }
    });
    expect(updates).toContainEqual({
      value: {
        status: "reauth_required",
        lastErrorCode: "TELEGRAM_MTPROTO_REAUTH_REQUIRED",
        lastErrorMessage: "Telegram MTProto session requires reauthorization",
        updatedAt: now
      }
    });
  });
});
