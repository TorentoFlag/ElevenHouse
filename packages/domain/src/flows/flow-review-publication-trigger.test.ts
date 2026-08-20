import { describe, expect, it } from "vitest";

import type { FlowGraphV2 } from "@elevenhouse/contracts";

import { matchFlowClientTriggerEvent } from "./flow-event-enrollment";
import { compileFlowGraphV2 } from "./flow-graph-v2-compiler";
import {
  FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
  createReviewFirstPublishedFlowEnrollmentRequestedPayload,
  flowReviewFirstPublishedEnrollmentRequestedPayloadV1Schema
} from "./flow-runtime-outbox";
import { createFlowClientEventEnrollmentWorkerRequirementKeys } from "./flow-runtime-control";

describe("review first published Flow trigger", () => {
  it("matches only the first-published review trigger kind", () => {
    const graph = reviewFirstPublishedGraph();

    expect(
      matchFlowClientTriggerEvent({
        graph,
        event: {
          eventKind: "review_first_published",
          clientUserId: "10000000-0000-4000-8000-000000000001"
        }
      })
    ).toEqual({
      status: "matched",
      triggerNodeId: "review-start",
      enrollmentPolicy: "once_per_client"
    });

    expect(
      matchFlowClientTriggerEvent({
        graph,
        event: {
          eventKind: "review_received",
          clientUserId: "10000000-0000-4000-8000-000000000001"
        } as never
      }).status
    ).toBe("not_matched");
  });

  it("compiles review first published capability requirements", () => {
    const result = compileFlowGraphV2(reviewFirstPublishedGraph());

    expect(result.publishable).toBe(true);
    expect(result.capabilityManifest?.triggerMatcher.kind).toBe("review_first_published");
    expect(result.capabilityManifest?.requiredCapabilities).toContain(
      "reviews.events.first_published"
    );
    expect(result.capabilityManifest?.requiredCapabilities).not.toContain(
      "reviews.events.received"
    );
  });

  it("creates an enrollment payload from the first publication receipt", () => {
    expect(FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT).toBe(
      "flows.review_first_published.enrollment_requested.v1"
    );

    const payload = createReviewFirstPublishedFlowEnrollmentRequestedPayload({
      reviewId: "10000000-0000-4000-8000-000000000010",
      ownerUserId: "10000000-0000-4000-8000-000000000011",
      clientUserId: "10000000-0000-4000-8000-000000000012",
      relationshipId: "10000000-0000-4000-8000-000000000013",
      firstApprovedVersionId: "10000000-0000-4000-8000-000000000014",
      publishedAt: "2026-08-20T10:00:00.000Z"
    });

    expect(flowReviewFirstPublishedEnrollmentRequestedPayloadV1Schema.parse(payload)).toMatchObject(
      {
        schemaVersion: "flow-review-first-published-enrollment-request.v1",
        eventKind: "review_first_published",
        sourceEventId: "review:10000000-0000-4000-8000-000000000010:first_published",
        occurrenceKey: "10000000-0000-4000-8000-000000000010",
        payload: {
          reviewId: "10000000-0000-4000-8000-000000000010",
          firstApprovedVersionId: "10000000-0000-4000-8000-000000000014"
        }
      }
    );

    expect(
      flowReviewFirstPublishedEnrollmentRequestedPayloadV1Schema.safeParse({
        ...payload,
        eventKind: "review_received"
      }).success
    ).toBe(false);
  });

  it("registers worker requirements for first-published reviews only", () => {
    const keys = createFlowClientEventEnrollmentWorkerRequirementKeys();

    expect(keys).toContain("capability:reviews.events.first_published");
    expect(keys).toContain("trigger:review_first_published:1:1:1");
    expect(keys).not.toContain("capability:reviews.events.received");
    expect(keys).not.toContain("trigger:review_received:1:1:1");
  });
});

function reviewFirstPublishedGraph(): FlowGraphV2 {
  return {
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "review-start",
        kind: "review_first_published",
        displayTitle: "Отзыв опубликован",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { enrollmentPolicy: "once_per_client" }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Завершено",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "ok" }
      }
    ],
    edges: [
      {
        id: "review-to-done",
        sourceNodeId: "review-start",
        targetNodeId: "done",
        sourceHandle: "next"
      }
    ]
  };
}
