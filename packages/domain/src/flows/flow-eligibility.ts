import type { FlowRunSubjectType, FlowStatus } from "@elevenhouse/contracts";

export type FlowSuppressionReason =
  | "FLOW_NOT_PUBLISHED"
  | "FLOW_NOT_ACTIVE"
  | "OWNER_RELATIONSHIP_REQUIRED"
  | "CHANNEL_CONSENT_REQUIRED"
  | "QUIET_HOURS_HOLD"
  | "FREQUENCY_CAP_HOLD"
  | "PLAN_LIMIT_REACHED"
  | "AUTO_SEND_DISABLED";

export type FlowEligibilityInput = {
  readonly status: FlowStatus;
  readonly publishedVersionId: string | null;
  readonly subjectType: FlowRunSubjectType;
  readonly hasOwnerRelationship?: boolean;
  readonly hasChannelConsent?: boolean;
  readonly isQuietHours?: boolean;
  readonly isFrequencyCapped?: boolean;
  readonly isPlanLimitReached?: boolean;
  readonly containsAutoSendNode?: boolean;
};

export type FlowEligibilityResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: FlowSuppressionReason };

export function checkFlowRunEligibility(input: FlowEligibilityInput): FlowEligibilityResult {
  if (!input.publishedVersionId) {
    return { allowed: false, reason: "FLOW_NOT_PUBLISHED" };
  }

  if (input.status !== "active") {
    return { allowed: false, reason: "FLOW_NOT_ACTIVE" };
  }

  if (input.subjectType === "client" && input.hasOwnerRelationship !== true) {
    return { allowed: false, reason: "OWNER_RELATIONSHIP_REQUIRED" };
  }

  if (input.hasChannelConsent === false) {
    return { allowed: false, reason: "CHANNEL_CONSENT_REQUIRED" };
  }

  if (input.isQuietHours === true) {
    return { allowed: false, reason: "QUIET_HOURS_HOLD" };
  }

  if (input.isFrequencyCapped === true) {
    return { allowed: false, reason: "FREQUENCY_CAP_HOLD" };
  }

  if (input.isPlanLimitReached === true) {
    return { allowed: false, reason: "PLAN_LIMIT_REACHED" };
  }

  if (input.containsAutoSendNode === true) {
    return { allowed: false, reason: "AUTO_SEND_DISABLED" };
  }

  return { allowed: true };
}
