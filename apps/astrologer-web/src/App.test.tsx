import { describe, expect, it } from "vitest";
import { ASTROLOGER_WEB_APP_TITLE } from "./app-title";

describe("astrologer web shell", () => {
  it("exposes the astrologer web app title", () => {
    expect(ASTROLOGER_WEB_APP_TITLE).toBe("ElevenHouse Astrologer Web");
  });
});
