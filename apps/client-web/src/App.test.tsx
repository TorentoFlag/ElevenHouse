import { describe, expect, it } from "vitest";
import { CLIENT_WEB_APP_TITLE } from "./app-title";

describe("client web shell", () => {
  it("exposes the client web app title", () => {
    expect(CLIENT_WEB_APP_TITLE).toBe("ElevenHouse Client Web");
  });
});
