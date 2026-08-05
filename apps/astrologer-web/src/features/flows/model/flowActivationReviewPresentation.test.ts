import {
  flowEnrollmentActivationBlockerCodeValues,
  type FlowActivationReviewResponse
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { buildFlowActivationReviewPresentation } from "./flowActivationReviewPresentation";

const flowId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";

describe("flow activation review presentation", () => {
  it("presents a ready review as an explicit confirmable action", () => {
    expect(buildFlowActivationReviewPresentation(readyReview(), "ru")).toEqual({
      status: "ready",
      title: "Готова к запуску",
      description: "Проверка пройдена. После подтверждения новые события начнут запускать эту версию.",
      canConfirm: true,
      blockers: []
    });
  });

  it("maps every contract blocker to localized operator-facing copy", () => {
    const review: FlowActivationReviewResponse = {
      ...readyReview(),
      decision: "blocked",
      blockers: flowEnrollmentActivationBlockerCodeValues.map((code, index) => ({
        code,
        path: `readiness.${index}`,
        capabilityKey: code === "FLOW_REQUIRED_CAPABILITY_NOT_READY" ? "telegram.send" : null
      }))
    };
    const presentation = buildFlowActivationReviewPresentation(review, "en");

    expect(presentation.status).toBe("blocked");
    expect(presentation.canConfirm).toBe(false);
    expect(presentation.blockers).toHaveLength(flowEnrollmentActivationBlockerCodeValues.length);
    for (const [index, blocker] of presentation.blockers.entries()) {
      expect(blocker.label).not.toBe(flowEnrollmentActivationBlockerCodeValues[index]);
      expect(blocker.label.length).toBeGreaterThan(8);
    }
    expect(presentation.blockers.find((item) => item.capabilityKey === "telegram.send")).toMatchObject(
      { capabilityKey: "telegram.send" }
    );
  });
});

function readyReview(): FlowActivationReviewResponse {
  return {
    schemaVersion: "flow-activation-review.v1",
    flowId,
    versionId,
    definitionRevision: 7,
    enrollmentRevision: 0,
    expectedActiveVersionId: null,
    runtimeMode: "enabled",
    rolloutPolicyRevision: 2,
    evaluatedAt: "2026-08-04T18:00:00.000Z",
    decision: "ready",
    blockers: []
  };
}
