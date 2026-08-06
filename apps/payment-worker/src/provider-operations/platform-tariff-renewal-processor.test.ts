import { describe, expect, it, vi } from "vitest";
import {
  createPlatformTariffRenewalProcessor,
  startPlatformTariffRenewalInterval
} from "./platform-tariff-renewal-processor";

describe("platform tariff renewal processor", () => {
  it("issues due periods through the durable issuer with one server clock instant", async () => {
    const issueDueRenewalInvoices = vi.fn(async () => ({ issued: 2, skipped: 1 }));
    const processor = createPlatformTariffRenewalProcessor({
      issuer: { issueDueRenewalInvoices }, batchSize: 25,
      now: () => new Date("2026-08-06T12:00:00.000Z")
    });
    await expect(processor.tick()).resolves.toEqual({ issued: 2, skipped: 1 });
    expect(issueDueRenewalInvoices).toHaveBeenCalledWith({ now: "2026-08-06T12:00:00.000Z", limit: 25 });
  });

  it("rejects unsafe schedules before creating a timer", () => {
    expect(() => createPlatformTariffRenewalProcessor({ issuer: {} as never, batchSize: 0 })).toThrow();
    expect(() => startPlatformTariffRenewalInterval({ processor: {} as never, intervalMs: 1, onError: vi.fn() })).toThrow();
  });
});
