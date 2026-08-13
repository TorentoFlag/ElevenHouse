import { describe, expect, it } from "vitest";

import {
  EndSessionBodySchema,
  SendSessionMessageBodySchema,
  SessionJoinCredentialResponseSchema,
  SessionResponseSchema
} from "./sessions";

const sessionId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const participantId = "33333333-3333-4333-8333-333333333333";
const operationId = "44444444-4444-4444-8444-444444444444";

const validSession = {
  schemaVersion: "session.v1",
  id: sessionId,
  bookingId,
  state: "scheduled",
  lifecycleRevision: 1,
  bookingState: "confirmed",
  productTitle: "Натальный разбор",
  scheduledStartAt: "2026-08-13T10:00:00.000Z",
  scheduledEndAt: "2026-08-13T11:00:00.000Z",
  timeZone: "Europe/Moscow",
  startedAt: null,
  endedAt: null,
  endReason: null,
  joinPolicy: { kind: "allowed", joinableAt: null },
  currentParticipantRole: "astrologer",
  participants: [
    {
      role: "astrologer",
      displayName: "Астролог",
      firstJoinedAt: null,
      lastJoinedAt: null,
      isPresent: false
    },
    {
      role: "client",
      displayName: "Марина К.",
      firstJoinedAt: null,
      lastJoinedAt: null,
      isPresent: false
    }
  ],
  latestMessageSequence: "0",
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z"
} as const;

describe("Session contracts", () => {
  it("accepts the safe participant-facing Session projection", () => {
    expect(SessionResponseSchema.parse({ session: validSession })).toEqual({
      session: validSession
    });
  });

  it("rejects recording and provider room authority from Session responses", () => {
    expect(() =>
      SessionResponseSchema.parse({ session: { ...validSession, recording: true } })
    ).toThrow();
    expect(() =>
      SessionResponseSchema.parse({ session: { ...validSession, providerRoomName: "room" } })
    ).toThrow();
  });

  it("accepts only short-lived participant credentials without room administration fields", () => {
    const credential = {
      schemaVersion: "session-join-credential.v1",
      sessionId,
      serverUrl: "wss://elevenhouse.livekit.cloud",
      participantToken: "header.payload.signature-value",
      expiresAt: "2026-08-13T09:55:00.000Z",
      participant: {
        id: participantId,
        role: "astrologer",
        displayName: "Астролог"
      },
      grants: {
        canPublishAudio: true,
        canPublishVideo: true,
        canPublishScreenShare: true,
        canSubscribe: true
      }
    } as const;

    expect(SessionJoinCredentialResponseSchema.parse(credential)).toEqual(credential);
    expect(() =>
      SessionJoinCredentialResponseSchema.parse({ ...credential, roomAdmin: true })
    ).toThrow();
  });

  it("enforces the 4,000 Unicode-code-point message boundary", () => {
    const fourThousandEmoji = "🪐".repeat(4_000);
    expect(
      SendSessionMessageBodySchema.parse({ operationId, text: fourThousandEmoji })
    ).toEqual({ operationId, text: fourThousandEmoji });
    expect(() =>
      SendSessionMessageBodySchema.parse({ operationId, text: `${fourThousandEmoji}🪐` })
    ).toThrow();
  });

  it("normalizes text but rejects blank and unexpected message fields", () => {
    expect(
      SendSessionMessageBodySchema.parse({ operationId, text: "  Привет  " })
    ).toEqual({ operationId, text: "Привет" });
    expect(() => SendSessionMessageBodySchema.parse({ operationId, text: "   " })).toThrow();
    expect(() =>
      SendSessionMessageBodySchema.parse({ operationId, text: "Привет", attachmentId: sessionId })
    ).toThrow();
  });

  it("requires an operation id for the astrologer end command", () => {
    expect(EndSessionBodySchema.parse({ operationId })).toEqual({ operationId });
    expect(() => EndSessionBodySchema.parse({})).toThrow();
  });
});
