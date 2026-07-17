import {
  putDefaultAvailabilityScheduleRequestSchema,
  type AvailabilitySchedule,
  type PutDefaultAvailabilityScheduleRequest
} from "@elevenhouse/contracts";

export type AvailabilityEditorForm = PutDefaultAvailabilityScheduleRequest;
export type AvailabilityWeekday = AvailabilityEditorForm["weeklyPeriods"][number]["weekday"];
export type AvailabilityPeriod = Pick<
  AvailabilityEditorForm["weeklyPeriods"][number],
  "startMinute" | "endMinute"
>;
export type AvailabilityDateOverride = AvailabilityEditorForm["dateOverrides"][number];

export function createAvailabilityEditorForm(
  schedule: AvailabilitySchedule | null,
  timeZone: string
): AvailabilityEditorForm {
  if (schedule) {
    return {
      expectedVersion: schedule.version,
      timeZone: schedule.timeZone,
      startIntervalMinutes: schedule.startIntervalMinutes,
      bufferBeforeMinutes: schedule.bufferBeforeMinutes,
      bufferAfterMinutes: schedule.bufferAfterMinutes,
      minimumNoticeMinutes: schedule.minimumNoticeMinutes,
      bookingHorizonDays: schedule.bookingHorizonDays,
      maximumBookingsPerDay: schedule.maximumBookingsPerDay,
      weeklyPeriods: schedule.weeklyPeriods.map((period) => ({ ...period })),
      dateOverrides: schedule.dateOverrides.map((override) => ({
        ...override,
        periods: override.periods.map((period) => ({ ...period }))
      })),
      productIds: [...schedule.productIds]
    };
  }

  return {
    expectedVersion: null,
    timeZone,
    startIntervalMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minimumNoticeMinutes: 360,
    bookingHorizonDays: 60,
    maximumBookingsPerDay: 5,
    weeklyPeriods: [],
    dateOverrides: [],
    productIds: []
  };
}

export function createAvailabilityScheduleCommand(
  form: AvailabilityEditorForm
): PutDefaultAvailabilityScheduleRequest {
  return putDefaultAvailabilityScheduleRequestSchema.parse(form);
}

export function addWeeklyPeriod(
  form: AvailabilityEditorForm,
  weekday: AvailabilityWeekday
): AvailabilityEditorForm {
  const periods = form.weeklyPeriods.filter((period) => period.weekday === weekday);
  const latestEnd = periods.reduce((maximum, period) => Math.max(maximum, period.endMinute), 0);
  const startMinute = latestEnd === 0 ? 540 : Math.min(latestEnd + 30, 1_380);
  const endMinute = latestEnd === 0 ? 1_020 : Math.min(startMinute + 60, 1_440);

  return {
    ...form,
    weeklyPeriods: [...form.weeklyPeriods, { weekday, startMinute, endMinute }]
  };
}

export function updateWeeklyPeriod(
  form: AvailabilityEditorForm,
  weekday: AvailabilityWeekday,
  weekdayPeriodIndex: number,
  value: AvailabilityPeriod
): AvailabilityEditorForm {
  let currentIndex = -1;
  return {
    ...form,
    weeklyPeriods: form.weeklyPeriods.map((period) => {
      if (period.weekday !== weekday) return period;
      currentIndex += 1;
      return currentIndex === weekdayPeriodIndex ? { weekday, ...value } : period;
    })
  };
}

export function removeWeeklyPeriod(
  form: AvailabilityEditorForm,
  weekday: AvailabilityWeekday,
  weekdayPeriodIndex: number
): AvailabilityEditorForm {
  let currentIndex = -1;
  return {
    ...form,
    weeklyPeriods: form.weeklyPeriods.filter((period) => {
      if (period.weekday !== weekday) return true;
      currentIndex += 1;
      return currentIndex !== weekdayPeriodIndex;
    })
  };
}

export function addDateOverride(
  form: AvailabilityEditorForm,
  date: string
): AvailabilityEditorForm {
  if (form.dateOverrides.some((override) => override.date === date)) return form;
  return {
    ...form,
    dateOverrides: [
      ...form.dateOverrides,
      { date, mode: "unavailable", periods: [] }
    ]
  };
}

export function updateDateOverride(
  form: AvailabilityEditorForm,
  index: number,
  value: AvailabilityDateOverride
): AvailabilityEditorForm {
  return {
    ...form,
    dateOverrides: form.dateOverrides.map((override, overrideIndex) =>
      overrideIndex === index ? value : override
    )
  };
}

export function removeDateOverride(
  form: AvailabilityEditorForm,
  index: number
): AvailabilityEditorForm {
  return {
    ...form,
    dateOverrides: form.dateOverrides.filter((_, overrideIndex) => overrideIndex !== index)
  };
}

export function toggleAvailabilityProduct(
  form: AvailabilityEditorForm,
  productId: string
): AvailabilityEditorForm {
  return {
    ...form,
    productIds: form.productIds.includes(productId)
      ? form.productIds.filter((id) => id !== productId)
      : [...form.productIds, productId]
  };
}

export function minuteToTime(value: number): string {
  if (value === 1_440) return "24:00";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
