import type { CalendarEntry, ManualBooking } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import { formatMoneyMinor } from "../../products/model/productFormatting";

export type BookingDetailViewModel = {
  readonly clientName: string;
  readonly clientInitials: string;
  readonly productTitle: string;
  readonly priceLabel: string;
  readonly productAndPriceLabel: string;
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly deliveryFormatLabel: string;
};

export function createBookingDetailViewModel(input: {
  readonly entry: CalendarEntry;
  readonly booking: ManualBooking;
  readonly timeZone: string;
  readonly locale: SupportedLocale;
  readonly copy: AstrologerCopy["calendar"]["bookingDetail"];
}): BookingDetailViewModel {
  const locale = input.locale === "ru" ? "ru-RU" : "en-US";
  const start = new Date(input.booking.startAt);
  const end = new Date(input.booking.endAt);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: input.timeZone
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: input.timeZone
  });
  const priceLabel = formatMoneyMinor(
    input.booking.priceMinor,
    input.booking.currency,
    input.locale
  );
  return {
    clientName: input.entry.title,
    clientInitials: createClientInitials(input.entry.title),
    productTitle: input.booking.productTitle,
    priceLabel,
    productAndPriceLabel: `${input.booking.productTitle} · ${priceLabel}`,
    dateLabel: capitalize(dateLabel),
    timeLabel: `${timeFormatter.format(start)}–${timeFormatter.format(end)} · ${
      input.booking.durationMinutes
    } ${input.locale === "ru" ? "мин" : "min"}`,
    deliveryFormatLabel: input.copy.deliveryFormats[input.booking.deliveryFormat]
  };
}

export function createClientInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

function capitalize(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;
}
