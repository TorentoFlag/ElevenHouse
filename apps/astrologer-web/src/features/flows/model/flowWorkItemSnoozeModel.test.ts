import { describe, expect, it } from "vitest";

import {
  createFlowWorkItemSnoozeDraft,
  resolveFlowWorkItemSnoozeDraft
} from "./flowWorkItemSnoozeModel";

const now = new Date("2026-08-05T08:15:30.000Z");

describe("flowWorkItemSnoozeModel", () => {
  it("defaults to one absolute hour and seeds custom time in the profile timezone", () => {
    const draft = createFlowWorkItemSnoozeDraft({
      now,
      timeZone: "Europe/Moscow"
    });

    expect(draft).toEqual({
      option: "one_hour",
      customLocalDateTime: "2026-08-05T12:15"
    });
    expect(
      resolveFlowWorkItemSnoozeDraft({
        ...draft,
        locale: "ru",
        now,
        timeZone: "Europe/Moscow"
      })
    ).toMatchObject({
      snoozedUntil: "2026-08-05T09:15:30.000Z",
      validation: null
    });
  });

  it("resolves tomorrow at 09:00 in the profile timezone", () => {
    expect(
      resolveFlowWorkItemSnoozeDraft({
        option: "tomorrow_morning",
        customLocalDateTime: "",
        locale: "en",
        now,
        timeZone: "Europe/Moscow"
      })
    ).toMatchObject({
      snoozedUntil: "2026-08-06T06:00:00.000Z",
      validation: null
    });
  });

  it("converts a custom local date and time into an offset-bearing instant", () => {
    expect(
      resolveFlowWorkItemSnoozeDraft({
        option: "custom",
        customLocalDateTime: "2026-08-06T09:45",
        locale: "ru",
        now,
        timeZone: "Europe/Moscow"
      })
    ).toMatchObject({
      snoozedUntil: "2026-08-06T06:45:00.000Z",
      validation: null
    });
  });

  it("rejects an empty or non-future custom value with localized validation", () => {
    expect(
      resolveFlowWorkItemSnoozeDraft({
        option: "custom",
        customLocalDateTime: "",
        locale: "ru",
        now,
        timeZone: "Europe/Moscow"
      })
    ).toMatchObject({
      snoozedUntil: null,
      validation: {
        code: "required",
        message: "Выберите дату и время."
      }
    });

    expect(
      resolveFlowWorkItemSnoozeDraft({
        option: "custom",
        customLocalDateTime: "2026-08-05T11:15",
        locale: "en",
        now,
        timeZone: "Europe/Moscow"
      })
    ).toMatchObject({
      snoozedUntil: null,
      validation: {
        code: "not_future",
        message: "The return time must be in the future."
      }
    });
  });

  it("fails closed for a nonexistent spring-forward local time", () => {
    expect(
      resolveFlowWorkItemSnoozeDraft({
        option: "custom",
        customLocalDateTime: "2024-03-31T02:30",
        locale: "ru",
        now: new Date("2024-03-30T12:00:00.000Z"),
        timeZone: "Europe/Berlin"
      })
    ).toMatchObject({
      snoozedUntil: null,
      validation: {
        code: "nonexistent_local_time",
        message:
          "Это местное время не существует из-за перехода часового пояса. Выберите другое время."
      }
    });
  });

  it("fails closed for an ambiguous fall-back local time", () => {
    expect(
      resolveFlowWorkItemSnoozeDraft({
        option: "custom",
        customLocalDateTime: "2024-10-27T02:30",
        locale: "en",
        now: new Date("2024-10-26T12:00:00.000Z"),
        timeZone: "Europe/Berlin"
      })
    ).toMatchObject({
      snoozedUntil: null,
      validation: {
        code: "ambiguous_local_time",
        message:
          "This local time occurs twice because of a timezone transition. Choose another time."
      }
    });
  });

  it("does not substitute a fallback timezone when the profile timezone is invalid", () => {
    expect(
      resolveFlowWorkItemSnoozeDraft({
        option: "one_hour",
        customLocalDateTime: "",
        locale: "en",
        now,
        timeZone: "Not/AZone"
      })
    ).toMatchObject({
      snoozedUntil: null,
      validation: {
        code: "invalid_time_zone",
        message: "The profile timezone could not be recognized."
      }
    });
  });
});
