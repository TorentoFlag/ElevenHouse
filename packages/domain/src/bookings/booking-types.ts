import type {
  ProductCurrency,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductParticipantMode,
  ProductStatus
} from "../products";

export type BookingState = "confirmed" | "cancelled";

export type BookingPolicySnapshot = {
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly minimumNoticeMinutes: number;
};

export type Booking = {
  readonly id: string;
  readonly reservationId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly productId: string;
  readonly state: BookingState;
  readonly startAt: string;
  readonly endAt: string;
  readonly productTitle: string;
  readonly durationMinutes: number;
  readonly deliveryFormat: ProductDeliveryFormat;
  readonly priceMinor: number;
  readonly currency: ProductCurrency;
  readonly timeZone: string;
  readonly policySnapshot: BookingPolicySnapshot;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type BookingProduct = {
  readonly id: string;
  readonly title: string;
  readonly status: ProductStatus;
  readonly executionMode: ProductExecutionMode;
  readonly participantMode: ProductParticipantMode;
  readonly durationMinutes: number | null;
  readonly deliveryFormats: readonly ProductDeliveryFormat[];
  readonly priceMinor: number;
  readonly currency: ProductCurrency;
};

export type CreateManualBookingInput = {
  readonly clientUserId: string;
  readonly productId: string;
  readonly deliveryFormat: ProductDeliveryFormat;
  readonly projectedStartAt: string;
};

export type CreateManualBookingResult = {
  readonly booking: Booking;
  readonly replayed: boolean;
};

export type AvailableBookingSlot = {
  readonly startAt: string;
  readonly endAt: string;
};

export type AvailableBookingSlotsResult = {
  readonly productId: string;
  readonly timeZone: string;
  readonly slots: readonly AvailableBookingSlot[];
};
