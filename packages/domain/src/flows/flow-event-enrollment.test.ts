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
});
