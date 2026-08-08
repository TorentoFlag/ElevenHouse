import type { FlowApproval } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { createFlowApprovalCommandAttemptRegistry } from "./flowApprovalCommandModel";

const approval = {
  id: "55555555-5555-4555-8555-555555555555",
  flowRunId: "44444444-4444-4444-8444-444444444444",
  stepRunId: null,
  status: "pending",
  kind: "manual_task",
  title: "Проверить подготовку",
  preview: "Нужна проверка.",
  artifact: null,
  revision: 1,
  snoozedUntil: null,
  expiresAt: null,
  createdAt: "2026-08-06T10:00:00.000Z",
  decidedAt: null
} satisfies FlowApproval;

describe("flow approval command attempts", () => {
  it("reuses one idempotency key only for the same approval command body", () => {
    const ids = ["attempt-1", "attempt-2"];
    const registry = createFlowApprovalCommandAttemptRegistry(() => ids.shift() ?? "unexpected");
    const body = { expectedRevision: 1, decision: "snoozed", snoozedUntil: "2026-08-07T10:00:00.000Z" };

    expect(registry.acquire("snooze", approval, body)).toBe("flows:approval:snooze:attempt-1");
    expect(registry.acquire("snooze", approval, { ...body })).toBe(
      "flows:approval:snooze:attempt-1"
    );
    expect(
      registry.acquire("snooze", approval, {
        ...body,
        snoozedUntil: "2026-08-08T10:00:00.000Z"
      })
    ).toBe("flows:approval:snooze:attempt-2");
  });
});
