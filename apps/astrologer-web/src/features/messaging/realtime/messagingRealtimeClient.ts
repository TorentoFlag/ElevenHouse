import {
  MessagingRealtimeEventSchema,
  MessagingRealtimeEventTypeSchema,
  type MessagingRealtimeEvent
} from "@elevenhouse/contracts";

export type MessagingRealtimeClient = {
  readonly close: () => void;
};

export type MessagingRealtimeClientInput = {
  readonly baseUrl: string;
  readonly onEvent: (event: MessagingRealtimeEvent) => void;
  readonly onError?: (error: unknown) => void;
  readonly eventSourceFactory?: (url: string) => EventSource;
};

export function createMessagingRealtimeClient(
  input: MessagingRealtimeClientInput
): MessagingRealtimeClient {
  const source = (input.eventSourceFactory ?? ((url) => new EventSource(url)))(
    `${input.baseUrl.replace(/\/+$/, "")}/messaging/events`
  );

  for (const eventType of MessagingRealtimeEventTypeSchema.options) {
    source.addEventListener(eventType, (event) => {
      try {
        input.onEvent(MessagingRealtimeEventSchema.parse(JSON.parse(event.data)));
      } catch (error) {
        input.onError?.(error);
      }
    });
  }

  source.onerror = (error) => input.onError?.(error);

  return {
    close: () => source.close()
  };
}
