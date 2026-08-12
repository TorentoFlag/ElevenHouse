import { describe, expect, it } from "vitest";
import { astroDiaryEventSchema } from "@elevenhouse/contracts";
import { astroDiaryEvent, type AstroDiaryEventInput } from "./astro-diary-events";

const id = (value: number): string =>
  `60000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

describe("astroDiaryEvent", () => {
  it("runtime-validates the exact event contract at the domain boundary", () => {
    const event = astroDiaryEvent({
      eventId: id(1),
      eventType: "astro_diary.response_obligation_overdue.v1",
      occurredAt: "2026-08-12T09:00:00Z",
      data: {
        journalId: id(2),
        journalEpochId: id(3),
        cycleId: id(4),
        obligationId: id(5)
      }
    });
    expect(astroDiaryEventSchema.parse(event)).toEqual(event);
  });

  it("rejects invalid identifiers instead of emitting a malformed outbox fact", () => {
    expect(() =>
      astroDiaryEvent({
        eventId: "not-a-uuid",
        eventType: "astro_diary.cycle_closed.v1",
        occurredAt: "2026-08-12T09:00:00Z",
        data: {
          journalId: id(2),
          journalEpochId: id(3),
          cycleId: id(4)
        }
      })
    ).toThrow();
  });

  it("emits every IDs-only visible state event through the domain factory", () => {
    const common = {
      eventId: id(10),
      occurredAt: "2026-08-12T09:00:00Z",
      data: { journalId: id(2), journalEpochId: id(3) }
    } as const;
    const cases = [
      {
        ...common,
        eventType: "astro_diary.timeline_item_edited.v1",
        data: { ...common.data, cycleId: id(4), itemId: id(5) }
      },
      {
        ...common,
        eventType: "astro_diary.timeline_item_hidden.v1",
        data: { ...common.data, cycleId: id(4), itemId: id(5) }
      },
      {
        ...common,
        eventType: "astro_diary.timeline_item_erased.v1",
        data: { ...common.data, cycleId: id(4), itemId: id(5) }
      },
      {
        ...common,
        eventType: "astro_diary.context_completed.v1",
        data: { ...common.data, cycleId: id(4), itemId: id(5), contextId: id(6) }
      },
      {
        ...common,
        eventType: "astro_diary.context_failed.v1",
        data: { ...common.data, cycleId: id(4), itemId: id(5), contextId: id(6) }
      },
      {
        ...common,
        eventType: "astro_diary.ai_updated.v1",
        data: { ...common.data, cycleId: id(4), commandId: id(9) }
      },
      { ...common, eventType: "astro_diary.export_ready.v1", data: { ...common.data, commandId: id(7) } },
      { ...common, eventType: "astro_diary.export_failed.v1", data: { ...common.data, commandId: id(7) } },
      { ...common, eventType: "astro_diary.export_invalidated.v1", data: { ...common.data, commandId: id(7) } },
      { ...common, eventType: "astro_diary.erasure_completed.v1", data: { ...common.data, commandId: id(8) } },
      { ...common, eventType: "astro_diary.journal_activated.v1" }
    ] as const satisfies readonly AstroDiaryEventInput[];
    for (const input of cases) {
      const event = astroDiaryEvent(input);
      expect(event.eventType).toBe(input.eventType);
      expect(JSON.stringify(event)).not.toMatch(/body|failureCode|artifact/);
    }
  });
});
