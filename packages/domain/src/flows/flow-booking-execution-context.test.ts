import { describe, expect, it } from "vitest";

import type { BookingScheduleSnapshot } from "../bookings";
import {
  FlowBookingExecutionContextIntegrityError,
  resolveFlowBookingExecutionContext
} from "./flow-booking-execution-context";

describe("Flow Booking execution context", () => {
  it("projects the current confirmed lifecycle head without mutating the enrollment snapshot", () => {
    const enrollmentSnapshot = bookingEnrollmentSnapshot();

    const result = resolveFlowBookingExecutionContext({
      enrollmentSnapshot,
      ownerUserId,
      runtimeEvent: { source: "booking", subjectType: "booking", subjectId: bookingId },
      booking: bookingAggregate(2, currentSchedule),
      lifecycleHead: lifecycleHead(2, currentSchedule),
      requireAggregateFreshness: true
    });

    expect(result).toEqual({
      kind: "ready",
      effectiveRunSnapshot: {
        ...enrollmentSnapshot,
        subject: {
          ...enrollmentSnapshot.subject,
          startAt: currentSchedule.startAt,
          endAt: currentSchedule.endAt
        }
      },
      bookingLifecycleContext: {
        schemaVersion: "flow-booking-execution-context.v1",
        bookingId,
        appliedRevision: 2,
        lifecycleEventId,
        canonicalDigest,
        schedule: currentSchedule
      }
    });
    expect(enrollmentSnapshot.subject).toMatchObject({
      startAt: initialSchedule.startAt,
      endAt: initialSchedule.endAt
    });
  });

  it("defers a new claim while the Booking aggregate is ahead of the Flow lifecycle head", () => {
    expect(
      resolveFlowBookingExecutionContext({
        enrollmentSnapshot: bookingEnrollmentSnapshot(),
        ownerUserId,
        runtimeEvent: { source: "booking", subjectType: "booking", subjectId: bookingId },
        booking: bookingAggregate(2, currentSchedule),
        lifecycleHead: lifecycleHead(1, initialSchedule),
        requireAggregateFreshness: true
      })
    ).toEqual({ kind: "deferred", bookingId, appliedRevision: 1, aggregateRevision: 2 });
  });

  it("lets an already claimed token finalize against its unchanged head while projection catches up", () => {
    expect(
      resolveFlowBookingExecutionContext({
        enrollmentSnapshot: bookingEnrollmentSnapshot(),
        ownerUserId,
        runtimeEvent: { source: "booking", subjectType: "booking", subjectId: bookingId },
        booking: bookingAggregate(2, currentSchedule),
        lifecycleHead: lifecycleHead(1, initialSchedule),
        requireAggregateFreshness: false
      })
    ).toMatchObject({
      kind: "ready",
      effectiveRunSnapshot: {
        subject: { startAt: initialSchedule.startAt, endAt: initialSchedule.endAt }
      },
      bookingLifecycleContext: { bookingId, appliedRevision: 1, schedule: initialSchedule }
    });
  });

  it("fails closed when Booking runtime identity does not match the pinned run snapshot", () => {
    expect(() =>
      resolveFlowBookingExecutionContext({
        enrollmentSnapshot: bookingEnrollmentSnapshot(),
        ownerUserId,
        runtimeEvent: {
          source: "booking",
          subjectType: "booking",
          subjectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        },
        booking: bookingAggregate(1, initialSchedule),
        lifecycleHead: lifecycleHead(1, initialSchedule),
        requireAggregateFreshness: true
      })
    ).toThrow(FlowBookingExecutionContextIntegrityError);
  });
});

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientUserId = "22222222-2222-4222-8222-222222222222";
const bookingId = "33333333-3333-4333-8333-333333333333";
const lifecycleEventId = "44444444-4444-4444-8444-444444444444";
const canonicalDigest = `sha256:${"a".repeat(64)}` as const;
const initialSchedule = {
  startAt: "2026-08-10T10:00:00.000Z",
  endAt: "2026-08-10T11:00:00.000Z",
  timeZone: "Europe/Moscow"
} as const;
const currentSchedule = {
  startAt: "2026-08-12T12:00:00.000Z",
  endAt: "2026-08-12T13:00:00.000Z",
  timeZone: "Europe/Moscow"
} as const;

function bookingEnrollmentSnapshot() {
  return {
    schemaVersion: "flow-run-snapshot.v2" as const,
    enrollment: {
      activationEpochId: "55555555-5555-4555-8555-555555555555",
      triggerNodeId: "booking",
      occurrenceKey: bookingId,
      policyKey: "once_per_occurrence" as const,
      policyRevision: 1 as const,
      rolloutPolicyRevision: 1,
      eventOccurredAt: "2026-08-01T10:00:00.000Z",
      enrolledAt: "2026-08-01T10:00:01.000Z"
    },
    subject: {
      type: "booking" as const,
      bookingId,
      clientUserId,
      productId: "66666666-6666-4666-8666-666666666666",
      startAt: initialSchedule.startAt,
      endAt: initialSchedule.endAt
    },
    executionAuthority: {
      basis: "current_entitlement" as const,
      referenceId: "77777777-7777-4777-8777-777777777777"
    }
  };
}

function bookingAggregate(revision: number, schedule: BookingScheduleSnapshot) {
  return {
    id: bookingId,
    ownerUserId,
    state: "confirmed",
    lifecycleRevision: revision,
    schedule
  } as const;
}

function lifecycleHead(revision: number, schedule: BookingScheduleSnapshot) {
  return {
    bookingId,
    ownerUserId,
    appliedRevision: revision,
    state: "confirmed" as const,
    schedule,
    lastLifecycleEventId: lifecycleEventId,
    lastCanonicalDigest: canonicalDigest
  };
}
