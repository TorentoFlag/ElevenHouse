import { describe, expect, it, vi } from "vitest";
import { configureLiveKitWebhookHttpSettings } from "./livekit-webhook-http-settings";

describe("configureLiveKitWebhookHttpSettings", () => {
  it("preserves the signed raw body for LiveKit's vendor JSON MIME", () => {
    const useBodyParser = vi.fn();

    configureLiveKitWebhookHttpSettings({ useBodyParser } as never);

    expect(useBodyParser).toHaveBeenCalledWith("raw", {
      type: "application/webhook+json",
      limit: "1mb"
    });
  });
});
