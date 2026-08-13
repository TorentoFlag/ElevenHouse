import type { FlowGraphV2 } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { matchFlowClientTriggerEvent } from "./flow-event-enrollment";

const productPurchaseGraph: FlowGraphV2 = {
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "purchase",
      kind: "product_purchased",
      displayTitle: "Покупка",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {
        productIds: ["11111111-1111-4111-8111-111111111111"],
        enrollmentPolicy: "once_per_client"
      }
    },
    {
      id: "done",
      kind: "completed",
      displayTitle: "Готово",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "purchase_follow_up" }
    }
  ],
  edges: [
    { id: "purchase-done", sourceNodeId: "purchase", targetNodeId: "done", sourceHandle: "next" }
  ]
};

describe("client-trigger Flow matching", () => {
  it("matches a captured purchase only when the product filter includes the source product", () => {
    expect(
      matchFlowClientTriggerEvent({
        graph: productPurchaseGraph,
        event: {
          eventKind: "product_purchased",
          clientUserId: "22222222-2222-4222-8222-222222222222",
          productId: "11111111-1111-4111-8111-111111111111"
        }
      })
    ).toEqual({
      status: "matched",
      triggerNodeId: "purchase",
      enrollmentPolicy: "once_per_client"
    });
  });

  it("does not treat a lifecycle event as a purchase trigger", () => {
    expect(
      matchFlowClientTriggerEvent({
        graph: productPurchaseGraph,
        event: {
          eventKind: "client_lifecycle_changed",
          clientUserId: "22222222-2222-4222-8222-222222222222",
          fromStatus: "new",
          toStatus: "active"
        }
      })
    ).toEqual({ status: "not_matched", reason: "trigger_kind" });
  });

  it.each([
    {
      kind: "new_lead" as const,
      config: { enrollmentPolicy: "once_per_client" as const },
      event: {
        eventKind: "new_lead" as const,
        clientUserId: "22222222-2222-4222-8222-222222222222"
      }
    },
    {
      kind: "free_product_received" as const,
      config: {
        productIds: ["11111111-1111-4111-8111-111111111111"],
        enrollmentPolicy: "each_occurrence" as const
      },
      event: {
        eventKind: "free_product_received" as const,
        clientUserId: "22222222-2222-4222-8222-222222222222",
        productId: "11111111-1111-4111-8111-111111111111"
      }
    },
    {
      kind: "astro_event" as const,
      config: { eventCodes: ["full_moon"], enrollmentPolicy: "each_occurrence" as const },
      event: {
        eventKind: "astro_event" as const,
        clientUserId: "22222222-2222-4222-8222-222222222222",
        eventCode: "full_moon"
      }
    },
    {
      kind: "schedule_time" as const,
      config: { scheduleKey: "weekly_digest", enrollmentPolicy: "each_occurrence" as const },
      event: {
        eventKind: "schedule_time" as const,
        clientUserId: "22222222-2222-4222-8222-222222222222",
        scheduleKey: "weekly_digest"
      }
    },
    {
      kind: "review_received" as const,
      config: { enrollmentPolicy: "once_per_client" as const },
      event: {
        eventKind: "review_received" as const,
        clientUserId: "22222222-2222-4222-8222-222222222222"
      }
    },
    {
      kind: "subscription_event" as const,
      config: {
        eventTypes: ["renewed" as const],
        enrollmentPolicy: "after_previous_terminal" as const
      },
      event: {
        eventKind: "subscription_event" as const,
        clientUserId: "22222222-2222-4222-8222-222222222222",
        eventType: "renewed" as const
      }
    }
  ])("matches $kind client-event starts", ({ kind, config, event }) => {
    expect(
      matchFlowClientTriggerEvent({
        graph: triggerGraph(kind, config),
        event
      })
    ).toEqual({
      status: "matched",
      triggerNodeId: "trigger",
      enrollmentPolicy: config.enrollmentPolicy
    });
  });

  it("applies non-product event filters before enrolling", () => {
    expect(
      matchFlowClientTriggerEvent({
        graph: triggerGraph("astro_event", {
          eventCodes: ["full_moon"],
          enrollmentPolicy: "each_occurrence"
        }),
        event: {
          eventKind: "astro_event",
          clientUserId: "22222222-2222-4222-8222-222222222222",
          eventCode: "birthday"
        }
      })
    ).toEqual({ status: "not_matched", reason: "event_filter" });
  });
});

function triggerGraph(
  kind: FlowGraphV2["nodes"][number]["kind"],
  config: FlowGraphV2["nodes"][number]["config"]
): FlowGraphV2 {
  return {
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "trigger",
        kind,
        displayTitle: "Trigger",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config
      } as FlowGraphV2["nodes"][number],
      {
        id: "done",
        kind: "completed",
        displayTitle: "Готово",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "done" }
      }
    ],
    edges: [
      { id: "trigger-done", sourceNodeId: "trigger", targetNodeId: "done", sourceHandle: "next" }
    ]
  };
}
