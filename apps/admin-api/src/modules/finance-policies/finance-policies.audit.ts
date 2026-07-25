export type AdminFinancePolicyAuditEvent = {
  readonly actorUserId: string;
  readonly action:
    | "finance_policy.updated"
    | "finance_policy.default_created"
    | "astrologer_risk_profile.updated";
  readonly targetId: string;
  readonly occurredAt: string;
  readonly metadata: Record<string, unknown>;
};

export type AdminFinancePolicyAuditSink = {
  readonly record: (event: AdminFinancePolicyAuditEvent) => Promise<void>;
};

export class ConsoleAdminFinancePolicyAuditSink implements AdminFinancePolicyAuditSink {
  async record(event: AdminFinancePolicyAuditEvent): Promise<void> {
    // Temporary structured audit sink until the shared AuditLog module lands.
    console.info("admin finance policy audit", event);
  }
}
