import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { auditActorSubjects } from "../../schema/audit-log";
import { flowRuntimeOwnerSubjects } from "../../schema/flows";

export type FlowEnrollmentTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];

export async function resolveFlowEnrollmentSubjects(
  transaction: FlowEnrollmentTransaction,
  input: { readonly actorUserId: string; readonly ownerUserId: string }
): Promise<{ readonly actorSubjectId: string; readonly ownerSubjectId: string } | null> {
  const actorSubjectId = await resolveActorSubject(transaction, input.actorUserId);
  if (!actorSubjectId) return null;
  const ownerSubjectId = await resolveOwnerSubject(transaction, input.ownerUserId);
  return ownerSubjectId ? { actorSubjectId, ownerSubjectId } : null;
}

async function resolveActorSubject(
  transaction: FlowEnrollmentTransaction,
  actorUserId: string
): Promise<string | null> {
  const [inserted] = await transaction
    .insert(auditActorSubjects)
    .values({ kind: "user", userId: actorUserId })
    .onConflictDoNothing()
    .returning({ actorSubjectId: auditActorSubjects.actorSubjectId });
  if (inserted) return inserted.actorSubjectId;

  const [existing] = await transaction
    .select({ actorSubjectId: auditActorSubjects.actorSubjectId })
    .from(auditActorSubjects)
    .where(
      and(
        eq(auditActorSubjects.kind, "user"),
        eq(auditActorSubjects.userId, actorUserId),
        eq(auditActorSubjects.state, "active")
      )
    )
    .limit(1)
    .for("update", { of: auditActorSubjects });
  return existing?.actorSubjectId ?? null;
}

async function resolveOwnerSubject(
  transaction: FlowEnrollmentTransaction,
  ownerUserId: string
): Promise<string | null> {
  const [inserted] = await transaction
    .insert(flowRuntimeOwnerSubjects)
    .values({ ownerUserId })
    .onConflictDoNothing()
    .returning({ ownerSubjectId: flowRuntimeOwnerSubjects.ownerSubjectId });
  if (inserted) return inserted.ownerSubjectId;

  const [existing] = await transaction
    .select({ ownerSubjectId: flowRuntimeOwnerSubjects.ownerSubjectId })
    .from(flowRuntimeOwnerSubjects)
    .where(
      and(
        eq(flowRuntimeOwnerSubjects.ownerUserId, ownerUserId),
        eq(flowRuntimeOwnerSubjects.state, "active")
      )
    )
    .limit(1)
    .for("update", { of: flowRuntimeOwnerSubjects });
  return existing?.ownerSubjectId ?? null;
}
