import type {
  AvailableBookingSlotsResponse,
  AvailabilitySchedule,
  ProductDeliveryFormat,
  ProductResponse
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { CreateManualBookingInput } from "../api/createManualBooking";

export type ManualBookingProduct = Omit<
  Pick<
    ProductResponse,
    | "id"
    | "title"
    | "status"
    | "executionMode"
    | "participantMode"
    | "durationMinutes"
    | "deliveryFormats"
    | "priceMinor"
    | "currency"
  >,
  "deliveryFormats"
> & { readonly deliveryFormats: readonly ProductDeliveryFormat[] };

export type ManualBookingSlotOption = {
  readonly value: string;
  readonly endAt: string;
  readonly dateKey: string;
  readonly dateLabel: string;
  readonly timeLabel: string;
};

export function getBookableManualBookingProducts(
  products: readonly ManualBookingProduct[],
  schedule: Pick<AvailabilitySchedule, "productIds"> | null
): readonly ManualBookingProduct[] {
  if (!schedule) return [];
  const assignedProductIds = new Set(schedule.productIds);

  return products.filter(
    (product) =>
      assignedProductIds.has(product.id) &&
      product.status === "active" &&
      product.executionMode === "live" &&
      product.participantMode === "solo" &&
      product.durationMinutes !== null &&
      product.durationMinutes > 0
  );
}

export function toManualBookingSlotOptions(
  response: AvailableBookingSlotsResponse,
  locale: SupportedLocale
): readonly ManualBookingSlotOption[] {
  const dateKeyFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: response.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const dateLabelFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: response.timeZone,
    weekday: "short",
    day: "numeric",
    month: "long"
  });
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: response.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  return response.slots.map((slot) => {
    const start = new Date(slot.startAt);
    return {
      value: slot.startAt,
      endAt: slot.endAt,
      dateKey: dateKeyFormatter.format(start),
      dateLabel: dateLabelFormatter.format(start),
      timeLabel: timeFormatter.format(start)
    };
  });
}

export function createManualBookingCommand(input: {
  readonly clientUserId: string;
  readonly product: ManualBookingProduct | null;
  readonly deliveryFormat: ProductDeliveryFormat | "";
  readonly projectedStartAt: string;
  readonly availableSlotStarts: readonly string[];
  readonly idempotencyKey: string;
}): CreateManualBookingInput {
  if (!input.clientUserId) throw new Error("Manual booking client is required");
  if (!input.product) throw new Error("Manual booking product is required");
  if (!input.deliveryFormat || !input.product.deliveryFormats.includes(input.deliveryFormat)) {
    throw new Error("Manual booking delivery format is required");
  }
  if (!input.availableSlotStarts.includes(input.projectedStartAt)) {
    throw new Error("Manual booking requires an available slot");
  }

  return {
    body: {
      clientUserId: input.clientUserId,
      productId: input.product.id,
      deliveryFormat: input.deliveryFormat,
      projectedStartAt: input.projectedStartAt
    },
    idempotencyKey: input.idempotencyKey
  };
}
