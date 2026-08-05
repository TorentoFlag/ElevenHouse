import { describe, expect, it } from "vitest";

import {
  planFlowBookingRescheduledWorkItem,
  projectCurrentBookingScheduleOntoFlowRunSnapshot
} from "./flow-booking-reschedule";

const bookingId = "11111111-1111-4111-8111-111111111111";
const previousSchedule = {
  startAt: "2026-08-10T10:00:00.000Z",
  endAt: "2026-08-10T11:00:00.000Z",
  timeZone: "Europe/Moscow"
} as const;
const currentSchedule = {
  startAt: "2026-08-12T12:00:00.000Z",
  endAt: "2026-08-12T13:00:00.000Z",
  timeZone: "Europe/Moscow"
} as const;

describe("Flow Booking reschedule projection", () => {
  it("overlays the current schedule without mutating the enrollment snapshot", () => {
    const snapshot = runSnapshot();

    expect(
      projectCurrentBookingScheduleOntoFlowRunSnapshot({
        runSnapshot: snapshot,
        bookingId,
        schedule: currentSchedule
      })
    ).toEqual({
      ...snapshot,
      subject: {
        ...snapshot.subject,
        startAt: currentSchedule.startAt,
        endAt: currentSchedule.endAt
      }
    });
    expect(snapshot.subject).toMatchObject({
      startAt: previousSchedule.startAt,
      endAt: previousSchedule.endAt
    });
  });

  it("fails closed when the projection does not belong to the pinned Booking", () => {
    expect(() =>
      projectCurrentBookingScheduleOntoFlowRunSnapshot({
        runSnapshot: runSnapshot(),
        bookingId: "22222222-2222-4222-8222-222222222222",
        schedule: currentSchedule
      })
    ).toThrow("FLOW_BOOKING_LIFECYCLE_RUNTIME_STATE_INVALID");
  });

  it("recalculates a pending booking-relative deadline from the pinned policy", () => {
    expect(
      planFlowBookingRescheduledWorkItem({
        runSnapshot: runSnapshot(),
        bookingId,
        previousSchedule,
        currentSchedule,
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        workItem: {
          status: "pending",
          revision: 1,
          dueAt: "2026-08-09T10:00:00.000Z",
          availableAt: "2026-08-01T10:00:00.000Z",
          snoozedUntil: null
        },
        appliedAt: "2026-08-05T10:00:00.000Z"
      })
    ).toEqual({
      kind: "adjusted",
      status: "pending",
      revision: 2,
      dueAt: "2026-08-11T12:00:00.000Z",
      availableAt: "2026-08-01T10:00:00.000Z",
      snoozedUntil: null,
      snoozeAdjustment: "unchanged"
    });
  });

  it("preserves a user snooze when the recalculated deadline remains later", () => {
    expect(
      planFlowBookingRescheduledWorkItem({
        runSnapshot: runSnapshot(),
        bookingId,
        previousSchedule,
        currentSchedule,
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        workItem: {
          status: "snoozed",
          revision: 2,
          dueAt: "2026-08-09T10:00:00.000Z",
          availableAt: "2026-08-08T10:00:00.000Z",
          snoozedUntil: "2026-08-08T10:00:00.000Z"
        },
        appliedAt: "2026-08-05T10:00:00.000Z"
      })
    ).toMatchObject({
      kind: "adjusted",
      status: "snoozed",
      revision: 3,
      dueAt: "2026-08-11T12:00:00.000Z",
      availableAt: "2026-08-08T10:00:00.000Z",
      snoozedUntil: "2026-08-08T10:00:00.000Z",
      snoozeAdjustment: "unchanged"
    });
  });

  it("shortens a snooze that would hide the task past its new deadline", () => {
    expect(
      planFlowBookingRescheduledWorkItem({
        runSnapshot: runSnapshot(),
        bookingId,
        previousSchedule,
        currentSchedule: {
          startAt: "2026-08-09T14:00:00.000Z",
          endAt: "2026-08-09T15:00:00.000Z",
          timeZone: "Europe/Moscow"
        },
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        workItem: {
          status: "snoozed",
          revision: 2,
          dueAt: "2026-08-09T10:00:00.000Z",
          availableAt: "2026-08-09T10:00:00.000Z",
          snoozedUntil: "2026-08-09T10:00:00.000Z"
        },
        appliedAt: "2026-08-05T10:00:00.000Z"
      })
    ).toMatchObject({
      kind: "adjusted",
      status: "snoozed",
      revision: 3,
      dueAt: "2026-08-08T14:00:00.000Z",
      availableAt: "2026-08-08T14:00:00.000Z",
      snoozedUntil: "2026-08-08T14:00:00.000Z",
      snoozeAdjustment: "shortened"
    });
  });

  it("wakes a snoozed task immediately when the new deadline is already due", () => {
    expect(
      planFlowBookingRescheduledWorkItem({
        runSnapshot: runSnapshot(),
        bookingId,
        previousSchedule,
        currentSchedule: {
          startAt: "2026-08-06T09:00:00.000Z",
          endAt: "2026-08-06T10:00:00.000Z",
          timeZone: "Europe/Moscow"
        },
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        workItem: {
          status: "snoozed",
          revision: 2,
          dueAt: "2026-08-09T10:00:00.000Z",
          availableAt: "2026-08-09T10:00:00.000Z",
          snoozedUntil: "2026-08-09T10:00:00.000Z"
        },
        appliedAt: "2026-08-05T10:00:00.000Z"
      })
    ).toMatchObject({
      kind: "adjusted",
      status: "pending",
      revision: 3,
      dueAt: "2026-08-05T09:00:00.000Z",
      availableAt: "2026-08-05T10:00:00.000Z",
      snoozedUntil: null,
      snoozeAdjustment: "woken"
    });
  });

  it("does not revise a work item whose pinned policy is schedule-independent", () => {
    expect(
      planFlowBookingRescheduledWorkItem({
        runSnapshot: runSnapshot(),
        bookingId,
        previousSchedule,
        currentSchedule,
        duePolicy: { kind: "none" },
        workItem: {
          status: "in_progress",
          revision: 3,
          dueAt: null,
          availableAt: "2026-08-01T10:00:00.000Z",
          snoozedUntil: null
        },
        appliedAt: "2026-08-05T10:00:00.000Z"
      })
    ).toEqual({ kind: "unchanged" });
  });

  it("rejects a pre-reschedule deadline that disagrees with the pinned policy", () => {
    expect(() =>
      planFlowBookingRescheduledWorkItem({
        runSnapshot: runSnapshot(),
        bookingId,
        previousSchedule,
        currentSchedule,
        duePolicy: { kind: "before_booking_start", leadTimeMinutes: 1_440 },
        workItem: {
          status: "in_progress",
          revision: 2,
          dueAt: "2026-08-09T11:00:00.000Z",
          availableAt: "2026-08-01T10:00:00.000Z",
          snoozedUntil: null
        },
        appliedAt: "2026-08-05T10:00:00.000Z"
      })
    ).toThrow("FLOW_BOOKING_LIFECYCLE_RUNTIME_STATE_INVALID");
  });
});

function runSnapshot() {
  return {
    schemaVersion: "flow-run-snapshot.v2",
    enrollment: {
      activationEpochId: "33333333-3333-4333-8333-333333333333",
      triggerNodeId: "booking",
      occurrenceKey: bookingId,
      policyKey: "once_per_occurrence",
      policyRevision: 1,
      rolloutPolicyRevision: 1,
      eventOccurredAt: "2026-08-01T10:00:00.000Z",
      enrolledAt: "2026-08-01T10:00:01.000Z"
    },
    subject: {
      type: "booking",
      bookingId,
      clientUserId: "44444444-4444-4444-8444-444444444444",
      productId: "55555555-5555-4555-8555-555555555555",
      startAt: previousSchedule.startAt,
      endAt: previousSchedule.endAt
    },
    executionAuthority: {
      basis: "current_entitlement",
      referenceId: "66666666-6666-4666-8666-666666666666"
    }
  } as const;
}
