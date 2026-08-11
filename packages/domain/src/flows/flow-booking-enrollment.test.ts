import { describe, expect, it } from "vitest";
import type { FlowGraphV2 } from "@elevenhouse/contracts";

import { createBookingLifecycleEvent } from "../bookings";
import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import type { FlowBookingConfirmedEnrollmentRequestedPayloadV1 } from "./flow-runtime-outbox";
import {
  compileFlowGraphV2,
  evaluateBookingConfirmedFlowEventTiming,
  normalizeBookingConfirmedFlowLifecycleEvent,
  normalizeBookingConfirmedFlowEnrollmentEvent,
  planBookingConfirmedFlowEnrollment,
  type FlowBookingEnrollmentSubject
} from "./index";

describe("booking-confirmed Flow enrollment", () => {
  it("normalizes the transport reference from the authoritative Booking subject", () => {
    const subject = bookingSubject();

    expect(
      normalizeBookingConfirmedFlowEnrollmentEvent({
        request: enrollmentRequest(subject.id),
        subject
      })
    ).toEqual({
      schemaVersion: "flow-normalized-event.v1",
      ownerUserId: subject.ownerUserId,
      source: "booking",
      sourceEventId: `booking:${subject.id}:confirmed`,
      eventKind: "booking_confirmed",
      subjectType: "booking",
      subjectId: subject.id,
      occurrenceKey: subject.id,
      occurredAtUtc: "2026-08-04T09:05:00.000Z",
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        bookingId: subject.id,
        clientUserId: subject.clientUserId,
        productId: subject.productId,
        startAt: subject.startAt,
        endAt: subject.endAt,
        lifecycleEventId: null,
        lifecycleRevision: null
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.booking-confirmed.v1",
      dedupeKey: `booking-confirmed:${subject.id}`,
      canonicalPayloadHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
  });

  it("rejects a transport reference that does not identify the resolved Booking", () => {
    const subject = bookingSubject();

    expect(() =>
      normalizeBookingConfirmedFlowEnrollmentEvent({
        request: {
          ...enrollmentRequest(subject.id),
          subjectId: "55555555-5555-4555-8555-555555555555"
        },
        subject
      })
    ).toThrow("FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_INVALID");
  });

  it("normalizes generic lifecycle delivery from the immutable confirmation schedule", () => {
    const subject = {
      ...bookingSubject(),
      startAt: "2026-08-20T15:00:00.000Z",
      endAt: "2026-08-20T16:00:00.000Z"
    };
    const lifecycleEvent = createBookingLifecycleEvent({
      id: "88888888-8888-4888-8888-888888888888",
      bookingId: subject.id,
      ownerUserId: subject.ownerUserId,
      revision: 1,
      kind: "confirmed",
      actor: { kind: "system", userId: null },
      reasonCode: null,
      before: null,
      after: {
        startAt: "2026-08-08T09:00:00.000Z",
        endAt: "2026-08-08T10:00:00.000Z",
        timeZone: "Europe/Moscow"
      },
      occurredAt: "2026-08-04T09:05:00.000Z"
    });

    expect(
      normalizeBookingConfirmedFlowLifecycleEvent({ lifecycleEvent, subject })
    ).toMatchObject({
      sourceEventId: lifecycleEvent.id,
      occurredAtUtc: lifecycleEvent.occurredAt,
      allowlistedPayload: {
        bookingId: subject.id,
        clientUserId: subject.clientUserId,
        productId: subject.productId,
        startAt: lifecycleEvent.after?.startAt,
        endAt: lifecycleEvent.after?.endAt,
        lifecycleEventId: lifecycleEvent.id,
        lifecycleRevision: 1
      }
    });
  });

  it("stores an event beyond the configured lateness horizon without matching it", () => {
    expect(
      evaluateBookingConfirmedFlowEventTiming({
        occurredAtUtc: "2026-08-04T09:05:00.000Z",
        receivedAtUtc: "2026-08-12T09:05:00.001Z",
        latenessHorizonMs: 7 * 24 * 60 * 60 * 1_000,
        futureSkewToleranceMs: 5 * 60 * 1_000
      })
    ).toBe("late_unmatched");
  });

  it("consumes the trigger and plans one first token on its next target", () => {
    const subject = bookingSubject();
    const event = normalizeBookingConfirmedFlowEnrollmentEvent({
      request: enrollmentRequest(subject.id),
      subject
    });
    const graph = bookingToCompletedGraph(subject.productId);
    const compiled = compileFlowGraphV2(graph);
    const capabilityManifest = compiled.capabilityManifest ?? raise("Expected manifest");

    expect(
      planBookingConfirmedFlowEnrollment({
        event,
        candidate: {
          activationEpochId: "55555555-5555-4555-8555-555555555555",
          flowId: "66666666-6666-4666-8666-666666666666",
          flowVersionId: "77777777-7777-4777-8777-777777777777",
          ownerUserId: subject.ownerUserId,
          effectiveFrom: "2026-08-01T00:00:00.000Z",
          effectiveTo: null,
          rolloutPolicyRevision: 3,
          manifestDigest: sha256CanonicalJson(
            capabilityManifest as unknown as CanonicalJson
          ),
          graph,
          capabilityManifest
        }
      })
    ).toEqual({
      status: "matched",
      activationEpochId: "55555555-5555-4555-8555-555555555555",
      flowId: "66666666-6666-4666-8666-666666666666",
      flowVersionId: "77777777-7777-4777-8777-777777777777",
      triggerNodeId: "trigger-booking",
      occurrenceKey: subject.id,
      enrollmentPolicyKey: "once_per_occurrence",
      enrollmentPolicyRevision: 1,
      rolloutPolicyRevision: 3,
      requirementKeys: [
        "capability:bookings.events.booking_confirmed",
        "capability:products.read",
        "executor:completed:1:1",
        "runtime:flow-interpreter.v1",
        "trigger:booking_confirmed:1:1:1"
      ],
      initialToken: {
        nodeId: "done",
        nodeKind: "completed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        executorKey: "completed:1:1"
      }
    });
  });

  it("skips an active definition with a different trigger kind", () => {
    const subject = bookingSubject();
    const event = normalizeBookingConfirmedFlowEnrollmentEvent({
      request: enrollmentRequest(subject.id),
      subject
    });
    const graph = manualClientToCompletedGraph();
    const compiled = compileFlowGraphV2(graph);
    const capabilityManifest = compiled.capabilityManifest ?? raise("Expected manifest");

    expect(
      planBookingConfirmedFlowEnrollment({
        event,
        candidate: {
          activationEpochId: "55555555-5555-4555-8555-555555555555",
          flowId: "66666666-6666-4666-8666-666666666666",
          flowVersionId: "77777777-7777-4777-8777-777777777777",
          ownerUserId: subject.ownerUserId,
          effectiveFrom: "2026-08-01T00:00:00.000Z",
          effectiveTo: null,
          rolloutPolicyRevision: 3,
          manifestDigest: sha256CanonicalJson(
            capabilityManifest as unknown as CanonicalJson
          ),
          graph,
          capabilityManifest
        }
      })
    ).toEqual({ status: "not_matched", reason: "trigger_kind" });
  });
});

function bookingToCompletedGraph(productId: string): FlowGraphV2 {
  return {
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "trigger-booking",
        kind: "booking_confirmed",
        displayTitle: "Booking confirmed",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { productIds: [productId] }
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "prepared" }
      }
    ],
    edges: [
      {
        id: "trigger-next",
        sourceNodeId: "trigger-booking",
        targetNodeId: "done",
        sourceHandle: "next"
      }
    ]
  };
}

