export type AuditLogEntry = {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt: string;
  readonly metadata: Record<string, unknown>;
};

export type CreateAuditLogEntryInput = {
  readonly id?: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt: string;
  readonly metadata: Record<string, unknown>;
};

export type AuditLogStore = {
  readonly createEntry: (input: CreateAuditLogEntryInput) => Promise<AuditLogEntry>;
};
