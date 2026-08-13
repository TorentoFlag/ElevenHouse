import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "../calculations/canonical-json";
import { planFlowClientEventEnrollment, normalizeFlowClientEvent } from "./flow-client-event-enrollment-plan";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";

describe("client trigger enrollment plan", () => {
  it("uses the client as the stable key for once-per-client purchase starts", () => {
    const event = normalizeFlowClientEvent({
      ownerUserId,
      relationshipId: "44444444-4444-4444-8444-444444444444",
      source: "finance",
      sourceEventId: "order:55555555-5555-4555-8555-555555555555:captured",
      event: { eventKind: "product_purchased", clientUserId, productId },
      occurrenceKey: "55555555-5555-4555-8555-555555555555",
      occurredAtUtc: "2026-08-13T10:00:00.000Z",
      payloadSchemaVersion: 1,
      allowlistedPayload: { productId, orderId: "55555555-5555-4555-8555-555555555555" },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.product-purchased.v1",
      dedupeKey: "order:55555555-5555-4555-8555-555555555555:captured"
    });
    const graph = {
      schemaVersion: "flow-graph.v2",
      nodes: [
        { id: "purchase", kind: "product_purchased", displayTitle: "Purchase", configSchemaVersion: 1, executorContractVersion: 1, config: { productIds: [productId], enrollmentPolicy: "once_per_client" } },
        { id: "done", kind: "completed", displayTitle: "Done", configSchemaVersion: 1, executorContractVersion: 1, config: { goalKey: "done" } }
      ],
      edges: [{ id: "purchase-done", sourceNodeId: "purchase", targetNodeId: "done", sourceHandle: "next" }]
    };
    expect(planFlowClientEventEnrollment({ event, candidate: { activationEpochId: "66666666-6666-4666-8666-666666666666", flowId: "77777777-7777-4777-8777-777777777777", flowVersionId: "88888888-8888-4888-8888-888888888888", ownerUserId, effectiveFrom: "2026-08-13T09:00:00.000Z", effectiveTo: null, rolloutPolicyRevision: 1, manifestDigest: sha256CanonicalJson({ schemaVersion: "flow-capability-manifest.v2", executionSemanticsVersion: "flow-interpreter.v1", triggerMatcher: { kind: "product_purchased", configSchemaVersion: 1, matcherContractVersion: 1, eventSchemaVersion: 1 }, nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }], requiredCapabilities: ["finance.events.client_order_captured", "products.read"] }), graph, capabilityManifest: { schemaVersion: "flow-capability-manifest.v2", executionSemanticsVersion: "flow-interpreter.v1", triggerMatcher: { kind: "product_purchased", configSchemaVersion: 1, matcherContractVersion: 1, eventSchemaVersion: 1 }, nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }], requiredCapabilities: ["finance.events.client_order_captured", "products.read"] } } })).toMatchObject({ status: "matched", occurrenceKey: clientUserId, enrollmentPolicyKey: "once_per_client" });
  });

  it("uses the event occurrence key for after-previous-terminal starts", () => {
    const event = normalizeFlowClientEvent({
      ownerUserId,
      relationshipId: "44444444-4444-4444-8444-444444444444",
      source: "finance",
      sourceEventId: "order:99999999-9999-4999-8999-999999999999:captured",
      event: { eventKind: "product_purchased", clientUserId, productId },
      occurrenceKey: "99999999-9999-4999-8999-999999999999",
      occurredAtUtc: "2026-08-13T11:00:00.000Z",
      payloadSchemaVersion: 1,
      allowlistedPayload: { productId, orderId: "99999999-9999-4999-8999-999999999999" },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.product-purchased.v1",
      dedupeKey: "order:99999999-9999-4999-8999-999999999999:captured"
    });
    const graph = {
      schemaVersion: "flow-graph.v2",
      nodes: [
        { id: "purchase", kind: "product_purchased", displayTitle: "Purchase", configSchemaVersion: 1, executorContractVersion: 1, config: { productIds: [productId], enrollmentPolicy: "after_previous_terminal" } },
        { id: "done", kind: "completed", displayTitle: "Done", configSchemaVersion: 1, executorContractVersion: 1, config: { goalKey: "done" } }
      ],
      edges: [{ id: "purchase-done", sourceNodeId: "purchase", targetNodeId: "done", sourceHandle: "next" }]
    };
    expect(planFlowClientEventEnrollment({ event, candidate: { activationEpochId: "66666666-6666-4666-8666-666666666666", flowId: "77777777-7777-4777-8777-777777777777", flowVersionId: "88888888-8888-4888-8888-888888888888", ownerUserId, effectiveFrom: "2026-08-13T09:00:00.000Z", effectiveTo: null, rolloutPolicyRevision: 1, manifestDigest: sha256CanonicalJson({ schemaVersion: "flow-capability-manifest.v2", executionSemanticsVersion: "flow-interpreter.v1", triggerMatcher: { kind: "product_purchased", configSchemaVersion: 1, matcherContractVersion: 1, eventSchemaVersion: 1 }, nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }], requiredCapabilities: ["finance.events.client_order_captured", "products.read"] }), graph, capabilityManifest: { schemaVersion: "flow-capability-manifest.v2", executionSemanticsVersion: "flow-interpreter.v1", triggerMatcher: { kind: "product_purchased", configSchemaVersion: 1, matcherContractVersion: 1, eventSchemaVersion: 1 }, nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }], requiredCapabilities: ["finance.events.client_order_captured", "products.read"] } } })).toMatchObject({ status: "matched", occurrenceKey: event.occurrenceKey, enrollmentPolicyKey: "after_previous_terminal" });
  });

  it("skips active flows for other client-event trigger kinds without failing enrollment", () => {
    const event = normalizeFlowClientEvent({
      ownerUserId,
      relationshipId: "44444444-4444-4444-8444-444444444444",
      source: "finance",
      sourceEventId: "order:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:captured",
      event: { eventKind: "product_purchased", clientUserId, productId },
      occurrenceKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      occurredAtUtc: "2026-08-13T11:00:00.000Z",
      payloadSchemaVersion: 1,
      allowlistedPayload: { productId, orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.product-purchased.v1",
      dedupeKey: "order:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:captured"
    });
    const graph = {
      schemaVersion: "flow-graph.v2",
      nodes: [
        { id: "first-message", kind: "first_inbound_message", displayTitle: "First", configSchemaVersion: 1, executorContractVersion: 1, config: { enrollmentPolicy: "once_per_client" } },
        { id: "done", kind: "completed", displayTitle: "Done", configSchemaVersion: 1, executorContractVersion: 1, config: { goalKey: "done" } }
      ],
      edges: [{ id: "first-done", sourceNodeId: "first-message", targetNodeId: "done", sourceHandle: "next" }]
    };
    const capabilityManifest = {
      schemaVersion: "flow-capability-manifest.v2",
      executionSemanticsVersion: "flow-interpreter.v1",
      triggerMatcher: { kind: "first_inbound_message", configSchemaVersion: 1, matcherContractVersion: 1, eventSchemaVersion: 1 },
      nodeExecutors: [{ kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 }],
      requiredCapabilities: ["messaging.events.first_inbound_message"]
    };

    expect(
      planFlowClientEventEnrollment({
        event,
        candidate: {
          activationEpochId: "66666666-6666-4666-8666-666666666666",
          flowId: "77777777-7777-4777-8777-777777777777",
          flowVersionId: "88888888-8888-4888-8888-888888888888",
          ownerUserId,
          effectiveFrom: "2026-08-13T09:00:00.000Z",
          effectiveTo: null,
          rolloutPolicyRevision: 1,
          manifestDigest: sha256CanonicalJson(capabilityManifest),
          graph,
          capabilityManifest
        }
      })
    ).toEqual({ status: "not_matched", reason: "trigger_kind" });
  });
});
