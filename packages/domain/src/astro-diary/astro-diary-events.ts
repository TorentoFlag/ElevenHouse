import {
  astroDiaryEventSchema,
  type AstroDiaryEvent,
  type AstroDiaryEventType
} from "@elevenhouse/contracts";

export type { AstroDiaryEvent };

export type AstroDiaryEventInput = AstroDiaryEvent extends infer Event
  ? Event extends { eventType: AstroDiaryEventType }
    ? Omit<Event, "schemaVersion">
    : never
  : never;

export function astroDiaryEvent(input: AstroDiaryEventInput): AstroDiaryEvent {
  return astroDiaryEventSchema.parse({ ...input, schemaVersion: 1 });
}
