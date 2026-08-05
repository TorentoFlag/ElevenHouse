import type { CalendarEntry, ManualBooking } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { createBookingDetailViewModel } from "./bookingDetailModel";

const entry: CalendarEntry = {
  id: "4fa66e6e-cb18-4d2b-81c5-4fd84bd334ae",
  kind: "booking",
  startAt: "2026-05-29T08:00:00.000Z",
  endAt: "2026-05-29T09:00:00.000Z",
  title: "Марина К.",
  subtitle: "Натальный разбор",
  deliveryFormat: "video",
  displayStatus: "confirmed"
};

const booking: ManualBooking = {
  id: entry.id,
  reservationId: "6fc48a44-cc13-4307-9531-17a0bd95b85a",
  clientUserId: "e0b69d64-2f20-4368-a8d0-acb676f1a574",
  productId: "45f17dc4-3160-48bd-9743-081dc32d64b9",
  source: "manual",
  state: "confirmed",
  lifecycleRevision: 1,
  holdExpiresAt: null,
  startAt: entry.startAt,
  endAt: entry.endAt,
  productTitle: "Натальный разбор",
  durationMinutes: 60,
  deliveryFormat: "video",
  priceMinor: 490_000,
  currency: "RUB",
  timeZone: "Europe/Moscow",
  policySnapshot: {
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    minimumNoticeMinutes: 360
  },
  createdAt: "2026-05-20T09:00:00.000Z",
  updatedAt: "2026-05-20T09:00:00.000Z"
};

describe("booking detail model", () => {
  it("formats the authoritative booking snapshot for the Russian panel", () => {
    expect(
      createBookingDetailViewModel({
        entry,
        booking,
        timeZone: "Europe/Moscow",
        locale: "ru",
        copy: astrologerCopyByLocale.ru.calendar.bookingDetail
      })
    ).toEqual({
      clientName: "Марина К.",
      clientInitials: "МК",
      productTitle: "Натальный разбор",
      priceLabel: "4 900 ₽",
      productAndPriceLabel: "Натальный разбор · 4 900 ₽",
      dateLabel: "Пт, 29 мая",
      timeLabel: "11:00–12:00 · 60 мин",
      deliveryFormatLabel: "Видеозвонок"
    });
  });

  it("uses locale-safe labels without changing the persisted snapshot", () => {
    expect(
      createBookingDetailViewModel({
        entry,
        booking,
        timeZone: "Europe/Moscow",
        locale: "en",
        copy: astrologerCopyByLocale.en.calendar.bookingDetail
      })
    ).toMatchObject({
      clientName: "Марина К.",
      clientInitials: "МК",
      productAndPriceLabel: "Натальный разбор · RUB 4,900",
      dateLabel: "Fri, May 29",
      timeLabel: "11:00 AM–12:00 PM · 60 min",
      deliveryFormatLabel: "Video call"
    });
  });

  it("formats the panel in the current calendar timezone rather than the historical snapshot zone", () => {
    expect(
      createBookingDetailViewModel({
        entry,
        booking,
        timeZone: "America/New_York",
        locale: "en",
        copy: astrologerCopyByLocale.en.calendar.bookingDetail
      })
    ).toMatchObject({
      dateLabel: "Fri, May 29",
      timeLabel: "04:00 AM–05:00 AM · 60 min"
    });
  });
});
