import type { ProductCurrency, ProductDeliveryFormat } from "../products";
import type { Booking, BookingPolicySnapshot, BookingProduct } from "./booking-types";

export type ManualBookingClaim = {
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly productId: string;
  readonly scheduleId: string;
  readonly serviceStartAt: string;
  readonly serviceEndAt: string;
  readonly occupiedStartAt: string;
  readonly occupiedEndAt: string;
  readonly productSnapshot: {
    readonly title: string;
    readonly durationMinutes: number;
    readonly deliveryFormat: ProductDeliveryFormat;
    readonly priceMinor: number;
    readonly currency: ProductCurrency;
  };
  readonly scheduleSnapshot: {
    readonly timeZone: string;
    readonly policy: BookingPolicySnapshot;
  };
};

export type PaidBookingHoldClaim = ManualBookingClaim & {
  readonly holdExpiresAt: string;
};

export type ManualBookingCommand = {
  readonly actorUserId: string;
  readonly scope: "bookings.manual.create";
  readonly key: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly expiresAt: string;
};

export type PaidBookingHoldCommand = {
  readonly actorUserId: string;
  readonly scope: "bookings.paid.hold.create";
  readonly key: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly expiresAt: string;
};

export type BookingCommandStore = {
  readonly executeManualBooking: (
    command: ManualBookingCommand,
    createClaim: () => Promise<ManualBookingClaim>
  ) => Promise<{
    readonly kind: "created" | "replayed";
    readonly booking: Booking;
  }>;
  readonly executePaidHold: (
    command: PaidBookingHoldCommand,
    createClaim: () => Promise<PaidBookingHoldClaim>
  ) => Promise<{
    readonly kind: "created" | "replayed";
    readonly booking: Booking;
  }>;
  readonly confirmPaidBooking: (input: {
    readonly bookingId: string;
    readonly orderId: string;
    readonly now: string;
  }) => Promise<Booking | null>;
  readonly releasePaidBookingPaymentHold: (input: {
    readonly bookingId: string;
    readonly state: "cancelled" | "expired";
    readonly now: string;
  }) => Promise<Booking | null>;
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly bookingId: string;
  }) => Promise<Booking | null>;
};

export type BookingClientReader = {
  readonly hasActiveRelationship: (input: {
    readonly ownerUserId: string;
    readonly clientUserId: string;
  }) => Promise<boolean>;
};

export type BookingProductReader = {
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly productId: string;
  }) => Promise<BookingProduct | null>;
};
