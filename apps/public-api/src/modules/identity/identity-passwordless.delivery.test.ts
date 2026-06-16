import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DevAuthCodeDeliveryProvider } from "./identity-passwordless.delivery";

describe("DevAuthCodeDeliveryProvider", () => {
  it("reports auth codes as sent with a deterministic dev provider message id", async () => {
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const delivery = new DevAuthCodeDeliveryProvider();

    await expect(
      delivery.deliverAuthCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email",
        identifier: "client@example.com",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "dev",
      status: "sent",
      providerMessageId: "dev:8e14390f-3db1-4d1c-9344-55679c778427"
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Dev auth code challenge=8e14390f-3db1-4d1c-9344-55679c778427 channel=email identifier=client@example.com code=123456 expiresAt=2026-06-16T10:10:00.000Z"
    );
  });
});
