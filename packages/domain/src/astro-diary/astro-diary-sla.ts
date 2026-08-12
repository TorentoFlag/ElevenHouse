import { Temporal } from "@js-temporal/polyfill";

export type AstroDiaryResponseDueEvidence = Readonly<{
  dueAt: string;
  responseSlaWorkingDays: number;
  workingWeekdays: readonly number[];
  serviceTimezone: string;
  resolvedDueLocal: string;
  resolvedDueOffset: string;
}>;

export function calculateAstroDiaryResponseDue(input: {
  readonly openedAt: string;
  readonly responseSlaWorkingDays: number;
  readonly workingWeekdays: readonly number[];
  readonly serviceTimezone: string;
}): AstroDiaryResponseDueEvidence {
  if (
    !Number.isInteger(input.responseSlaWorkingDays) ||
    input.responseSlaWorkingDays < 1 ||
    input.responseSlaWorkingDays > 30
  ) {
    throw new TypeError("Response SLA working days must be an integer from 1 to 30");
  }
  if (
    input.workingWeekdays.length === 0 ||
    input.workingWeekdays.length > 7 ||
    new Set(input.workingWeekdays).size !== input.workingWeekdays.length ||
    input.workingWeekdays.some(
      (weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7
    )
  ) {
    throw new TypeError("Working weekdays must be a non-empty unique ISO weekday set");
  }

  const opened = Temporal.Instant.from(input.openedAt).toZonedDateTimeISO(input.serviceTimezone);
  let dueDate = opened.toPlainDate();
  let remaining = input.responseSlaWorkingDays;
  const workingWeekdays = new Set(input.workingWeekdays);
  while (remaining > 0) {
    dueDate = dueDate.add({ days: 1 });
    if (workingWeekdays.has(dueDate.dayOfWeek)) remaining -= 1;
  }

  const due = dueDate
    .toPlainDateTime(opened.toPlainTime())
    .toZonedDateTime(input.serviceTimezone, { disambiguation: "later" });

  return Object.freeze({
    dueAt: due.toInstant().toString(),
    responseSlaWorkingDays: input.responseSlaWorkingDays,
    workingWeekdays: Object.freeze([...input.workingWeekdays]),
    serviceTimezone: input.serviceTimezone,
    resolvedDueLocal: due.toPlainDateTime().toString(),
    resolvedDueOffset: due.offset
  });
}
