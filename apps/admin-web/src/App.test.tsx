import { describe, expect, it } from "vitest";
import { ADMIN_WEB_APP_TITLE } from "./app-title";

describe("admin web shell", () => {
  it("exposes the admin web app title", () => {
    expect(ADMIN_WEB_APP_TITLE).toBe("ElevenHouse Admin Web");
  });
});
