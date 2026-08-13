export const flowDefinitionStateValues = ["draft", "versioned", "archived"] as const;

export const flowDefinitionCommandStateValues = ["processing", "succeeded", "failed"] as const;

export const flowDefinitionCommandScopeValues = [
  "flows.definition.create.v2",
  "flows.definition.update-draft.v2",
  "flows.definition.publish.v2",
  "flows.definition.create-next-draft.v2"
] as const;

export const flowDefinitionRouteTemplateValues = [
  "/flows",
  "/flows/:flowId/draft",
  "/flows/:flowId/publish",
  "/flows/:flowId/next-draft"
] as const;

export const flowRuntimeCommandStateValues = ["processing", "succeeded", "failed"] as const;

export const flowRuntimeCommandScopeValues = [
  "flows.runtime.cancel.v1",
  "flows.approvals.decide.v1",
  "flows.work-items.start.v1",
  "flows.work-items.snooze.v1",
  "flows.work-items.complete.v1"
] as const;

export const flowRuntimeCommandRouteTemplateValues = [
  "/flow-runs/:runId/cancel",
  "/flow-approvals/:approvalId/decision",
  "/flow-work-items/:workItemId/start",
  "/flow-work-items/:workItemId/snooze",
  "/flow-work-items/:workItemId/complete"
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
  "manual",
  "finance",
  "messaging",
  "clients"
] as const;

export const flowRuntimeEventKindValues = [
  "booking_confirmed",
  "manual_client",
  "new_lead",
  "free_product_received",
  "product_purchased",
  "first_inbound_message",
  "astro_event",
  "client_lifecycle_changed",
  "schedule_time",
  "review_received",
  "subscription_event"
] as const;

export const flowRuntimeEventClassificationValues = ["personal"] as const;

export const flowRuntimeEventIngestionOutcomeValues = [
  "enrolled",
  "no_match",
  "late_unmatched",
  "subject_ineligible",
  "suppressed"
] as const;

export const flowEnrollmentPolicyKeyValues = [
  "once_per_occurrence",
  "once_per_client",
  "each_occurrence",
  "after_previous_terminal"
] as const;

export const flowExecutionAuthorityBasisValues = [
  "current_entitlement",
  "paid_order_obligation"
] as const;

export const flowBookingLifecycleStateValues = ["confirmed", "completed", "cancelled"] as const;

export const flowBookingLifecycleReceiptOutcomeValues = [
  "enrolled",
  "no_match",
  "late_unmatched",
  "subject_ineligible",
  "suppressed",
  "completed",
  "canceled",
  "rescheduled"
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

export const flowExecutionTokenStateValues = [
  "runnable",
  "claimed",
  "waiting_timer",
  "waiting_signal",
  "waiting_external",
  "waiting_work_item",
  "waiting_approval",
  "retry_scheduled",
  "completed",
  "failed",
  "canceled"
] as const;

export const flowExecutionSignalTypeValues = [
  "chart.calculation.terminal.v1",
  "messaging.message.delivery.terminal.v1"
] as const;

export const flowExecutionSignalOutcomeValues = ["succeeded", "failed"] as const;

export const flowExecutionSignalWaitStateValues = ["waiting", "consumed", "canceled"] as const;

export const flowBirthProfileRecheckReceiptOutcomeValues = ["ready", "not_ready", "stale"] as const;

export const flowExecutionAttemptOutcomeValues = [
  "advanced",
  "waiting",
  "retry_scheduled",
  "completed",
  "failed",
  "lease_expired",
  "canceled"
] as const;

export const flowRunEventTypeValues = [
  "run_enrolled",
  "token_advanced",
  "token_waiting",
  "token_signaled",
  "work_item_available",
  "approval_available",
  "approval_expired",
  "booking_rescheduled",
  "token_retry_scheduled",
  "token_lease_expired",
  "run_completed",
  "run_failed",
  "run_suppressed",
  "run_canceled"
] as const;

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
