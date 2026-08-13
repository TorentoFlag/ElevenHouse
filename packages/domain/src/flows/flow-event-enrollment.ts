import type {
  FlowEnrollmentPolicyKey,
  FlowGraphV2,
  FlowSubscriptionEventTypeV2
} from "@elevenhouse/contracts";

export type FlowClientTriggerEvent =
  | {
      readonly eventKind: "new_lead";
      readonly clientUserId: string;
    }
  | {
      readonly eventKind: "free_product_received";
      readonly clientUserId: string;
      readonly productId: string;
    }
  | {
      readonly eventKind: "product_purchased";
      readonly clientUserId: string;
      readonly productId: string;
    }
  | {
      readonly eventKind: "first_inbound_message";
      readonly clientUserId: string;
    }
  | {
      readonly eventKind: "astro_event";
      readonly clientUserId: string;
      readonly eventCode: string;
    }
  | {
      readonly eventKind: "client_lifecycle_changed";
      readonly clientUserId: string;
      readonly fromStatus:
        | "new"
        | "active"
        | "waiting_for_client"
        | "in_service"
        | "inactive"
        | null;
      readonly toStatus: "new" | "active" | "waiting_for_client" | "in_service" | "inactive";
    }
  | {
      readonly eventKind: "schedule_time";
      readonly clientUserId: string;
      readonly scheduleKey: string;
    }
  | {
      readonly eventKind: "review_received";
      readonly clientUserId: string;
    }
  | {
      readonly eventKind: "subscription_event";
      readonly clientUserId: string;
      readonly eventType: FlowSubscriptionEventTypeV2;
    };

export type FlowClientTriggerMatch =
  | {
      readonly status: "matched";
      readonly triggerNodeId: string;
      readonly enrollmentPolicy: FlowEnrollmentPolicyKey;
    }
  | {
      readonly status: "not_matched";
      readonly reason: "trigger_kind" | "product_filter" | "status_filter" | "event_filter";
    };

export function matchFlowClientTriggerEvent(input: {
  readonly graph: FlowGraphV2;
  readonly event: FlowClientTriggerEvent;
}): FlowClientTriggerMatch {
  if (input.event.eventKind === "product_purchased") {
    const trigger = input.graph.nodes.find((node) => node.kind === "product_purchased");
    if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
    if (!trigger.config.productIds.includes(input.event.productId)) {
      return { status: "not_matched", reason: "product_filter" };
    }
    return {
      status: "matched",
      triggerNodeId: trigger.id,
      enrollmentPolicy: trigger.config.enrollmentPolicy
    };
  }

  if (input.event.eventKind === "free_product_received") {
    const trigger = input.graph.nodes.find((node) => node.kind === "free_product_received");
    if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
    if (!trigger.config.productIds.includes(input.event.productId)) {
      return { status: "not_matched", reason: "product_filter" };
    }
    return {
      status: "matched",
      triggerNodeId: trigger.id,
      enrollmentPolicy: trigger.config.enrollmentPolicy
    };
  }

  if (input.event.eventKind === "new_lead") {
    const trigger = input.graph.nodes.find((node) => node.kind === "new_lead");
    if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
    return {
      status: "matched",
      triggerNodeId: trigger.id,
      enrollmentPolicy: trigger.config.enrollmentPolicy
    };
  }

  if (input.event.eventKind === "first_inbound_message") {
    const trigger = input.graph.nodes.find((node) => node.kind === "first_inbound_message");
    if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
    return {
      status: "matched",
      triggerNodeId: trigger.id,
      enrollmentPolicy: trigger.config.enrollmentPolicy
    };
  }

  if (input.event.eventKind === "astro_event") {
    const trigger = input.graph.nodes.find((node) => node.kind === "astro_event");
    if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
    if (!trigger.config.eventCodes.includes(input.event.eventCode)) {
      return { status: "not_matched", reason: "event_filter" };
    }
    return {
      status: "matched",
      triggerNodeId: trigger.id,
      enrollmentPolicy: trigger.config.enrollmentPolicy
    };
  }

  if (input.event.eventKind === "schedule_time") {
    const trigger = input.graph.nodes.find((node) => node.kind === "schedule_time");
    if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
    if (trigger.config.scheduleKey !== input.event.scheduleKey) {
      return { status: "not_matched", reason: "event_filter" };
    }
    return {
      status: "matched",
      triggerNodeId: trigger.id,
      enrollmentPolicy: trigger.config.enrollmentPolicy
    };
  }

  if (input.event.eventKind === "review_received") {
    const trigger = input.graph.nodes.find((node) => node.kind === "review_received");
    if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
    return {
      status: "matched",
      triggerNodeId: trigger.id,
      enrollmentPolicy: trigger.config.enrollmentPolicy
    };
  }

  if (input.event.eventKind === "subscription_event") {
    const trigger = input.graph.nodes.find((node) => node.kind === "subscription_event");
    if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
    if (!trigger.config.eventTypes.includes(input.event.eventType)) {
      return { status: "not_matched", reason: "event_filter" };
    }
    return {
      status: "matched",
      triggerNodeId: trigger.id,
      enrollmentPolicy: trigger.config.enrollmentPolicy
    };
  }

  const trigger = input.graph.nodes.find((node) => node.kind === "client_lifecycle_changed");
  if (!trigger) return { status: "not_matched", reason: "trigger_kind" };
  if (
    (trigger.config.fromStatus !== null && trigger.config.fromStatus !== input.event.fromStatus) ||
    (trigger.config.toStatus !== null && trigger.config.toStatus !== input.event.toStatus)
  ) {
    return { status: "not_matched", reason: "status_filter" };
  }
  return {
    status: "matched",
    triggerNodeId: trigger.id,
    enrollmentPolicy: trigger.config.enrollmentPolicy
  };
}
