import { describe, expect, it } from "vitest";
import { clientJoinIntents } from "../../schema";
import { createDrizzleClientStore } from "./index";

type InsertCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};

type UpdateCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};

function createFakeInsertDatabase(rows: readonly Record<string, unknown>[]) {
  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  const conflictUpdates: UpdateCall[] = [];
  let nextRowIndex = 0;

  const insert = (table: unknown) => ({
    values: (value: Record<string, unknown>) => ({
      onConflictDoUpdate: (config: { readonly set: Record<string, unknown> }) => ({
        returning: async () => {
          inserts.push({ table, value });
          conflictUpdates.push({ table, value: config.set });
          const row = rows[nextRowIndex];
          nextRowIndex += 1;
          return row ? [row] : [];
        }
      }),
      returning: async () => {
        inserts.push({ table, value });
        const row = rows[nextRowIndex];
        nextRowIndex += 1;
        return row ? [row] : [];
      }
    })
  });

  const update = (table: unknown) => ({
    set: (value: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          updates.push({ table, value });
          return [];
        }
      })
    })
  });

  return { database: { insert, update }, conflictUpdates, inserts, updates };
}

describe("createDrizzleClientStore", () => {
  it("creates join intents with token hash only", async () => {
    const now = new Date("2026-07-06T10:00:00.000Z");
    const { database, inserts } = createFakeInsertDatabase([
      {
        id: "44444444-4444-4444-8444-444444444444",
        astrologerUserId: "22222222-2222-4222-8222-222222222222",
        tokenHash: "sha256:1234567890abcdef",
        publicHandleSnapshot: "alisa-vega",
        status: "pending",
        expiresAt: new Date("2026-07-06T11:00:00.000Z"),
        claimedByClientUserId: null,
        claimedAt: null,
        createdAt: now,
        updatedAt: now
      }
    ]);
    const store = createDrizzleClientStore(database as never);

    await store.createJoinIntent({
      id: "44444444-4444-4444-8444-444444444444",
      astrologerUserId: "22222222-2222-4222-8222-222222222222",
      tokenHash: "sha256:1234567890abcdef",
      publicHandleSnapshot: "alisa-vega",
      expiresAt: "2026-07-06T11:00:00.000Z",
      now: now.toISOString()
    });

    expect(inserts).toEqual([
      {
        table: clientJoinIntents,
        value: expect.objectContaining({
          tokenHash: "sha256:1234567890abcdef",
          publicHandleSnapshot: "alisa-vega"
        })
      }
    ]);
    expect(JSON.stringify(inserts.map((insert) => insert.value))).not.toContain("plain-token\"");
  });
});
