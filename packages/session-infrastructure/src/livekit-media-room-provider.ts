import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  type WebhookEvent
} from "livekit-server-sdk";

import type {
  MediaRoomEvent,
  MediaRoomProviderPort,
  MediaRoomWebhookInput
} from "@elevenhouse/domain";

export type LiveKitProviderOptions = {
  readonly serverUrl: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly roomPrefix: string;
  readonly joinTokenTtlSeconds: 300;
};

type LiveKitRoomService = Pick<RoomServiceClient, "deleteRoom" | "removeParticipant"> &
  Partial<Pick<RoomServiceClient, "listRooms">>;

export type LiveKitDependencies = {
  readonly now?: () => Date;
  readonly roomService?: LiveKitRoomService;
  readonly webhookReceiver?: Pick<WebhookReceiver, "receive">;
};

export class LiveKitMediaRoomProvider implements MediaRoomProviderPort {
  readonly #options: LiveKitProviderOptions;
  readonly #now: () => Date;
  readonly #roomService: LiveKitRoomService;
  readonly #webhookReceiver: Pick<WebhookReceiver, "receive">;

  constructor(options: LiveKitProviderOptions, dependencies: LiveKitDependencies = {}) {
    this.#options = validateOptions(options);
    this.#now = dependencies.now ?? (() => new Date());
    const httpUrl = options.serverUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    this.#roomService =
      dependencies.roomService ?? new RoomServiceClient(httpUrl, options.apiKey, options.apiSecret);
    this.#webhookReceiver =
      dependencies.webhookReceiver ?? new WebhookReceiver(options.apiKey, options.apiSecret);
  }

  async createJoinCredential(input: Parameters<MediaRoomProviderPort["createJoinCredential"]>[0]) {
    this.#assertRoomName(input.roomName);
    if (input.ttlSeconds !== this.#options.joinTokenTtlSeconds) {
      throw new Error("LiveKit Session token TTL must be exactly five minutes");
    }
    const token = new AccessToken(this.#options.apiKey, this.#options.apiSecret, {
      identity: input.participantId,
      name: input.participantName,
      ttl: input.ttlSeconds,
      metadata: JSON.stringify({
        schemaVersion: "session-participant.v1",
        sessionId: input.sessionId,
        role: input.participantRole
      })
    });
    token.addGrant({
      room: input.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false
    });
    const issuedAt = this.#now();
    return {
      serverUrl: this.#options.serverUrl,
      participantToken: await token.toJwt(),
      expiresAt: new Date(
        issuedAt.getTime() + this.#options.joinTokenTtlSeconds * 1_000
      ).toISOString()
    };
  }

  async removeParticipant(input: Parameters<MediaRoomProviderPort["removeParticipant"]>[0]) {
    this.#assertRoomName(input.roomName);
    try {
      await this.#roomService.removeParticipant(input.roomName, input.participantId);
      return { kind: "applied" as const };
    } catch (error) {
      if (isProviderNotFound(error)) return { kind: "already_applied" as const };
      return { kind: "outcome_unknown" as const, safeCode: "livekit_request_failed" };
    }
  }

  async endRoom(input: Parameters<MediaRoomProviderPort["endRoom"]>[0]) {
    this.#assertRoomName(input.roomName);
    try {
      await this.#roomService.deleteRoom(input.roomName);
      return { kind: "applied" as const };
    } catch (error) {
      if (isProviderNotFound(error)) return { kind: "already_applied" as const };
      return { kind: "outcome_unknown" as const, safeCode: "livekit_request_failed" };
    }
  }

  async parseWebhook(input: MediaRoomWebhookInput): Promise<MediaRoomEvent> {
    const event = await this.#webhookReceiver.receive(input.rawBody, input.authorization);
    return toMediaRoomEvent(event);
  }

  async readiness() {
    if (!this.#roomService.listRooms) return { ready: true, code: "injected_room_service" };
    try {
      await this.#roomService.listRooms([]);
      return { ready: true, code: "ready" };
    } catch {
      return { ready: false, code: "livekit_unavailable" };
    }
  }

  #assertRoomName(roomName: string): void {
    if (!roomName.startsWith(this.#options.roomPrefix)) {
      throw new Error("LiveKit room is outside the configured Session namespace");
    }
  }
}

function validateOptions(options: LiveKitProviderOptions): LiveKitProviderOptions {
  const url = new URL(options.serverUrl);
  if (url.protocol !== "wss:") throw new Error("LiveKit server URL must use wss");
  if (!options.apiKey.trim() || !options.apiSecret.trim()) {
    throw new Error("LiveKit credentials are required");
  }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(options.roomPrefix)) {
    throw new Error("LiveKit room prefix is invalid");
  }
  if (options.joinTokenTtlSeconds !== 300) {
    throw new Error("LiveKit join token TTL must be exactly 300 seconds");
  }
  return Object.freeze({ ...options });
}

function toMediaRoomEvent(event: WebhookEvent): MediaRoomEvent {
  if (
    event.event !== "participant_joined" &&
    event.event !== "participant_left" &&
    event.event !== "room_started" &&
    event.event !== "room_finished"
  ) {
    throw new Error("Unsupported LiveKit webhook event");
  }
  const roomName = event.room?.name;
  if (!event.id || !roomName) throw new Error("LiveKit webhook identity is incomplete");
  const participantId = event.participant?.identity || undefined;
  if (event.event.startsWith("participant_") && !participantId) {
    throw new Error("LiveKit participant webhook identity is incomplete");
  }
  return {
    id: event.id,
    kind: event.event,
    roomName,
    ...(participantId ? { participantId } : {}),
    occurredAt: new Date(Number(event.createdAt) * 1_000).toISOString()
  };
}

function isProviderNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { readonly code?: unknown; readonly status?: unknown };
  return candidate.code === 5 || candidate.status === 404;
}
