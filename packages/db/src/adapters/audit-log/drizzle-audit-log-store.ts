import type { AuditLogEntry, AuditLogStore, CreateAuditLogEntryInput } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { auditLogEntries } from "../../schema";

type AuditLogEntryRow = typeof auditLogEntries.$inferSelect;

export function createDrizzleAuditLogStore(database: ElevenHouseDatabase): AuditLogStore {
  return {
    createEntry: (input) => createEntry(database, input)
  };
}

async function createEntry(
  database: Pick<ElevenHouseDatabase, "insert">,
  input: CreateAuditLogEntryInput
): Promise<AuditLogEntry> {
  const [row] = await database
    .insert(auditLogEntries)
    .values({
      ...(input.id ? { id: input.id } : {}),
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt: new Date(input.occurredAt),
      metadata: input.metadata
    })
    .returning();
  if (!row) throw new Error("Expected audit log entry insert to return a row");
  return toAuditLogEntry(row);
}

function toAuditLogEntry(row: AuditLogEntryRow): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    occurredAt: row.occurredAt.toISOString(),
    metadata: row.metadata as Record<string, unknown>
  };
}
