import { Temporal } from "@js-temporal/polyfill";

import type { BookingState } from "../bookings/booking-types";
import type { ProductDeliveryFormat } from "../products";
import type { SessionRelationshipStatus, SessionState } from "./session-types";

export type SessionJoinPolicyInput = {
  readonly sessionState: SessionState;
  readonly bookingState: BookingState;
  readonly deliveryFormat: ProductDeliveryFormat;
  readonly relationshipStatus: SessionRelationshipStatus;
  readonly scheduledStartAt: string;
  readonly scheduledEndAt: string;
  readonly now: string;
};

export type SessionJoinPolicyDecision =
  | { readonly kind: "allowed" }
  | { readonly kind: "too_early"; readonly joinableAt: string }
  | {
      readonly kind: "denied";
      readonly reason:
        | "not_video_booking"
        | "booking_not_confirmed"
        | "relationship_blocked"
        | "cancelled"
        | "expired"
        | "ended";
    };

export function evaluateSessionJoinPolicy(
  input: SessionJoinPolicyInput
): SessionJoinPolicyDecision {
  if (input.deliveryFormat !== "video") {
    return { kind: "denied", reason: "not_video_booking" };
  }
  if (input.relationshipStatus === "blocked") {
    return { kind: "denied", reason: "relationship_blocked" };
  }
  if (input.sessionState === "cancelled") return { kind: "denied", reason: "cancelled" };
  if (input.sessionState === "expired") return { kind: "denied", reason: "expired" };
  if (input.sessionState === "ended") return { kind: "denied", reason: "ended" };

  if (input.sessionState === "active") {
    return input.bookingState === "confirmed" || input.bookingState === "completed"
      ? { kind: "allowed" }
      : { kind: "denied", reason: "booking_not_confirmed" };
  }
  if (input.bookingState !== "confirmed") {
    return { kind: "denied", reason: "booking_not_confirmed" };
  }

  const now = Temporal.Instant.from(input.now);
  const joinableAt = Temporal.Instant.from(input.scheduledStartAt).subtract({ minutes: 10 });
  if (Temporal.Instant.compare(now, joinableAt) < 0) {
    return { kind: "too_early", joinableAt: joinableAt.toString() };
  }
  const expiresAt = Temporal.Instant.from(input.scheduledEndAt).add({ minutes: 30 });
  if (Temporal.Instant.compare(now, expiresAt) >= 0) {
    return { kind: "denied", reason: "expired" };
  }
  return { kind: "allowed" };
}
