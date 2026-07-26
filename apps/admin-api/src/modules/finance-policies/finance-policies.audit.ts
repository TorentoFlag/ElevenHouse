import type { AuditLogStore } from "@elevenhouse/domain";

export type AdminFinancePolicyAuditEvent = {
  readonly actorUserId: string;
  readonly action:
    | "finance_policy.updated"
    | "finance_policy.default_created"
    | "astrologer_risk_profile.updated"
    | "finance_policy.applied_to_order"
    | "payout_request.status_updated";
  readonly targetId: string;
  readonly occurredAt: string;
  readonly metadata: Record<string, unknown>;
};

export type AdminFinancePolicyAuditSink = {
  readonly record: (event: AdminFinancePolicyAuditEvent) => Promise<void>;
};

export class DurableAdminFinancePolicyAuditSink implements AdminFinancePolicyAuditSink {
  constructor(private readonly auditLogStore: AuditLogStore) {}

  async record(event: AdminFinancePolicyAuditEvent): Promise<void> {
    await this.auditLogStore.createEntry({
      actorUserId: event.actorUserId,
      action: event.action,
      targetType: targetTypeForAction(event.action),
      targetId: event.targetId,
      occurredAt: event.occurredAt,
      metadata: event.metadata
    });
  }
}

function targetTypeForAction(action: AdminFinancePolicyAuditEvent["action"]): string {
  if (action === "astrologer_risk_profile.updated") {
    return "astrologer_risk_profile";
  }
  if (action === "finance_policy.applied_to_order") {
    return "finance_order";
  }
  if (action === "payout_request.status_updated") {
    return "payout_request";
  }
  return "finance_policy";
}
