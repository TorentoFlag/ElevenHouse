export const flowStatusValues = ["draft", "published", "active", "paused", "archived"] as const;

export const flowDefinitionStateValues = ["draft", "versioned", "archived"] as const;

export const flowDefinitionCommandStateValues = ["processing", "succeeded", "failed"] as const;

export const flowDefinitionCommandScopeValues = [
  "flows.definition.create.v2",
  "flows.definition.update-draft.v2",
  "flows.definition.publish.v2",
  "flows.definition.create-next-draft.v2",
  "flows.definition.migrate.v2"
] as const;

export const flowDefinitionRouteTemplateValues = [
  "/flows",
  "/flows/:flowId/draft",
  "/flows/:flowId/publish",
  "/flows/:flowId/next-draft",
  "/flows/:flowId/migrations/v2"
] as const;

export const flowApprovalModeValues = [
  "draft_only",
  "manual_approve",
  "auto_internal",
  "auto_send"
] as const;

export const flowRuntimeEventSourceValues = [
  "crm",
  "product",
  "order",
  "booking",
  "message",
  "chart",
  "astro_calendar",
  "manual"
] as const;

export const flowRunSubjectTypeValues = [
  "client",
  "segment",
  "order",
  "booking",
  "global_event",
  "manual"
] as const;

export const flowRunStatusValues = [
  "pending",
  "running",
  "waiting",
  "approval_required",
  "completed",
  "skipped",
  "failed_retryable",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
] as const;

export const flowStepRunStatusValues = flowRunStatusValues;

export const flowApprovalStatusValues = [
  "pending",
  "approved",
  "rejected",
  "snoozed",
  "expired"
] as const;

export const flowApprovalKindValues = [
  "message",
  "ai_output",
  "delivery",
  "payment_offer",
  "manual_task"
] as const;

export const flowDeliveryAttemptStatusValues = ["pending", "sent", "failed", "unknown"] as const;

export const flowSuppressionReasonValues = [
  "FLOW_NOT_PUBLISHED",
  "FLOW_NOT_ACTIVE",
  "OWNER_RELATIONSHIP_REQUIRED",
  "CHANNEL_CONSENT_REQUIRED",
  "QUIET_HOURS_HOLD",
  "FREQUENCY_CAP_HOLD",
  "PLAN_LIMIT_REACHED",
  "AUTO_SEND_DISABLED"
] as const;

export function formatFlowSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
