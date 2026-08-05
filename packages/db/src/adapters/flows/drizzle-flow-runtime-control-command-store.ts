import { and, eq, sql } from "drizzle-orm";

import {
  FlowRuntimeControlCommandIdempotencyConflictError,
  FlowRuntimeControlCommandIntegrityError,
  FlowRuntimeControlCommandReplayExpiredError,
  createFlowRuntimeControlCommand,
  verifyFlowRuntimeRolloutPolicyEvidence,
  type FlowRuntimeControlCommand,
  type FlowRuntimeControlCommandResult,
  type FlowRuntimeControlCommandStore,
  type FlowRuntimeControlReplacePolicyRequest,
  type FlowRuntimeRolloutPolicy
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { auditActorSubjects } from "../../schema/audit-log";
import {
  flowRuntimeControlAuthority,
  flowRuntimeControlCommandOutcomes,
  flowRuntimeControlCommands,
  flowRuntimeRolloutPolicyVersions
} from "../../schema/flows";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

const transactionTimestamp = sql`transaction_timestamp()`;
const replayUntil = sql`transaction_timestamp() + interval '24 hours'`;

export function createDrizzleFlowRuntimeControlCommandStore(
  database: ElevenHouseDatabase
): FlowRuntimeControlCommandStore {
  return Object.freeze({
    executeReplacePolicy: (request) => executeReplacePolicy(database, request)
  });
}

async function resolveActorSubject(
  transaction: FlowTransaction,
  actorUserId: string
): Promise<{ readonly actorSubjectId: string }> {
  const [inserted] = await transaction
    .insert(auditActorSubjects)
    .values({ kind: "user", userId: actorUserId })
    .onConflictDoNothing()
    .returning({ actorSubjectId: auditActorSubjects.actorSubjectId });
  if (inserted) return inserted;

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
  if (!existing) throw new FlowRuntimeControlCommandIntegrityError();
  return existing;
}

async function executeReplacePolicy(
  database: ElevenHouseDatabase,
  request: FlowRuntimeControlReplacePolicyRequest
): Promise<FlowRuntimeControlCommandResult> {
  const attempt = await database.transaction<
    | { readonly kind: "created"; readonly result: FlowRuntimeControlCommandResult }
    | { readonly kind: "replay"; readonly command: FlowRuntimeControlCommand }
  >(async (transaction) => {
    const { actorSubjectId } = await resolveActorSubject(transaction, request.actorUserId);
    const command = createFlowRuntimeControlCommand({ request, actorSubjectId });
    const [inserted] = await transaction
      .insert(flowRuntimeControlCommands)
      .values({
        schemaVersion: command.schemaVersion,
        actorSubjectId: command.actorSubjectId,
        commandScope: "flows.runtime-control.replace-policy.v1",
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        expectedRevision: command.expectedRevision,
        targetRevision: command.targetRevision,
        requestedPolicyDigest: command.requestedPolicyEvidence.policyDigest,
        reason: command.reason,
        replayUntil,
        createdAt: transactionTimestamp,
        updatedAt: transactionTimestamp
      })
      .onConflictDoNothing({
        target: [
          flowRuntimeControlCommands.commandScope,
          flowRuntimeControlCommands.actorSubjectId,
          flowRuntimeControlCommands.idempotencyKey
        ]
      })
      .returning({ id: flowRuntimeControlCommands.id });
    if (!inserted) return { kind: "replay", command };

    const [authority] = await transaction
      .select({ currentRevision: flowRuntimeControlAuthority.currentPolicyRevision })
      .from(flowRuntimeControlAuthority)
      .where(eq(flowRuntimeControlAuthority.authorityKey, "primary"))
      .limit(1)
      .for("update", { of: flowRuntimeControlAuthority });
    if (!authority) throw new FlowRuntimeControlCommandIntegrityError();

    if (authority.currentRevision !== command.expectedRevision) {
      await transaction.insert(flowRuntimeControlCommandOutcomes).values({
        commandId: inserted.id,
        resultKind: "revision_conflict",
        currentRevision: authority.currentRevision,
        policyRevision: null,
        requestedPolicyCanonicalPreimage:
          command.requestedPolicyEvidence.canonicalPreimage,
        requestedPolicyDigest: command.requestedPolicyEvidence.policyDigest,
        createdAt: transactionTimestamp
      });
      const completedAt = await completeCommand(transaction, inserted.id, "failed");
      return {
        kind: "created",
        result: {
          kind: "created",
          outcome: {
            kind: "revision_conflict",
            expectedRevision: command.expectedRevision,
            currentRevision: authority.currentRevision,
            completedAt
          }
        }
      };
    }

    await insertPolicy(transaction, command, inserted.id);
    const [advanced] = await transaction
      .update(flowRuntimeControlAuthority)
      .set({
        currentPolicyRevision: command.targetRevision,
        controlRevision: command.targetRevision,
        lastCommandId: inserted.id,
        changeSource: "admin",
        updatedByActorSubjectId: command.actorSubjectId,
        reason: command.reason,
        updatedAt: transactionTimestamp
      })
      .where(
        and(
          eq(flowRuntimeControlAuthority.authorityKey, "primary"),
          eq(flowRuntimeControlAuthority.currentPolicyRevision, command.expectedRevision),
          eq(flowRuntimeControlAuthority.controlRevision, command.expectedRevision)
        )
      )
      .returning({ currentRevision: flowRuntimeControlAuthority.currentPolicyRevision });
    if (advanced?.currentRevision !== command.targetRevision) {
      throw new FlowRuntimeControlCommandIntegrityError();
    }

    await transaction.insert(flowRuntimeControlCommandOutcomes).values({
      commandId: inserted.id,
      resultKind: "applied",
      currentRevision: command.targetRevision,
      policyRevision: command.targetRevision,
      requestedPolicyCanonicalPreimage:
        command.requestedPolicyEvidence.canonicalPreimage,
      requestedPolicyDigest: command.requestedPolicyEvidence.policyDigest,
      createdAt: transactionTimestamp
    });
    const completedAt = await completeCommand(transaction, inserted.id, "succeeded");
    return {
      kind: "created",
      result: {
        kind: "created",
        outcome: {
          kind: "applied",
          controlRevision: command.targetRevision,
          policyEvidence: command.requestedPolicyEvidence,
          completedAt
        }
      }
    };
  });

  return attempt.kind === "created"
    ? attempt.result
    : replayReplacePolicy(database, attempt.command);
}

async function insertPolicy(
  transaction: FlowTransaction,
  command: FlowRuntimeControlCommand,
  commandId: string
): Promise<void> {
  const policy = command.requestedPolicyEvidence.policy;
  await transaction.insert(flowRuntimeRolloutPolicyVersions).values({
    revision: command.targetRevision,
    supersedesRevision: command.expectedRevision,
    commandId,
    schemaVersion: policy.schemaVersion,
    mode: policy.mode,
    canaryOwnerSubjectIds: [...policy.canaryOwnerSubjectIds],
    allowedRequirementKeys: [...policy.allowedRequirementKeys],
    enrollmentGlobalKillSwitch: policy.killSwitches.enrollment.global,
    claimGlobalKillSwitch: policy.killSwitches.claim.global,
    externalDispatchGlobalKillSwitch: policy.killSwitches.externalDispatch.global,
    enrollmentKilledOwnerSubjectIds: [...policy.killSwitches.enrollment.ownerSubjectIds],
    claimKilledOwnerSubjectIds: [...policy.killSwitches.claim.ownerSubjectIds],
    externalDispatchKilledOwnerSubjectIds: [
      ...policy.killSwitches.externalDispatch.ownerSubjectIds
    ],
    enrollmentKilledCapabilityKeys: [...policy.killSwitches.enrollment.capabilityKeys],
    claimKilledCapabilityKeys: [...policy.killSwitches.claim.capabilityKeys],
    externalDispatchKilledCapabilityKeys: [
      ...policy.killSwitches.externalDispatch.capabilityKeys
    ],
    readinessLeaseTtlMs: policy.readinessLeaseTtlMs,
    tokenLeaseDurationMs: policy.tokenLeaseDurationMs,
    canonicalPreimage: command.requestedPolicyEvidence.canonicalPreimage,
    policyDigest: command.requestedPolicyEvidence.policyDigest,
    changeSource: "admin",
    createdByActorSubjectId: command.actorSubjectId,
    reason: command.reason,
    createdAt: transactionTimestamp
  });
}

async function completeCommand(
  transaction: FlowTransaction,
  commandId: string,
  state: "succeeded" | "failed"
): Promise<string> {
  const [completed] = await transaction
    .update(flowRuntimeControlCommands)
    .set({ state, completedAt: transactionTimestamp, updatedAt: transactionTimestamp })
    .where(
      and(
        eq(flowRuntimeControlCommands.id, commandId),
        eq(flowRuntimeControlCommands.state, "processing")
      )
    )
    .returning({ completedAt: flowRuntimeControlCommands.completedAt });
  if (!completed?.completedAt) throw new FlowRuntimeControlCommandIntegrityError();
  return completed.completedAt.toISOString();
}

async function replayReplacePolicy(
  database: ElevenHouseDatabase,
  command: FlowRuntimeControlCommand
): Promise<FlowRuntimeControlCommandResult> {
  const [row] = await database
    .select({
      requestHash: flowRuntimeControlCommands.requestHash,
      expectedRevision: flowRuntimeControlCommands.expectedRevision,
      targetRevision: flowRuntimeControlCommands.targetRevision,
      state: flowRuntimeControlCommands.state,
      completedAt: flowRuntimeControlCommands.completedAt,
      replayExpired: sql<boolean>`${flowRuntimeControlCommands.replayUntil} <= clock_timestamp()`,
      resultKind: flowRuntimeControlCommandOutcomes.resultKind,
      currentRevision: flowRuntimeControlCommandOutcomes.currentRevision,
      policyRevision: flowRuntimeControlCommandOutcomes.policyRevision,
      requestedPolicyCanonicalPreimage:
        flowRuntimeControlCommandOutcomes.requestedPolicyCanonicalPreimage,
      requestedPolicyDigest: flowRuntimeControlCommandOutcomes.requestedPolicyDigest
    })
    .from(flowRuntimeControlCommands)
    .leftJoin(
      flowRuntimeControlCommandOutcomes,
      eq(flowRuntimeControlCommandOutcomes.commandId, flowRuntimeControlCommands.id)
    )
    .where(commandIdentityPredicate(command))
    .limit(1);
  if (!row) throw new FlowRuntimeControlCommandIntegrityError();
  if (row.requestHash !== command.requestHash) {
    throw new FlowRuntimeControlCommandIdempotencyConflictError();
  }
  if (row.replayExpired) throw new FlowRuntimeControlCommandReplayExpiredError();
  if (!row.completedAt || row.currentRevision === null || row.resultKind === null) {
    throw new FlowRuntimeControlCommandIntegrityError();
  }
  const completedAt = row.completedAt.toISOString();

  if (
    row.state === "succeeded" &&
    row.resultKind === "applied" &&
    row.currentRevision === command.targetRevision &&
    row.policyRevision === command.targetRevision &&
    row.requestedPolicyCanonicalPreimage &&
    row.requestedPolicyDigest
  ) {
    const policyEvidence = parsePolicyEvidence({
      revision: command.targetRevision,
      canonicalPreimage: row.requestedPolicyCanonicalPreimage,
      policyDigest: row.requestedPolicyDigest
    });
    return {
      kind: "replayed",
      outcome: {
        kind: "applied",
        controlRevision: row.currentRevision,
        policyEvidence,
        completedAt
      }
    };
  }
  if (
    row.state === "failed" &&
    row.resultKind === "revision_conflict" &&
    row.expectedRevision === command.expectedRevision &&
    row.targetRevision === command.targetRevision &&
    row.policyRevision === null &&
    row.requestedPolicyCanonicalPreimage &&
    row.requestedPolicyDigest &&
    row.currentRevision !== command.expectedRevision
  ) {
    const requestedPolicyEvidence = parsePolicyEvidence({
      revision: command.targetRevision,
      canonicalPreimage: row.requestedPolicyCanonicalPreimage,
      policyDigest: row.requestedPolicyDigest
    });
    if (
      requestedPolicyEvidence.canonicalPreimage !==
        command.requestedPolicyEvidence.canonicalPreimage ||
      requestedPolicyEvidence.policyDigest !== command.requestedPolicyEvidence.policyDigest
    ) {
      throw new FlowRuntimeControlCommandIntegrityError();
    }
    return {
      kind: "replayed",
      outcome: {
        kind: "revision_conflict",
        expectedRevision: command.expectedRevision,
        currentRevision: row.currentRevision,
        completedAt
      }
    };
  }
  throw new FlowRuntimeControlCommandIntegrityError();
}

function parsePolicyEvidence(input: {
  readonly revision: number;
  readonly canonicalPreimage: string;
  readonly policyDigest: string;
}) {
  let payload: unknown;
  try {
    payload = JSON.parse(input.canonicalPreimage);
  } catch {
    throw new FlowRuntimeControlCommandIntegrityError();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new FlowRuntimeControlCommandIntegrityError();
  }
  return {
    policy: verifyFlowRuntimeRolloutPolicyEvidence({
      policy: {
        ...(payload as Omit<FlowRuntimeRolloutPolicy, "revision">),
        revision: input.revision
      },
      canonicalPreimage: input.canonicalPreimage,
      policyDigest: input.policyDigest as `sha256:${string}`
    }),
    canonicalPreimage: input.canonicalPreimage,
    policyDigest: input.policyDigest as `sha256:${string}`
  };
}

function commandIdentityPredicate(command: FlowRuntimeControlCommand) {
  return and(
    eq(flowRuntimeControlCommands.commandScope, "flows.runtime-control.replace-policy.v1"),
    eq(flowRuntimeControlCommands.actorSubjectId, command.actorSubjectId),
    eq(flowRuntimeControlCommands.idempotencyKey, command.idempotencyKey)
  );
}
