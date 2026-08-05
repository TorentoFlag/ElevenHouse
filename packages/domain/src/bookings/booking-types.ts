import {
  productExecutionModeValues,
  productMethodValues,
  productParticipantModeValues,
  productRequiredClientDataValues,
  type ProductCurrency,
  type ProductDeliveryFormat,
  type ProductExecutionMode,
  type ProductMethod,
  type ProductParticipantMode,
  type ProductRequiredClientData,
  type ProductStatus
} from "../products";
import type {
  BookingCancellationReasonCode,
  BookingLifecycleEvent
} from "./booking-lifecycle-events";

export type BookingState =
  | "hold"
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "expired";

export type BookingSource = "manual" | "client_paid";

export type BookingPolicySnapshot = {
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly minimumNoticeMinutes: number;
};

export const bookingClientDataRequirementsSchemaVersion =
  "booking-client-data-requirements.v1" as const;

export type BookingClientDataRequirementsV1Snapshot = {
  readonly schemaVersion: typeof bookingClientDataRequirementsSchemaVersion;
  readonly executionMode: ProductExecutionMode;
  readonly participantMode: ProductParticipantMode;
  readonly requiredClientData: readonly ProductRequiredClientData[];
  readonly methods: readonly ProductMethod[];
};

export type BookingClientDataRequirementsSnapshot = BookingClientDataRequirementsV1Snapshot;

export function parseBookingClientDataRequirementsSnapshot(
  value: unknown
): BookingClientDataRequirementsSnapshot {
  if (!isRecord(value)) throw invalidRequirementsSnapshot();

  if (
    value.schemaVersion !== bookingClientDataRequirementsSchemaVersion ||
    !hasExactKeys(value, [
      "schemaVersion",
      "executionMode",
      "participantMode",
      "requiredClientData",
      "methods"
    ]) ||
    !isAllowedValue(value.executionMode, productExecutionModeValues) ||
    !isAllowedValue(value.participantMode, productParticipantModeValues)
  ) {
    throw invalidRequirementsSnapshot();
  }

  return {
    schemaVersion: bookingClientDataRequirementsSchemaVersion,
    executionMode: value.executionMode,
    participantMode: value.participantMode,
    requiredClientData: parseUniqueAllowedValues(
      value.requiredClientData,
      productRequiredClientDataValues
    ),
    methods: parseUniqueAllowedValues(value.methods, productMethodValues)
  };
}

function parseUniqueAllowedValues<const Value extends string>(
  value: unknown,
  allowed: readonly Value[]
): readonly Value[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => !isAllowedValue(item, allowed)) ||
    new Set(value).size !== value.length
  ) {
    throw invalidRequirementsSnapshot();
  }
  return [...value] as Value[];
}

function isAllowedValue<const Value extends string>(
  value: unknown,
  allowed: readonly Value[]
): value is Value {
  return typeof value === "string" && allowed.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function invalidRequirementsSnapshot(): Error {
  return new Error("Persisted booking client-data requirements snapshot is invalid");
}

export type Booking = {
  readonly id: string;
  readonly reservationId: string;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly productId: string;
  readonly source: BookingSource;
  readonly state: BookingState;
  readonly lifecycleRevision: number;
  readonly holdExpiresAt: string | null;
  readonly startAt: string;
  readonly endAt: string;
  readonly productTitle: string;
  readonly durationMinutes: number;
  readonly deliveryFormat: ProductDeliveryFormat;
  readonly priceMinor: number;
  readonly currency: ProductCurrency;
  readonly timeZone: string;
  readonly policySnapshot: BookingPolicySnapshot;
  readonly clientDataRequirementsSnapshot: BookingClientDataRequirementsSnapshot;
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
  readonly requiredClientData: readonly ProductRequiredClientData[];
  readonly methods: readonly ProductMethod[];
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

export type CreatePaidBookingHoldInput = {
  readonly productId: string;
  readonly deliveryFormat: ProductDeliveryFormat;
  readonly projectedStartAt: string;
};

export type CreatePaidBookingHoldResult = {
  readonly booking: Booking;
  readonly replayed: boolean;
};

export type CancelBookingInput = {
  readonly expectedLifecycleRevision: number;
  readonly reasonCode: BookingCancellationReasonCode;
};

export type CancelBookingResult = {
  readonly booking: Booking;
  readonly lifecycleEvent: BookingLifecycleEvent;
  readonly replayed: boolean;
};

export type CompleteBookingInput = {
  readonly expectedLifecycleRevision: number;
};

export type CompleteBookingResult = {
  readonly booking: Booking;
  readonly lifecycleEvent: BookingLifecycleEvent;
  readonly replayed: boolean;
};

export type RescheduleBookingInput = {
  readonly expectedLifecycleRevision: number;
  readonly projectedStartAt: string;
};

export type RescheduleBookingResult = {
  readonly booking: Booking;
  readonly lifecycleEvent: BookingLifecycleEvent;
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
