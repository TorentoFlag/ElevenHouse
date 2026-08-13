import { describe, expect, it } from "vitest";

import { evaluateSessionJoinPolicy, type SessionJoinPolicyInput } from "./session-join-policy";

describe("evaluateSessionJoinPolicy", () => {
  it("opens exactly ten minutes before the scheduled start", () => {
    expect(evaluateSessionJoinPolicy(fixture({ now: "2026-08-13T09:49:59.999Z" }))).toEqual({
      kind: "too_early",
      joinableAt: "2026-08-13T09:50:00Z"
    });
    expect(evaluateSessionJoinPolicy(fixture({ now: "2026-08-13T09:50:00Z" }))).toEqual({
      kind: "allowed"
    });
  });

  it("expires a never-started Session exactly thirty minutes after scheduled end", () => {
    expect(evaluateSessionJoinPolicy(fixture({ now: "2026-08-13T11:29:59.999Z" }))).toEqual({
      kind: "allowed"
    });
    expect(evaluateSessionJoinPolicy(fixture({ now: "2026-08-13T11:30:00Z" }))).toEqual({
      kind: "denied",
      reason: "expired"
    });
  });

  it("allows an active reconnect after separate Booking completion", () => {
    expect(
      evaluateSessionJoinPolicy(
        fixture({ sessionState: "active", bookingState: "completed", now: "2026-08-13T12:00:00Z" })
      )
    ).toEqual({ kind: "allowed" });
  });

  it("does not allow a completed Booking to start a scheduled Session", () => {
    expect(evaluateSessionJoinPolicy(fixture({ bookingState: "completed" }))).toEqual({
      kind: "denied",
      reason: "booking_not_confirmed"
    });
  });

  it("rejects non-video bookings, blocked relationships and terminal Sessions", () => {
    expect(evaluateSessionJoinPolicy(fixture({ deliveryFormat: "audio" }))).toEqual({
      kind: "denied",
      reason: "not_video_booking"
    });
    expect(evaluateSessionJoinPolicy(fixture({ relationshipStatus: "blocked" }))).toEqual({
      kind: "denied",
      reason: "relationship_blocked"
    });
    expect(evaluateSessionJoinPolicy(fixture({ sessionState: "ended" }))).toEqual({
      kind: "denied",
      reason: "ended"
    });
  });

  it("allows an archived but not blocked relationship to use its existing booking", () => {
    expect(evaluateSessionJoinPolicy(fixture({ relationshipStatus: "archived" }))).toEqual({
      kind: "allowed"
    });
  });
});

function fixture(overrides: Partial<SessionJoinPolicyInput> = {}): SessionJoinPolicyInput {
  return {
    sessionState: "scheduled",
    bookingState: "confirmed",
    deliveryFormat: "video",
    relationshipStatus: "active",
    scheduledStartAt: "2026-08-13T10:00:00Z",
    scheduledEndAt: "2026-08-13T11:00:00Z",
    now: "2026-08-13T10:00:00Z",
    ...overrides
  };
}
