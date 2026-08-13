import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveKitMediaRoomProvider } from "./livekit-media-room-provider";

const options = {
  serverUrl: "wss://example.livekit.cloud",
  apiKey: "api-key",
  apiSecret: "api-secret-that-is-long-enough",
  roomPrefix: "session_",
  joinTokenTtlSeconds: 300 as const
};

describe("LiveKitMediaRoomProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T09:50:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("mints a five-minute room-scoped token without recording or data grants", async () => {
    const provider = new LiveKitMediaRoomProvider(options, {
      now: () => new Date("2026-08-13T09:50:00.000Z")
    });
    const credential = await provider.createJoinCredential({
      sessionId: "00000000-0000-4000-8000-000000000001",
      roomName: "session_opaque",
      participantId: "00000000-0000-4000-8000-000000000002",
      participantName: "Марина К",
      participantRole: "client",
      issuedAt: "2026-08-13T09:50:00.000Z",
      ttlSeconds: 300
    });
    const claims = decodeJwt(credential.participantToken);

    expect(credential).toMatchObject({
      serverUrl: options.serverUrl,
      expiresAt: "2026-08-13T09:55:00.000Z"
    });
    expect(claims.video).toEqual({
      room: "session_opaque",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false
    });
    expect(Number(claims.exp) - Number(claims.nbf)).toBe(300);
    expect(JSON.stringify(claims)).not.toMatch(/record|egress|transcript/i);
  });

  it("rejects room names outside the configured opaque prefix", async () => {
    const provider = new LiveKitMediaRoomProvider(options);
    await expect(
      provider.createJoinCredential({
        sessionId: "session-id",
        roomName: "other-room",
        participantId: "participant-id",
        participantName: "Client",
        participantRole: "client",
        issuedAt: "2026-08-13T09:50:00.000Z",
        ttlSeconds: 300
      })
    ).rejects.toThrow("LiveKit room is outside the configured Session namespace");
  });

  it("maps end-room ambiguity to an observable outcome without fake success", async () => {
    const deleteRoom = vi.fn(async () => {
      throw new Error("transport reset");
    });
    const provider = new LiveKitMediaRoomProvider(options, {
      roomService: { deleteRoom, removeParticipant: vi.fn() }
    });
    await expect(
      provider.endRoom({ commandId: "command", roomName: "session_opaque" })
    ).resolves.toEqual({ kind: "outcome_unknown", safeCode: "livekit_request_failed" });
  });
});

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Expected JWT payload");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}
