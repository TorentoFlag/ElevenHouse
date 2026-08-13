import { describe, expect, it, vi } from "vitest";

import { SessionsService } from "./sessions.service";

describe("astrologer SessionsService", () => {
  it("never returns provider room authority from an authenticated Session projection", async () => {
    const projection = sessionProjection();
    const service = new SessionsService(
      { getForActor: vi.fn(async () => projection), listForActor: vi.fn(), listMessages: vi.fn(), listRealtimeEvents: vi.fn() },
      { issueJoin: vi.fn(async () => ({ kind: "authorized", sessionId: projection.id, providerRoomName: "secret-room", providerParticipantId: "participant", participantRole: "astrologer", participantDisplayName: "Анна" })) } as never,
      {} as never
    );
    const response = await service.get(projection.id, "owner", new Date("2026-08-13T09:50:00Z"));
    expect(JSON.stringify(response)).not.toContain("secret-room");
    expect(response.session.joinPolicy).toEqual({ kind: "allowed", joinableAt: null });
  });
});

function sessionProjection() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    bookingId: "22222222-2222-4222-8222-222222222222",
    state: "scheduled" as const,
    lifecycleRevision: 1,
    bookingState: "confirmed" as const,
    productTitle: "Консультация",
    scheduledStartAt: "2026-08-13T10:00:00.000Z",
    scheduledEndAt: "2026-08-13T11:00:00.000Z",
    timeZone: "Europe/Moscow",
    startedAt: null,
    endedAt: null,
    endReason: null,
    currentParticipantRole: "astrologer" as const,
    participants: [
      { role: "astrologer" as const, displayName: "Анна", firstJoinedAt: null, lastJoinedAt: null, isPresent: false },
      { role: "client" as const, displayName: "Марина К", firstJoinedAt: null, lastJoinedAt: null, isPresent: false }
    ],
    latestMessageSequence: "0",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}
