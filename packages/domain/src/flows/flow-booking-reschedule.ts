import {
  flowRunSnapshotV2Schema,
  type FlowRunSnapshotV2,
  type FlowWorkItemDuePolicyV2
} from "@elevenhouse/contracts";

import type { BookingScheduleSnapshot } from "../bookings";
import { FlowBookingLifecycleIntegrityError } from "./flow-booking-lifecycle";
import { resolveFlowWorkItemDueAt } from "./flow-execution-interpreter";

export type FlowBookingRescheduledWorkItem = {
  readonly status: "pending" | "in_progress" | "snoozed";
  readonly revision: number;
  readonly dueAt: string | null;
  readonly availableAt: string;
  readonly snoozedUntil: string | null;
};

export type FlowBookingRescheduledWorkItemPlan =
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "adjusted";
      readonly status: FlowBookingRescheduledWorkItem["status"];
      readonly revision: number;
      readonly dueAt: string;
      readonly availableAt: string;
      readonly snoozedUntil: string | null;
      readonly snoozeAdjustment: "unchanged" | "shortened" | "woken";
    };

export function projectCurrentBookingScheduleOntoFlowRunSnapshot(input: {
  readonly runSnapshot: unknown;
  readonly bookingId: string;
  readonly schedule: BookingScheduleSnapshot;
}): FlowRunSnapshotV2 {
  const snapshot = flowRunSnapshotV2Schema.safeParse(input.runSnapshot);
  assertSchedule(input.schedule, "current Booking schedule");
  if (
    !snapshot.success ||
    snapshot.data.subject.bookingId !== input.bookingId ||
    snapshot.data.enrollment.occurrenceKey !== input.bookingId
  ) {
    throw runtimeStateInvalid(
      "the current Booking schedule does not belong to the pinned Flow run subject"
    );
  }

  return {
    ...snapshot.data,
    subject: {
      ...snapshot.data.subject,
      startAt: input.schedule.startAt,
      endAt: input.schedule.endAt
    }
  };
}

export function planFlowBookingRescheduledWorkItem(input: {
  readonly runSnapshot: unknown;
  readonly bookingId: string;
  readonly previousSchedule: BookingScheduleSnapshot;
  readonly currentSchedule: BookingScheduleSnapshot;
  readonly duePolicy: FlowWorkItemDuePolicyV2;
  readonly workItem: FlowBookingRescheduledWorkItem;
  readonly appliedAt: string;
}): FlowBookingRescheduledWorkItemPlan {
  assertWorkItem(input.workItem);
  assertInstant(input.appliedAt, "reschedule application time");

  const previousSnapshot = projectCurrentBookingScheduleOntoFlowRunSnapshot({
    runSnapshot: input.runSnapshot,
    bookingId: input.bookingId,
    schedule: input.previousSchedule
  });
  const currentSnapshot = projectCurrentBookingScheduleOntoFlowRunSnapshot({
    runSnapshot: input.runSnapshot,
    bookingId: input.bookingId,
    schedule: input.currentSchedule
  });

  const previousDueAt = resolveFlowWorkItemDueAt(input.duePolicy, previousSnapshot);
  if (previousDueAt !== input.workItem.dueAt) {
    throw runtimeStateInvalid(
      "the persisted work-item deadline does not match the pinned Flow policy and Booking preimage"
    );
  }
  if (input.duePolicy.kind === "none") {
    return { kind: "unchanged" };
  }

  const dueAt = resolveFlowWorkItemDueAt(input.duePolicy, currentSnapshot);
  if (dueAt === null) {
    throw runtimeStateInvalid("a booking-relative deadline resolved without a due time");
  }

  if (input.workItem.status !== "snoozed") {
    return {
      kind: "adjusted",
      status: input.workItem.status,
      revision: input.workItem.revision + 1,
      dueAt,
      availableAt: input.workItem.availableAt,
      snoozedUntil: null,
      snoozeAdjustment: "unchanged"
    };
  }

  const snoozedUntil = input.workItem.snoozedUntil;
  if (snoozedUntil === null || snoozedUntil !== input.workItem.availableAt) {
    throw runtimeStateInvalid(
      "a snoozed Flow work item requires matching snooze and availability times"
    );
  }

  const effectiveWakeAt = earlierInstant(snoozedUntil, dueAt);
  if (Date.parse(effectiveWakeAt) <= Date.parse(input.appliedAt)) {
    return {
      kind: "adjusted",
      status: "pending",
      revision: input.workItem.revision + 1,
      dueAt,
      availableAt: input.appliedAt,
      snoozedUntil: null,
      snoozeAdjustment: "woken"
    };
  }
  if (effectiveWakeAt === dueAt && dueAt !== snoozedUntil) {
    return {
      kind: "adjusted",
      status: "snoozed",
      revision: input.workItem.revision + 1,
      dueAt,
      availableAt: dueAt,
      snoozedUntil: dueAt,
      snoozeAdjustment: "shortened"
    };
  }
  return {
    kind: "adjusted",
    status: "snoozed",
    revision: input.workItem.revision + 1,
    dueAt,
    availableAt: snoozedUntil,
    snoozedUntil,
    snoozeAdjustment: "unchanged"
  };
}

function assertWorkItem(workItem: FlowBookingRescheduledWorkItem): void {
  if (!Number.isSafeInteger(workItem.revision) || workItem.revision < 1) {
    throw runtimeStateInvalid("a Flow work item requires a positive revision");
  }
  assertInstant(workItem.availableAt, "work-item availability time");
  if (workItem.dueAt !== null) assertInstant(workItem.dueAt, "work-item deadline");
  if (workItem.snoozedUntil !== null) {
    assertInstant(workItem.snoozedUntil, "work-item snooze time");
  }
  if (workItem.status !== "snoozed" && workItem.snoozedUntil !== null) {
    throw runtimeStateInvalid("an active unsnoozed Flow work item cannot retain a snooze time");
  }
}

function assertSchedule(schedule: BookingScheduleSnapshot, label: string): void {
  assertInstant(schedule.startAt, `${label} start`);
  assertInstant(schedule.endAt, `${label} end`);
  if (
    Date.parse(schedule.endAt) <= Date.parse(schedule.startAt) ||
    schedule.timeZone.trim().length === 0
  ) {
    throw runtimeStateInvalid(`${label} is invalid`);
  }
}

function assertInstant(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw runtimeStateInvalid(`${label} is invalid`);
  }
}

function earlierInstant(left: string, right: string): string {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function runtimeStateInvalid(message: string): FlowBookingLifecycleIntegrityError {
  return new FlowBookingLifecycleIntegrityError(
    "FLOW_BOOKING_LIFECYCLE_RUNTIME_STATE_INVALID",
    message
  );
}
