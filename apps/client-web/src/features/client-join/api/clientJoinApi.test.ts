import { describe, expect, it, vi } from "vitest";
import { createClientJoinIntent } from "./clientJoinApi";

vi.mock("../../../Application", () => ({
  application: {
    http: {
      post: vi.fn(async () => ({
        token: "join_1234567890abcdef",
        astrologer: {
          userId: "22222222-2222-4222-8222-222222222222",
          publicHandle: "alisa-vega",
          publicName: "Алиса Вега"
        },
        expiresAt: "2026-07-06T11:00:00.000Z"
      }))
    }
  }
}));

describe("createClientJoinIntent", () => {
  it("normalizes the handle and calls the public API", async () => {
    await expect(createClientJoinIntent({ publicHandle: " Alisa-Vega " })).resolves.toMatchObject({
      token: "join_1234567890abcdef",
      astrologer: { publicHandle: "alisa-vega" }
    });
  });
});
