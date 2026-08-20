import type { ProductCurrency, ProductDeliveryFormat } from "../products";
import type { ProjectionContext } from "../availability";
import type {
  Booking,
  BookingClientDataRequirementsSnapshot,
  BookingPolicySnapshot,
  BookingProduct
} from "./booking-types";
import type {
  BookingCancellationReasonCode,
  BookingLifecycleEvent
} from "./booking-lifecycle-events";

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
    readonly clientDataRequirements: BookingClientDataRequirementsSnapshot;
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

export type OwnerCancelBookingCommand = {
  readonly actorUserId: string;
  readonly scope: "bookings.owner.cancel";
  readonly key: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly expiresAt: string;
};

export type OwnerRescheduleBookingCommand = {
  readonly actorUserId: string;
  readonly scope: "bookings.owner.reschedule";
  readonly key: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly expiresAt: string;
};

export type OwnerCompleteBookingCommand = {
  readonly actorUserId: string;
  readonly scope: "bookings.owner.complete";
  readonly key: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly expiresAt: string;
};

export type BookingRescheduleContext = {
  readonly booking: Booking;
  readonly scheduleId: string;
  readonly availability: ProjectionContext;
};

export type BookingRescheduleClaim = {
  readonly ownerUserId: string;
  readonly bookingId: string;
  readonly reservationId: string;
  readonly scheduleId: string;
  readonly expectedLifecycleRevision: number;
  readonly serviceStartAt: string;
  readonly serviceEndAt: string;
  readonly occupiedStartAt: string;
  readonly occupiedEndAt: string;
  readonly scheduleSnapshot: {
    readonly timeZone: string;
    readonly policy: BookingPolicySnapshot;
  };
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
  readonly executeOwnerCancellation: (
    command: OwnerCancelBookingCommand,
    input: {
      readonly bookingId: string;
      readonly expectedLifecycleRevision: number;
      readonly reasonCode: BookingCancellationReasonCode;
    }
  ) => Promise<{
    readonly kind: "created" | "replayed";
    readonly booking: Booking;
    readonly lifecycleEvent: BookingLifecycleEvent;
  }>;
  readonly executeOwnerReschedule: (
    command: OwnerRescheduleBookingCommand,
    input: {
      readonly bookingId: string;
      readonly expectedLifecycleRevision: number;
      readonly projectedStartAt: string;
    },
    createClaim: (context: BookingRescheduleContext) => Promise<BookingRescheduleClaim>
  ) => Promise<{
    readonly kind: "created" | "replayed";
    readonly booking: Booking;
    readonly lifecycleEvent: BookingLifecycleEvent;
  }>;
  readonly executeOwnerCompletion: (
    command: OwnerCompleteBookingCommand,
    input: {
      readonly bookingId: string;
      readonly expectedLifecycleRevision: number;
    }
  ) => Promise<{
    readonly kind: "created" | "replayed";
    readonly booking: Booking;
    readonly lifecycleEvent: BookingLifecycleEvent;
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

export type ClientServiceWorkBookingItem = Pick<
  Booking,
  "id" | "state" | "productTitle" | "startAt" | "endAt" | "timeZone"
> & {
  readonly href: string;
};

export type ClientServiceWorkBookingSummary = {
  readonly upcomingTotal: number;
  readonly upcoming: readonly ClientServiceWorkBookingItem[];
  readonly recentTotal: number;
  readonly recent: readonly ClientServiceWorkBookingItem[];
};

export type ClientServiceWorkBookingSummaryResult =
  | ClientServiceWorkBookingSummary
  | { readonly kind: "unavailable"; readonly retryable: boolean };

export type BookingClientServiceWorkSummaryReader = {
  readonly listClientServiceWorkBookings: (input: {
    readonly ownerUserId: string;
    readonly clientUserId: string;
    readonly now: string;
    readonly limit: number;
  }) => Promise<ClientServiceWorkBookingSummaryResult>;
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
