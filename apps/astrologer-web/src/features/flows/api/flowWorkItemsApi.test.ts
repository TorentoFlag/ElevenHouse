import type { FlowWorkItem, ListFlowWorkItemsResponse } from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { application } from "../../../Application";
import { completeFlowWorkItem } from "./completeFlowWorkItem";
import { listFlowWorkItems } from "./listFlowWorkItems";
import { snoozeFlowWorkItem } from "./snoozeFlowWorkItem";
import { startFlowWorkItem } from "./startFlowWorkItem";

const workItem = {
  id: "10000000-0000-4000-8000-000000000001",
  flowRunId: "10000000-0000-4000-8000-000000000002",
  flowVersionId: "10000000-0000-4000-8000-000000000003",
  nodeId: "prepare-consultation",
  status: "pending",
  taskKind: "consultation_preparation",
  title: "Подготовить консультацию",
  instructions: "Проверьте карту и вопросы клиента",
  assigneeUserId: "10000000-0000-4000-8000-000000000004",
  priority: "high",
  dueAt: "2026-08-05T12:00:00.000Z",
  availableAt: "2026-08-05T08:00:00.000Z",
  snoozedUntil: null,
  revision: 1,
  resultSummary: null,
  createdAt: "2026-08-05T08:00:00.000Z",
  updatedAt: "2026-08-05T08:00:00.000Z",
  startedAt: null,
  completedAt: null,
  completedByUserId: null,
  expiredAt: null,
  canceledAt: null
} satisfies FlowWorkItem;

describe("flow work-item API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads an exact status page through the shared response contract", async () => {
    const response = {
      items: [
        {
          workItem,
          context: {
            status: "integrity_error",
            code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
          }
        }
      ],
      total: 1,
      asOf: "2026-08-05T08:00:00.000Z"
    } satisfies ListFlowWorkItemsResponse;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(listFlowWorkItems({ status: "active", limit: 5, offset: 10 })).resolves.toEqual(
      response
    );
    expect(get).toHaveBeenCalledWith("/flow-work-items?status=active&limit=5&offset=10", {
      cache: "no-store"
    });
  });

  it("rejects malformed work-item responses instead of inventing an empty queue", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({ items: [{ id: "invalid" }], total: 1 });

    await expect(listFlowWorkItems({ status: "pending", limit: 5, offset: 0 })).rejects.toThrow();
  });

  it("starts, snoozes and completes through CSRF and exact idempotency keys", async () => {
    const started = {
      workItem: {
        ...workItem,
        status: "in_progress",
        revision: 2,
        startedAt: "2026-08-05T08:05:00.000Z",
        updatedAt: "2026-08-05T08:05:00.000Z"
      }
    } as const;
    const snoozed = {
      workItem: {
        ...started.workItem,
        status: "snoozed",
        revision: 3,
        availableAt: "2026-08-05T10:00:00.000Z",
        snoozedUntil: "2026-08-05T10:00:00.000Z",
        updatedAt: "2026-08-05T08:06:00.000Z"
      }
    } as const;
    const completed = {
      workItem: {
        ...started.workItem,
        status: "completed",
        revision: 3,
        resultSummary: "Карта и вопросы проверены",
        completedAt: "2026-08-05T08:10:00.000Z",
        completedByUserId: workItem.assigneeUserId,
        updatedAt: "2026-08-05T08:10:00.000Z"
      }
    } as const;
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce(started)
      .mockResolvedValueOnce(snoozed)
      .mockResolvedValueOnce(completed);

    await expect(
      startFlowWorkItem({
        workItemId: workItem.id,
        body: { expectedRevision: 1, expectedBookingLifecycleRevision: 1 },
        idempotencyKey: "flows:work-item:start:test"
      })
    ).resolves.toEqual(started);
    await expect(
      snoozeFlowWorkItem({
        workItemId: workItem.id,
        body: {
          expectedRevision: 2,
          expectedBookingLifecycleRevision: 1,
          snoozedUntil: "2026-08-05T10:00:00.000Z"
        },
        idempotencyKey: "flows:work-item:snooze:test"
      })
    ).resolves.toEqual(snoozed);
    await expect(
      completeFlowWorkItem({
        workItemId: workItem.id,
        body: {
          expectedRevision: 2,
          expectedBookingLifecycleRevision: 1,
          resultSummary: "Карта и вопросы проверены"
        },
        idempotencyKey: "flows:work-item:complete:test"
      })
    ).resolves.toEqual(completed);

    expect(post).toHaveBeenNthCalledWith(
      1,
      `/flow-work-items/${workItem.id}/start`,
      { expectedRevision: 1, expectedBookingLifecycleRevision: 1 },
      {
        csrf: true,
        headers: { "idempotency-key": "flows:work-item:start:test" }
      }
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/flow-work-items/${workItem.id}/snooze`,
      {
        expectedRevision: 2,
        expectedBookingLifecycleRevision: 1,
        snoozedUntil: "2026-08-05T10:00:00.000Z"
      },
      {
        csrf: true,
        headers: { "idempotency-key": "flows:work-item:snooze:test" }
      }
    );
    expect(post).toHaveBeenNthCalledWith(
      3,
      `/flow-work-items/${workItem.id}/complete`,
      {
        expectedRevision: 2,
        expectedBookingLifecycleRevision: 1,
        resultSummary: "Карта и вопросы проверены"
      },
      {
        csrf: true,
        headers: { "idempotency-key": "flows:work-item:complete:test" }
      }
    );
  });
});
