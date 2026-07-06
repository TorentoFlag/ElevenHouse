import { describe, expect, it, vi } from "vitest";
import type { ClientStore } from "@elevenhouse/domain";
import { ClientJoinService } from "./client-join.service";

const now = new Date("2026-07-06T10:00:00.000Z");

describe("ClientJoinService", () => {
  it("creates a direct-link join intent from an astrologer public handle", async () => {
    const profileReader = {
      findPublishedByPublicHandle: vi.fn(async () => ({
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        publicHandle: "alisa-vega",
        publicName: "Алиса Вега"
      }))
    };
    const store = {
      createJoinIntent: vi.fn(async (input) => ({
        id: input.id,
        astrologerUserId: input.astrologerUserId,
        tokenHash: input.tokenHash,
        publicHandleSnapshot: input.publicHandleSnapshot,
        status: "pending" as const,
        expiresAt: input.expiresAt,
        claimedByClientUserId: null,
        claimedAt: null,
        createdAt: input.now,
        updatedAt: input.now
      }))
    } satisfies Pick<ClientStore, "createJoinIntent">;
    const service = new ClientJoinService(
      profileReader,
      store,
      { now: () => now },
      {
        generateToken: () => "join_1234567890abcdef",
        generateId: () => "44444444-4444-4444-8444-444444444444",
        ttlSeconds: 3600
      }
    );

    await expect(service.createJoinIntent({ publicHandle: " Alisa-Vega " })).resolves.toEqual({
      token: "join_1234567890abcdef",
      astrologer: {
        userId: "22222222-2222-4222-8222-222222222222",
        publicHandle: "alisa-vega",
        publicName: "Алиса Вега"
      },
      expiresAt: "2026-07-06T11:00:00.000Z"
    });
    expect(profileReader.findPublishedByPublicHandle).toHaveBeenCalledWith({
      publicHandle: "alisa-vega"
    });
    expect(store.createJoinIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId: "22222222-2222-4222-8222-222222222222",
        tokenHash: "sha256:e33b027e982588fdc45c1182c93d740ab110e2bee6d20a71f6279b400ddd425d",
        publicHandleSnapshot: "alisa-vega"
      })
    );
  });
});