function manualClientToCompletedGraph(): FlowGraphV2 {
  return {
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "trigger-manual-client",
        kind: "manual_client",
        displayTitle: "Client selected manually",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "done",
        kind: "completed",
        displayTitle: "Done",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "prepared" }
      }
    ],
    edges: [
      {
        id: "trigger-next",
        sourceNodeId: "trigger-manual-client",
        targetNodeId: "done",
        sourceHandle: "next"
      }
    ]
  };
}

function enrollmentRequest(bookingId: string): FlowBookingConfirmedEnrollmentRequestedPayloadV1 {
  return {
    schemaVersion: "flow-booking-confirmed-enrollment-request.v1",
    eventKind: "booking_confirmed",
    source: "booking",
    sourceEventId: `booking:${bookingId}:confirmed`,
    subjectType: "booking",
    subjectId: bookingId,
    occurrenceKey: bookingId,
    occurredAt: "2026-08-04T09:05:00.000Z",
    payloadSchemaVersion: 1,
    payload: { bookingId }
  };
}

function bookingSubject(): FlowBookingEnrollmentSubject {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    clientUserId: "33333333-3333-4333-8333-333333333333",
    productId: "44444444-4444-4444-8444-444444444444",
    state: "confirmed",
    source: "client_paid",
    startAt: "2026-08-08T09:00:00.000Z",
    endAt: "2026-08-08T10:00:00.000Z",
    timeZone: "Europe/Moscow"
  };
}

function raise(message: string): never {
  throw new Error(message);
}
