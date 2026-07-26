import { afterEach, describe, expect, it } from "vitest";
import type { CreateClientJoinIntentResponse } from "@elevenhouse/contracts";
import {
  clearClientJoinIntentToken,
  readClientJoinIntentToken,
  readPendingClientJoinIntent,
  writePendingClientJoinIntent
} from "./clientJoinStorage";

const futureIntent = {
  token: "join_1234567890abcdef",
  astrologer: {
    userId: "22222222-2222-4222-8222-222222222222",
    publicHandle: "alisa-vega",
    publicName: "Алиса Вега"
  },
  expiresAt: "2026-07-06T11:00:00.000Z"
} satisfies CreateClientJoinIntentResponse;

describe("clientJoinStorage", () => {
  afterEach(() => {
    clearClientJoinIntentToken();
  });

  it("persists the direct-link astrologer context alongside the token", () => {
    writePendingClientJoinIntent(futureIntent);

    expect(readClientJoinIntentToken(new Date("2026-07-06T10:00:00.000Z"))).toBe(
      "join_1234567890abcdef"
    );
    expect(readPendingClientJoinIntent(new Date("2026-07-06T10:00:00.000Z"))).toMatchObject({
      astrologer: {
        publicHandle: "alisa-vega",
        publicName: "Алиса Вега"
      }
    });
  });

  it("drops expired direct-link context before auth verification", () => {
    writePendingClientJoinIntent(futureIntent);

    expect(readClientJoinIntentToken(new Date("2026-07-06T11:00:01.000Z"))).toBeNull();
    expect(readPendingClientJoinIntent(new Date("2026-07-06T11:00:01.000Z"))).toBeNull();
  });
});
