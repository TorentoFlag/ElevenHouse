/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoSessionExperience } from "./VideoSessionExperience.js";
import type { SessionApi } from "./sessionApi.js";

const connect = vi.fn();
const setMicrophoneEnabled = vi.fn();
const setCameraEnabled = vi.fn();
const setScreenShareEnabled = vi.fn();

vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map();
    localParticipant = {
      isScreenShareEnabled: false,
      setMicrophoneEnabled,
      setCameraEnabled,
      setScreenShareEnabled,
      getTrackPublication: () => null
    };

    on() {
      return this;
    }

    connect = connect;

    disconnect() {
      return undefined;
    }
  }

  return {
    RemoteParticipant: class {},
    Room,
    RoomEvent: {
      ParticipantConnected: "participantConnected",
      ParticipantDisconnected: "participantDisconnected",
      TrackSubscribed: "trackSubscribed",
      TrackUnsubscribed: "trackUnsubscribed",
      TrackMuted: "trackMuted",
      TrackUnmuted: "trackUnmuted",
      Reconnecting: "reconnecting",
      Reconnected: "reconnected",
      Disconnected: "disconnected"
    },
    Track: { Source: { ScreenShare: "screen_share", Camera: "camera", Microphone: "microphone" } }
  };
});

describe("VideoSessionExperience", () => {
  beforeEach(() => {
    connect.mockReset().mockResolvedValue(undefined);
    setMicrophoneEnabled.mockReset().mockResolvedValue(undefined);
    setCameraEnabled.mockReset().mockResolvedValue(undefined);
    setScreenShareEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("renders an accessible prejoin state without a recording control", () => {
    const markup = renderToStaticMarkup(
      <VideoSessionExperience
        api={{} as never}
        locale="ru"
        sessionId="22222222-2222-4222-8222-222222222222"
        onExit={() => undefined}
      />
    );

    expect(markup).toContain("Без записи");
    expect(markup).toContain("aria-label=\"Видеосессия\"");
    expect(markup).not.toContain("Запись звонка");
  });

  it("enters the room after LiveKit connect even when device enable is still pending", async () => {
    setMicrophoneEnabled.mockReturnValue(new Promise(() => undefined));
    setCameraEnabled.mockReturnValue(new Promise(() => undefined));
    render(
      <VideoSessionExperience
        api={createApi()}
        locale="ru"
        sessionId="22222222-2222-4222-8222-222222222222"
        onExit={() => undefined}
      />
    );

    await userEvent.click(await screen.findByRole("button", { name: "Войти в сессию" }));

    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Ждём второго участника…")).toBeTruthy();
  });
});

function createApi(): SessionApi {
  return {
    async session() {
      return {
        session: {
          schemaVersion: "session.v1",
          id: "22222222-2222-4222-8222-222222222222",
          bookingId: "11111111-1111-4111-8111-111111111111",
          state: "active",
          lifecycleRevision: 1,
          bookingState: "confirmed",
          productTitle: "Натальный разбор",
          scheduledStartAt: "2026-08-13T10:00:00.000Z",
          scheduledEndAt: "2026-08-13T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          startedAt: "2026-08-13T10:00:00.000Z",
          endedAt: null,
          endReason: null,
          joinPolicy: { kind: "allowed", joinableAt: null },
          currentParticipantRole: "astrologer",
          participants: [
            {
              role: "astrologer",
              displayName: "Анна Смирнова",
              firstJoinedAt: null,
              lastJoinedAt: null,
              isPresent: true
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
          createdAt: "2026-08-13T09:00:00.000Z",
          updatedAt: "2026-08-13T10:00:00.000Z"
        }
      };
    },
    async join() {
      return {
        schemaVersion: "session-join-credential.v1",
        sessionId: "22222222-2222-4222-8222-222222222222",
        serverUrl: "wss://example.livekit.cloud",
        participantToken: "token-token-token-token",
        expiresAt: "2026-08-13T10:05:00.000Z",
        participant: {
          id: "33333333-3333-4333-8333-333333333333",
          role: "astrologer",
          displayName: "Анна Смирнова"
        },
        grants: {
          canPublishAudio: true,
          canPublishVideo: true,
          canPublishScreenShare: true,
          canSubscribe: true
        }
      };
    },
    async messages() {
      return { messages: [], nextAfterSequence: null };
    },
    async sendMessage() {
      throw new Error("not used");
    },
    async events() {
      return { events: [] };
    },
    async list() {
      return { sessions: [] };
    },
    async end() {
      throw new Error("not used");
    }
  };
}
