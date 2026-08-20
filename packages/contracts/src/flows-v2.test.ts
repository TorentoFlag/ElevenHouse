import { describe, expect, it } from "vitest";

import {
  flowCapabilityRequirementSchema,
  flowGraphV2Schema,
  flowNodeKindV2Schema,
  flowTriggerNodeKindV2Schema
} from "./flows-v2";

describe("Flow v2 review publication trigger contract", () => {
  it("uses first published review semantics instead of received review semantics", () => {
    expect(flowNodeKindV2Schema.parse("review_first_published")).toBe("review_first_published");
    expect(flowTriggerNodeKindV2Schema.parse("review_first_published")).toBe(
      "review_first_published"
    );
    expect(flowNodeKindV2Schema.safeParse("review_received").success).toBe(false);
    expect(flowTriggerNodeKindV2Schema.safeParse("review_received").success).toBe(false);
    expect(flowCapabilityRequirementSchema.parse("reviews.events.first_published")).toBe(
      "reviews.events.first_published"
    );
    expect(flowCapabilityRequirementSchema.safeParse("reviews.events.received").success).toBe(
      false
    );
  });

  it("parses a review first published trigger node", () => {
    expect(
      flowGraphV2Schema.parse({
        schemaVersion: "flow-graph.v2",
        nodes: [
          {
            id: "review-start",
            kind: "review_first_published",
            displayTitle: "Отзыв опубликован",
            configSchemaVersion: 1,
            executorContractVersion: 1,
            config: {
              enrollmentPolicy: "once_per_client"
            }
          }
        ],
        edges: []
      })
    ).toMatchObject({ nodes: [{ kind: "review_first_published" }] });
  });
});
