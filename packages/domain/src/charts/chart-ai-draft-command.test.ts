import { describe, expect, it } from "vitest";
import {
  buildChartAiDraftCommandRequestHash,
  chartAiDraftCommandScope
} from "./chart-ai-draft-command";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const calculationId = "22222222-2222-4222-8222-222222222222";
const expectedResultChecksum = `sha256:${"a".repeat(64)}`;

describe("chart AI draft durable command", () => {
  it("binds one idempotency key namespace to actor, calculation and normalized body", () => {
    const first = buildChartAiDraftCommandRequestHash({
      actorUserId,
      calculationId,
      body: { expectedResultChecksum }
    });
    const equivalent = buildChartAiDraftCommandRequestHash({
      calculationId,
      body: { expectedResultChecksum },
      actorUserId
    });

    expect(chartAiDraftCommandScope).toBe("charts.ai-draft.v1");
    expect(first).toBe(equivalent);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(
      buildChartAiDraftCommandRequestHash({
        actorUserId: "33333333-3333-4333-8333-333333333333",
        calculationId,
        body: { expectedResultChecksum }
      })
    ).not.toBe(first);
    expect(
      buildChartAiDraftCommandRequestHash({
        actorUserId,
        calculationId: "44444444-4444-4444-8444-444444444444",
        body: { expectedResultChecksum }
      })
    ).not.toBe(first);
    expect(
      buildChartAiDraftCommandRequestHash({
        actorUserId,
        calculationId,
        body: { expectedResultChecksum: `sha256:${"b".repeat(64)}` }
      })
    ).not.toBe(first);
  });
});
