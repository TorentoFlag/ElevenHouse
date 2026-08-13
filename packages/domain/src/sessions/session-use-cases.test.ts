import { describe, expect, it } from "vitest";

import {
  endSession,
  issueSessionJoin,
  sendSessionMessage
} from "./session-use-cases";
import type {
  MediaRoomProviderPort,
  SessionCommandStore
} from "./session-ports";
import type {
  MediaRoomCommandResult,
  MediaRoomEvent,
  MediaRoomJoinCredential
} from "./session-types";

const sessionId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const participantId = "33333333-3333-4333-8333-333333333333";
const operationId = "44444444-4444-4444-8444-444444444444";

describe("Session use cases", () => {
  it("issues provider credentials only from a store-authorized join context", async () => {
    const store = createStore({
      issueJoin: async () => ({
        kind: "authorized",
        sessionId,
        providerRoomName: "dev_session_opaque",
        providerParticipantId: participantId,
        participantRole: "astrologer",
        participantDisplayName: "Астролог"
      })
    });
    const provider = createProvider();

    await expect(
      issueSessionJoin({
        store,
        provider,
        actor: { userId: actorUserId, role: "astrologer" },
        sessionId,
        now: new Date("2026-08-13T09:50:00Z")
      })
    ).resolves.toEqual({
      sessionId,
      serverUrl: "wss://example.livekit.cloud",
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
    });
  });

  it("returns the exact replayed message and never synthesizes browser state", async () => {
    const message = {
      id: "55555555-5555-4555-8555-555555555555",
      sessionId,
      sequence: "7",
      operationId,
      senderRole: "client" as const,
      text: "Привет",
      createdAt: "2026-08-13T10:01:00.000Z"
    };
    const store = createStore({
      recordMessage: async () => ({ kind: "replayed", message })
    });

    await expect(
      sendSessionMessage({
        store,
        actor: { userId: actorUserId, role: "client" },
        sessionId,
        operationId,
        text: "  Привет  ",
        now: new Date("2026-08-13T10:01:00Z")
      })
    ).resolves.toEqual({ message, replayed: true });
  });

  it("records an ambiguous provider end instead of returning false success", async () => {
    const unknownCommands: string[] = [];
    const store = createStore({
      prepareEnd: async () => ({
        kind: "prepared",
        commandId: "66666666-6666-4666-8666-666666666666",
        sessionId,
        providerRoomName: "dev_session_opaque"
      }),
      markEndOutcomeUnknown: async ({ commandId }) => {
        unknownCommands.push(commandId);
      }
    });
    const provider = createProvider({
      endRoom: async () => ({ kind: "outcome_unknown", safeCode: "timeout" })
    });

    await expect(
      endSession({
        store,
        provider,
        actor: { userId: actorUserId, role: "astrologer" },
        sessionId,
        operationId,
        now: new Date("2026-08-13T11:01:00Z")
      })
    ).rejects.toMatchObject({ code: "session_provider_outcome_unknown" });
    expect(unknownCommands).toEqual(["66666666-6666-4666-8666-666666666666"]);
  });
});

function createStore(overrides: Partial<SessionCommandStore> = {}): SessionCommandStore {
  return {
    issueJoin: async () => ({ kind: "denied", reason: "not_found" }),
    recordMessage: async () => {
      throw new Error("Unexpected recordMessage call");
    },
    recordLeave: async () => {
      throw new Error("Unexpected recordLeave call");
    },
    prepareEnd: async () => {
      throw new Error("Unexpected prepareEnd call");
    },
    completeEnd: async () => {
      throw new Error("Unexpected completeEnd call");
    },
    markEndOutcomeUnknown: async () => undefined,
    applyProviderEvent: async () => {
      throw new Error("Unexpected applyProviderEvent call");
    },
    ...overrides
  };
}

function createProvider(overrides: Partial<MediaRoomProviderPort> = {}): MediaRoomProviderPort {
  const credential: MediaRoomJoinCredential = {
    serverUrl: "wss://example.livekit.cloud",
    participantToken: "header.payload.signature-value",
    expiresAt: "2026-08-13T09:55:00.000Z"
  };
  const applied: MediaRoomCommandResult = { kind: "applied" };
  return {
    createJoinCredential: async () => credential,
    removeParticipant: async () => applied,
    endRoom: async () => applied,
    parseWebhook: async () => ({
      id: "provider-event",
      kind: "room_finished",
      roomName: "dev_session_opaque",
      occurredAt: "2026-08-13T11:01:00.000Z"
    } satisfies MediaRoomEvent),
    readiness: async () => ({ ready: true, code: "ready" }),
    ...overrides
  };
}
