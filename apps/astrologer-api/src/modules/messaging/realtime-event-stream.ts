import { BadRequestException, type MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { MessagingRealtimeEventSchema } from "@elevenhouse/contracts";
import type { MessagingReadStore } from "@elevenhouse/domain";

const maxPostgresInt8 = 9223372036854775807n;

export function parseMessagingLastEventId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new BadRequestException("Invalid messaging Last-Event-ID");
  }
  if (BigInt(normalized) > maxPostgresInt8) {
    throw new BadRequestException("Invalid messaging Last-Event-ID");
  }
  return normalized;
}

export function createMessagingRealtimeEventStream(input: {
  readonly readStore: MessagingReadStore;
  readonly astrologerUserId: string;
  readonly lastEventId: string | undefined;
  readonly pollIntervalMs: number;
  readonly heartbeatIntervalMs: number;
}): Observable<MessageEvent> {
  const initialCursor = parseMessagingLastEventId(input.lastEventId);

  return new Observable<MessageEvent>((subscriber) => {
    let cursor = initialCursor;
    let polling = false;
    let closed = false;

    const poll = async () => {
      if (polling || closed) return;
      polling = true;
      try {
        const result = await input.readStore.listRealtimeEvents({
          astrologerUserId: input.astrologerUserId,
          afterEventId: cursor,
          limit: 100
        });
        for (const event of result.events) {
          if (closed) return;
          const data = MessagingRealtimeEventSchema.parse({
            eventId: event.eventId,
            type: event.type,
            occurredAt: event.occurredAt,
            threadId: event.threadId,
            messageId: event.messageId,
            channelConnectionId: event.channelConnectionId,
            externalIdentityId: event.externalIdentityId
          });
          cursor = data.eventId;
          subscriber.next({ id: data.eventId, type: data.type, data });
        }
      } catch (error) {
        subscriber.error(error);
      } finally {
        polling = false;
      }
    };

    void poll();
    const pollTimer = setInterval(() => void poll(), input.pollIntervalMs);
    const heartbeatTimer = setInterval(() => {
      if (!closed) subscriber.next({ type: "heartbeat", data: { ok: true } });
    }, input.heartbeatIntervalMs);

    return () => {
      closed = true;
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
    };
  });
}
