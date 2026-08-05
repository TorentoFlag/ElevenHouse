import { describe, expect, it } from "vitest";

import { HttpError } from "../../../common/http/HttpError";
import {
  classifyFlowWorkItemCommandError,
  createFlowWorkItemCommandAttemptRegistry
} from "./flowWorkItemCommandModel";

const workItemId = "10000000-0000-4000-8000-000000000001";

describe("flow work-item command model", () => {
  it("retains one key across network retries and rotates after acknowledgement", () => {
    const ids = ["attempt-1", "attempt-2"];
    const attempts = createFlowWorkItemCommandAttemptRegistry(() => ids.shift()!);
    const body = { expectedRevision: 1 };
    const first = attempts.acquire("start", workItemId, body);

    expect(attempts.acquire("start", workItemId, { ...body })).toBe(first);
    expect(classifyFlowWorkItemCommandError(new TypeError("Failed to fetch"))).toEqual({
      kind: "retry_same_attempt"
    });
    expect(attempts.acquire("start", workItemId, body)).toBe(first);

    attempts.acknowledge("start", workItemId, first);
    expect(attempts.acquire("start", workItemId, body)).toBe("flows:work-item:start:attempt-2");
  });

  it("blocks stale commands after a revision conflict until authoritative refetch", () => {
    const ids = ["attempt-1", "attempt-2"];
    const attempts = createFlowWorkItemCommandAttemptRegistry(() => ids.shift()!);
    const body = { expectedRevision: 2 };
    const first = attempts.acquire("complete", workItemId, body);
    const classification = classifyFlowWorkItemCommandError(
      new HttpError(409, {
        code: "FLOW_WORK_ITEM_REVISION_CONFLICT",
        currentRevision: 3
      })
    );

    expect(classification).toEqual({
      kind: "refetch_required",
      rejection: { code: "FLOW_WORK_ITEM_REVISION_CONFLICT", currentRevision: 3 }
    });
    attempts.markConflict("complete", workItemId, first);
    expect(() => attempts.acquire("complete", workItemId, body)).toThrow(
      "FLOW_WORK_ITEM_REFETCH_REQUIRED"
    );

    attempts.resetAfterRefetch("complete", workItemId);
    expect(attempts.acquire("complete", workItemId, body)).toBe(
      "flows:work-item:complete:attempt-2"
    );
  });

  it("separates retryable transport errors from corrected-input and stale-state errors", () => {
    expect(classifyFlowWorkItemCommandError(new HttpError(503, null))).toEqual({
      kind: "retry_same_attempt"
    });
    expect(
      classifyFlowWorkItemCommandError(
        new HttpError(409, { code: "FLOW_WORK_ITEM_SNOOZE_NOT_FUTURE" })
      )
    ).toEqual({
      kind: "rejected",
      rejection: { code: "FLOW_WORK_ITEM_SNOOZE_NOT_FUTURE" }
    });
    expect(
      classifyFlowWorkItemCommandError(
        new HttpError(409, { code: "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED" })
      )
    ).toEqual({
      kind: "rejected",
      rejection: { code: "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED" }
    });
    expect(
      classifyFlowWorkItemCommandError(
        new HttpError(409, {
          code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED",
          status: "completed"
        })
      )
    ).toEqual({
      kind: "refetch_required",
      rejection: { code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED", status: "completed" }
    });
    expect(
      classifyFlowWorkItemCommandError(
        new HttpError(409, {
          code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
          bookingId: "40000000-0000-4000-8000-000000000002",
          appliedRevision: 1,
          aggregateRevision: 2
        })
      )
    ).toEqual({
      kind: "refetch_required",
      rejection: {
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
        bookingId: "40000000-0000-4000-8000-000000000002",
        appliedRevision: 1,
        aggregateRevision: 2
      }
    });
    expect(
      classifyFlowWorkItemCommandError(
        new HttpError(409, {
          code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED",
          currentBookingLifecycleRevision: 2
        })
      )
    ).toEqual({
      kind: "refetch_required",
      rejection: {
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED",
        currentBookingLifecycleRevision: 2
      }
    });
    expect(classifyFlowWorkItemCommandError(new HttpError(409, { code: "UNKNOWN" }))).toEqual({
      kind: "refetch_required",
      rejection: null
    });
  });

  it("keeps changed snooze payloads as independent attempts", () => {
    const ids = ["attempt-1", "attempt-2"];
    const attempts = createFlowWorkItemCommandAttemptRegistry(() => ids.shift()!);

    const first = attempts.acquire("snooze", workItemId, {
      expectedRevision: 1,
      snoozedUntil: "2026-08-05T10:00:00.000Z"
    });
    const second = attempts.acquire("snooze", workItemId, {
      expectedRevision: 1,
      snoozedUntil: "2026-08-05T11:00:00.000Z"
    });

    expect(first).not.toBe(second);
  });
});
