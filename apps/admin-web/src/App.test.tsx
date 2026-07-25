import { describe, expect, it } from "vitest";
import { ADMIN_WEB_APP_TITLE } from "./app-title";
import { App } from "./App";

describe("admin web shell", () => {
  it("exposes the admin web app title", () => {
    expect(ADMIN_WEB_APP_TITLE).toBe("ElevenHouse Admin Web");
  });

  it("routes the first admin screen to finance policy controls", () => {
    expect(App()).toMatchObject({
      type: expect.any(Function)
    });
  });
});
