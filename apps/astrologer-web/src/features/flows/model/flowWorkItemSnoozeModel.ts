import { Temporal } from "temporal-polyfill";

export type FlowWorkItemSnoozeLocale = "ru" | "en";
export type FlowWorkItemSnoozeOption = "one_hour" | "tomorrow_morning" | "custom";
export type FlowWorkItemSnoozeValidationCode =
  | "required"
  | "invalid_date_time"
  | "invalid_time_zone"
  | "nonexistent_local_time"
  | "ambiguous_local_time"
  | "not_future";

export type FlowWorkItemSnoozeDraft = {
  readonly option: FlowWorkItemSnoozeOption;
  readonly customLocalDateTime: string;
};

export type FlowWorkItemSnoozeResolution = {
  readonly snoozedUntil: string | null;
  readonly formattedSnoozedUntil: string | null;
  readonly validation: {
    readonly code: FlowWorkItemSnoozeValidationCode;
    readonly message: string;
  } | null;
};

type FlowWorkItemSnoozeContext = {
  readonly locale: FlowWorkItemSnoozeLocale;
  readonly now: Date;
  readonly timeZone: string;
};

export function createFlowWorkItemSnoozeDraft(input: {
  readonly now: Date;
  readonly timeZone: string;
}): FlowWorkItemSnoozeDraft {
  const nowInstant = parseDateInstant(input.now);
  const customLocalDateTime =
    nowInstant && isValidTimeZone(input.timeZone)
      ? nowInstant
          .add({ hours: 1 })
          .toZonedDateTimeISO(input.timeZone)
          .toPlainDateTime()
          .toString({ smallestUnit: "minute" })
      : "";

  return {
    option: "one_hour",
    customLocalDateTime
  };
}

export function resolveFlowWorkItemSnoozeDraft(
  input: FlowWorkItemSnoozeDraft & FlowWorkItemSnoozeContext
): FlowWorkItemSnoozeResolution {
  if (!isValidTimeZone(input.timeZone)) {
    return invalid("invalid_time_zone", input.locale);
  }

  const nowInstant = parseDateInstant(input.now);
  if (!nowInstant) {
    return invalid("invalid_date_time", input.locale);
  }

  if (input.option === "one_hour") {
    return resolved(nowInstant.add({ hours: 1 }), input);
  }

  if (input.option === "tomorrow_morning") {
    const tomorrow = nowInstant.toZonedDateTimeISO(input.timeZone).toPlainDate().add({ days: 1 });
    const localDateTime = tomorrow.toPlainDateTime(Temporal.PlainTime.from("09:00"));
    return resolveLocalDateTime(localDateTime, nowInstant, input);
  }

  if (input.customLocalDateTime.length === 0) {
    return invalid("required", input.locale);
  }

  const localDateTime = parseNativeLocalDateTime(input.customLocalDateTime);
  if (!localDateTime) {
    return invalid("invalid_date_time", input.locale);
  }

  return resolveLocalDateTime(localDateTime, nowInstant, input);
}

function resolveLocalDateTime(
  localDateTime: Temporal.PlainDateTime,
  nowInstant: Temporal.Instant,
  context: FlowWorkItemSnoozeContext
): FlowWorkItemSnoozeResolution {
  const fields = {
    year: localDateTime.year,
    month: localDateTime.month,
    day: localDateTime.day,
    hour: localDateTime.hour,
    minute: localDateTime.minute,
    second: localDateTime.second,
    millisecond: localDateTime.millisecond,
    timeZone: context.timeZone
  };
  const candidates = [
    Temporal.ZonedDateTime.from(fields, { disambiguation: "earlier" }),
    Temporal.ZonedDateTime.from(fields, { disambiguation: "later" })
  ];
  const matchingInstants = new Map<string, Temporal.Instant>();

  for (const candidate of candidates) {
    if (Temporal.PlainDateTime.compare(candidate.toPlainDateTime(), localDateTime) !== 0) {
      continue;
    }
    const instant = candidate.toInstant();
    matchingInstants.set(instant.toString(), instant);
  }

  if (matchingInstants.size === 0) {
    return invalid("nonexistent_local_time", context.locale);
  }
  if (matchingInstants.size > 1) {
    return invalid("ambiguous_local_time", context.locale);
  }

  const instant = matchingInstants.values().next().value;
  if (!instant || Temporal.Instant.compare(instant, nowInstant) <= 0) {
    return invalid("not_future", context.locale);
  }

  return resolved(instant, context);
}

function parseNativeLocalDateTime(value: string): Temporal.PlainDateTime | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  try {
    const localDateTime = Temporal.PlainDateTime.from(value);
    return localDateTime.toString({ smallestUnit: "minute" }) === value ? localDateTime : null;
  } catch {
    return null;
  }
}

function parseDateInstant(value: Date): Temporal.Instant | null {
  try {
    return Temporal.Instant.from(value.toISOString());
  } catch {
    return null;
  }
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function resolved(
  instant: Temporal.Instant,
  context: Pick<FlowWorkItemSnoozeContext, "locale" | "timeZone">
): FlowWorkItemSnoozeResolution {
  const snoozedUntil = instant.toString({ smallestUnit: "millisecond" });
  const formattedSnoozedUntil = new Intl.DateTimeFormat(context.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.timeZone
  }).format(new Date(instant.epochMilliseconds));

  return {
    snoozedUntil,
    formattedSnoozedUntil,
    validation: null
  };
}

function invalid(
  code: FlowWorkItemSnoozeValidationCode,
  locale: FlowWorkItemSnoozeLocale
): FlowWorkItemSnoozeResolution {
  return {
    snoozedUntil: null,
    formattedSnoozedUntil: null,
    validation: {
      code,
      message: validationCopy[locale][code]
    }
  };
}

const validationCopy = {
  ru: {
    required: "Выберите дату и время.",
    invalid_date_time: "Укажите корректные дату и время.",
    invalid_time_zone: "Не удалось распознать часовой пояс профиля.",
    nonexistent_local_time:
      "Это местное время не существует из-за перехода часового пояса. Выберите другое время.",
    ambiguous_local_time:
      "Это местное время встречается дважды из-за перехода часового пояса. Выберите другое время.",
    not_future: "Время возврата должно быть в будущем."
  },
  en: {
    required: "Choose a date and time.",
    invalid_date_time: "Enter a valid date and time.",
    invalid_time_zone: "The profile timezone could not be recognized.",
    nonexistent_local_time:
      "This local time does not exist because of a timezone transition. Choose another time.",
    ambiguous_local_time:
      "This local time occurs twice because of a timezone transition. Choose another time.",
    not_future: "The return time must be in the future."
  }
} as const satisfies Record<
  FlowWorkItemSnoozeLocale,
  Record<FlowWorkItemSnoozeValidationCode, string>
>;
