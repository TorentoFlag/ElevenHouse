import { describe, expect, it, vi } from "vitest";

import {
  decideSessionBookingLifecycleProjection,
  processPendingSessionBookingLifecycleEvents,
  runSessionMaintenance
} from "./session-provisioning";

describe("Session booking lifecycle projection", () => {
  it("provisions only a confirmed video Booking", () => {
    expect(
      decideSessionBookingLifecycleProjection({ eventKind: "confirmed", deliveryFormat: "video" })
    ).toBe("provision");
    expect(
      decideSessionBookingLifecycleProjection({ eventKind: "confirmed", deliveryFormat: "audio" })
    ).toBe("ignore");
    expect(
      decideSessionBookingLifecycleProjection({ eventKind: "rescheduled", deliveryFormat: "video" })
    ).toBe("reschedule");
    expect(
      decideSessionBookingLifecycleProjection({ eventKind: "cancelled", deliveryFormat: "video" })
    ).toBe("cancel");
    expect(
      decideSessionBookingLifecycleProjection({ eventKind: "completed", deliveryFormat: "video" })
    ).toBe("ignore");
  });

  it("delegates a bounded idempotent projection batch", async () => {
    const processPending = vi.fn(async () => ({ processed: 2, provisioned: 1, updated: 1, ignored: 0 }));
    await expect(
      processPendingSessionBookingLifecycleEvents({
        store: { processPending },
        now: new Date("2026-08-13T09:00:00Z"),
        batchSize: 25
      })
    ).resolves.toEqual({ processed: 2, provisioned: 1, updated: 1, ignored: 0 });
    expect(processPending).toHaveBeenCalledWith({ now: "2026-08-13T09:00:00.000Z", limit: 25 });
  });

  it("expires never-started Sessions and ends active rooms after both participants are absent", async () => {
    const expireScheduled = vi.fn(async () => ["scheduled-session"]);
    const endAbsentActive = vi.fn(async () => ["active-session"]);
    await expect(
      runSessionMaintenance({
        store: { expireScheduled, endAbsentActive },
        now: new Date("2026-08-13T11:30:00Z"),
        batchSize: 20
      })
    ).resolves.toEqual({ expired: ["scheduled-session"], ended: ["active-session"] });
    expect(expireScheduled).toHaveBeenCalledWith({ now: "2026-08-13T11:30:00.000Z", limit: 20 });
    expect(endAbsentActive).toHaveBeenCalledWith({
      now: "2026-08-13T11:30:00.000Z",
      absentBefore: "2026-08-13T11:15:00.000Z",
      limit: 20
    });
  });
});
