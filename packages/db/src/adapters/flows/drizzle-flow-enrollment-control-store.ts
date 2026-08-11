import {
  activateFlowVersionResponseSchema,
  flowEnrollmentCommandRejectionResponseSchema,
  pauseFlowEnrollmentResponseSchema,
  type ActivateFlowVersionResponse,
  type FlowActivationEpoch,
  type FlowEnrollmentCommandRejectionResponse,
  type PauseFlowEnrollmentResponse
} from "@elevenhouse/contracts";
import {
  FlowEnrollmentAuthorityIntegrityError,
  FlowEnrollmentCommandBusyError,
  type FlowActivationTargetVersion,
  type FlowEnrollmentAuthoritySnapshot,
  type FlowEnrollmentCommand,
  type FlowEnrollmentCommandOutcome,
  type FlowEnrollmentCommandResult,
  type FlowEnrollmentControlStore
} from "@elevenhouse/domain";
import { and, eq, sql } from "drizzle-orm";
import type { ZodType } from "@elevenhouse/validation";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowActivationEpochs,
  flowAutomationQuotaAuthorities,
  flowEnrollmentCommandOutcomes,
  flowEnrollmentCommands,
  flowEnrollmentControls,
  flows,
  flowVersions
} from "../../schema/flows";
import {
  readFlowActivationReadiness,
  type FlowActivationReadinessEvidence,
  type FlowActivationVersionRow
} from "./drizzle-flow-activation-readiness";
import {
  resolveFlowEnrollmentSubjects,
  type FlowEnrollmentTransaction
} from "./drizzle-flow-enrollment-subjects";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

type ActivateInput = Parameters<FlowEnrollmentControlStore["executeActivate"]>[0];
type PauseInput = Parameters<FlowEnrollmentControlStore["executePause"]>[0];
const enrollmentLockTimeout = "1000ms";
const enrollmentStatementTimeout = "5000ms";

export function createDrizzleFlowEnrollmentControlStore(
  database: ElevenHouseDatabase
): FlowEnrollmentControlStore {
  return Object.freeze({
    executeActivate: (input) => executeActivate(database, input),
    executePause: (input) => executePause(database, input)
  });
}

async function executeActivate(
  database: ElevenHouseDatabase,
  input: ActivateInput
): Promise<FlowEnrollmentCommandResult<ActivateFlowVersionResponse>> {
  try {
    return await database.transaction(async (transaction) => {
      await configureEnrollmentTransaction(transaction);
      const authority = await resolveCommandAuthority(transaction, input.commandRequest);
      const command = input.createCommand(authority);
      const commandId = await insertCommand(transaction, command, input.commandRequest);
      if (!commandId) {
        return replayCommand(
          transaction,
          command,
          input.commandRequest,
          activateFlowVersionResponseSchema
        );
      }

      const quota = await lockAutomationQuotaAuthority(transaction, authority.ownerSubjectId);
      const locked = await lockEnrollmentAuthority(transaction, {
        flowId: input.commandRequest.resourceId,
        ownerUserId: input.commandRequest.ownerUserId,
        ownerSubjectId: authority.ownerSubjectId
      });
      if (!locked) {
        return persistCreatedOutcome<ActivateFlowVersionResponse>(
          transaction,
          commandId,
          rejection("FLOW_DEFINITION_NOT_FOUND")
        );
      }
      const target = await readTargetVersion(transaction, {
        versionId: input.request.versionId,
        flowId: locked.current.flowId,
        ownerUserId: locked.current.ownerUserId
      });
      if (!target) {
        return persistCreatedOutcome<ActivateFlowVersionResponse>(
          transaction,
          commandId,
          rejection("FLOW_ACTIVATION_VERSION_NOT_FOUND")
        );
      }
      const readiness = await readFlowActivationReadiness(transaction, {
        current: locked.current,
        target,
        ownerSubjectId: authority.ownerSubjectId,
        activeAutomationAllocations: quota.activeAllocations
      });
      const preparation = input.prepare({
        current: locked.current,
        target: activationTarget(target, readiness),
        readiness: readiness.readiness
      });
      if (preparation.kind === "rejected") {
        return persistCreatedOutcome<ActivateFlowVersionResponse>(transaction, commandId, {
          kind: "rejected",
          response: preparation.response
        });
      }
      if (!readiness.manifestDigest) throw new FlowEnrollmentAuthorityIntegrityError();

      const transitionAt = parseReadinessInstant(readiness.readiness.checkedAt);
      if (preparation.value.closeActivationEpochId) {
        await closeEpoch(transaction, {
          epochId: preparation.value.closeActivationEpochId,
          flowId: locked.current.flowId,
          commandId,
          actorSubjectId: authority.actorSubjectId,
          reason: "version_switch",
          effectiveTo: transitionAt
        });
      }
      const sequence = await nextEpochSequence(transaction, locked.current.flowId);
      const [epoch] = await transaction
        .insert(flowActivationEpochs)
        .values({
          flowId: locked.current.flowId,
          ownerSubjectId: authority.ownerSubjectId,
          flowVersionId: preparation.value.targetVersionId,
          sequence,
          effectiveFrom: transitionAt,
          effectiveTo: null,
          manifestDigest: readiness.manifestDigest,
          rolloutPolicyRevision: preparation.value.rolloutPolicyRevision,
          activatedByActorSubjectId: authority.actorSubjectId,
          activateCommandId: commandId,
          closeReason: null,
          closedByActorSubjectId: null,
          closeCommandId: null,
          createdAt: transitionAt
        })
        .returning();
      if (!epoch) throw new FlowEnrollmentAuthorityIntegrityError();

      const [control] = await transaction
        .update(flowEnrollmentControls)
        .set({
          state: "active",
          enrollmentRevision: preparation.value.nextEnrollmentRevision,
          activeVersionId: epoch.flowVersionId,
          activeActivationEpochId: epoch.id,
          activeSince: transitionAt,
          lastCommandId: commandId
        })
        .where(
          and(
            eq(flowEnrollmentControls.flowId, locked.current.flowId),
            eq(flowEnrollmentControls.ownerUserId, locked.current.ownerUserId),
            eq(flowEnrollmentControls.enrollmentRevision, locked.current.enrollmentRevision),
            sql`${flowEnrollmentControls.activeVersionId} is not distinct from ${locked.current.activeVersionId}`,
            sql`${flowEnrollmentControls.activeActivationEpochId} is not distinct from ${locked.current.activeActivationEpochId}`
          )
        )
        .returning();
      if (!control) throw new FlowEnrollmentAuthorityIntegrityError();
      if (locked.current.enrollmentState !== "active") {
        await updateAutomationQuotaAllocation(transaction, quota, 1);
      }

      const body = activateFlowVersionResponseSchema.parse({
        schemaVersion: "flow-activation-result.v1",
        enrollment: mapControl(control, locked.current.definitionRevision),
        activationEpoch: mapEpoch(epoch)
      });
      return persistCreatedOutcome(transaction, commandId, {
        kind: "succeeded",
        response: { statusCode: 200, body }
      });
    });
  } catch (error) {
    throw mapPersistenceError(error);
  }
}

async function executePause(
  database: ElevenHouseDatabase,
  input: PauseInput
): Promise<FlowEnrollmentCommandResult<PauseFlowEnrollmentResponse>> {
  try {
    return await database.transaction(async (transaction) => {
      await configureEnrollmentTransaction(transaction);
      const authority = await resolveCommandAuthority(transaction, input.commandRequest);
      const command = input.createCommand(authority);
      const commandId = await insertCommand(transaction, command, input.commandRequest);
      if (!commandId) {
        return replayCommand(
          transaction,
          command,
          input.commandRequest,
          pauseFlowEnrollmentResponseSchema
        );
      }

      const quota = await lockAutomationQuotaAuthority(transaction, authority.ownerSubjectId);
      const locked = await lockEnrollmentAuthority(transaction, {
        flowId: input.commandRequest.resourceId,
        ownerUserId: input.commandRequest.ownerUserId,
        ownerSubjectId: authority.ownerSubjectId
      });
      if (!locked) {
        return persistCreatedOutcome<PauseFlowEnrollmentResponse>(
          transaction,
          commandId,
          rejection("FLOW_DEFINITION_NOT_FOUND")
        );
      }
      const preparation = input.prepare({ current: locked.current });
      if (preparation.kind === "rejected") {
        return persistCreatedOutcome<PauseFlowEnrollmentResponse>(transaction, commandId, {
          kind: "rejected",
          response: preparation.response
        });
      }

      const transitionAt = await readDatabaseInstant(transaction);
      const closedEpoch = await closeEpoch(transaction, {
        epochId: preparation.value.closeActivationEpochId,
        flowId: locked.current.flowId,
        commandId,
        actorSubjectId: authority.actorSubjectId,
        reason: "pause_enrollment",
        effectiveTo: transitionAt
      });
      const [control] = await transaction
        .update(flowEnrollmentControls)
        .set({
          state: "paused",
          enrollmentRevision: preparation.value.nextEnrollmentRevision,
          activeVersionId: null,
          activeActivationEpochId: null,
          activeSince: null,
          lastPausedAt: transitionAt,
          lastCommandId: commandId
        })
        .where(
          and(
            eq(flowEnrollmentControls.flowId, locked.current.flowId),
            eq(flowEnrollmentControls.ownerUserId, locked.current.ownerUserId),
            eq(flowEnrollmentControls.enrollmentRevision, locked.current.enrollmentRevision),
            eq(flowEnrollmentControls.activeVersionId, input.request.expectedActiveVersionId),
            eq(
              flowEnrollmentControls.activeActivationEpochId,
              input.request.expectedActivationEpochId
            )
          )
        )
        .returning();
      if (!control) throw new FlowEnrollmentAuthorityIntegrityError();
      await updateAutomationQuotaAllocation(transaction, quota, -1);

      const body = pauseFlowEnrollmentResponseSchema.parse({
        schemaVersion: "flow-enrollment-pause-result.v1",
        enrollment: mapControl(control, locked.current.definitionRevision),
        closedEpoch: mapEpoch(closedEpoch)
      });
      return persistCreatedOutcome(transaction, commandId, {
        kind: "succeeded",
        response: { statusCode: 200, body }
      });
    });
  } catch (error) {
    throw mapPersistenceError(error);
  }
}

async function resolveCommandAuthority(
  transaction: FlowEnrollmentTransaction,
  commandRequest: ActivateInput["commandRequest"]
) {
  const authority = await resolveFlowEnrollmentSubjects(transaction, {
    actorUserId: commandRequest.actorUserId,
    ownerUserId: commandRequest.ownerUserId
  });
  if (!authority) throw new FlowEnrollmentAuthorityIntegrityError();
  return authority;
}

async function configureEnrollmentTransaction(
  transaction: FlowEnrollmentTransaction
): Promise<void> {
  await transaction.execute(sql`
    select
      set_config('lock_timeout', ${enrollmentLockTimeout}, true),
      set_config('statement_timeout', ${enrollmentStatementTimeout}, true)
  `);
}

async function insertCommand(
  transaction: FlowEnrollmentTransaction,
  command: FlowEnrollmentCommand,
  commandRequest: ActivateInput["commandRequest"]
): Promise<string | null> {
  const persistedRequest = enrollmentCommandRequestColumns(command, commandRequest);
  const [inserted] = await transaction
    .insert(flowEnrollmentCommands)
    .values({
      apiSurface: command.apiSurface,
      actorSubjectId: command.actorSubjectId,
      ownerSubjectId: command.ownerSubjectId,
      routeTemplate: command.routeTemplate,
      resourceId: command.resourceId,
      commandScope: command.scope,
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      ...persistedRequest,
      replayUntil: sql`transaction_timestamp() + interval '24 hours'`
    })
    .onConflictDoNothing({
      target: [
        flowEnrollmentCommands.commandScope,
        flowEnrollmentCommands.actorSubjectId,
        flowEnrollmentCommands.idempotencyKey
      ]
    })
    .returning({ id: flowEnrollmentCommands.id });
  return inserted?.id ?? null;
}

async function replayCommand<T>(
  transaction: FlowEnrollmentTransaction,
  command: FlowEnrollmentCommand,
  commandRequest: ActivateInput["commandRequest"],
  successSchema: ZodType<T>
): Promise<FlowEnrollmentCommandResult<T>> {
  const persistedRequest = enrollmentCommandRequestColumns(command, commandRequest);
  const [row] = await transaction
    .select({
      apiSurface: flowEnrollmentCommands.apiSurface,
      actorSubjectId: flowEnrollmentCommands.actorSubjectId,
      ownerSubjectId: flowEnrollmentCommands.ownerSubjectId,
      routeTemplate: flowEnrollmentCommands.routeTemplate,
      resourceId: flowEnrollmentCommands.resourceId,
      commandScope: flowEnrollmentCommands.commandScope,
      requestHash: flowEnrollmentCommands.requestHash,
      requestSchemaVersion: flowEnrollmentCommands.requestSchemaVersion,
      targetVersionId: flowEnrollmentCommands.targetVersionId,
      expectedDefinitionRevision: flowEnrollmentCommands.expectedDefinitionRevision,
      expectedEnrollmentRevision: flowEnrollmentCommands.expectedEnrollmentRevision,
      expectedActiveVersionId: flowEnrollmentCommands.expectedActiveVersionId,
      expectedActivationEpochId: flowEnrollmentCommands.expectedActivationEpochId,
      state: flowEnrollmentCommands.state,
      replayActive: sql<boolean>`${flowEnrollmentCommands.replayUntil} > clock_timestamp()`,
      responseStatus: flowEnrollmentCommandOutcomes.responseStatus,
      responseBody: flowEnrollmentCommandOutcomes.responseBody
    })
    .from(flowEnrollmentCommands)
    .leftJoin(
      flowEnrollmentCommandOutcomes,
      eq(flowEnrollmentCommandOutcomes.commandId, flowEnrollmentCommands.id)
    )
    .where(
      and(
        eq(flowEnrollmentCommands.commandScope, command.scope),
        eq(flowEnrollmentCommands.actorSubjectId, command.actorSubjectId),
        eq(flowEnrollmentCommands.idempotencyKey, command.idempotencyKey)
      )
    )
    .limit(1)
    .for("share", { of: flowEnrollmentCommands });
  if (!row) throw new FlowEnrollmentAuthorityIntegrityError();
  if (
    row.apiSurface !== command.apiSurface ||
    row.ownerSubjectId !== command.ownerSubjectId ||
    row.routeTemplate !== command.routeTemplate ||
    row.resourceId !== command.resourceId ||
    row.commandScope !== command.scope ||
    row.requestHash !== command.requestHash ||
    row.requestSchemaVersion !== persistedRequest.requestSchemaVersion ||
    row.targetVersionId !== persistedRequest.targetVersionId ||
    row.expectedDefinitionRevision !== persistedRequest.expectedDefinitionRevision ||
    row.expectedEnrollmentRevision !== persistedRequest.expectedEnrollmentRevision ||
    row.expectedActiveVersionId !== persistedRequest.expectedActiveVersionId ||
    row.expectedActivationEpochId !== persistedRequest.expectedActivationEpochId
  ) {
    return { kind: "replayed", outcome: rejection("FLOW_IDEMPOTENCY_KEY_REUSED") };
  }
  if (!row.replayActive) {
    return { kind: "replayed", outcome: rejection("FLOW_IDEMPOTENCY_KEY_EXPIRED") };
  }
  if (
    (row.state !== "succeeded" && row.state !== "failed") ||
    row.responseStatus === null ||
    row.responseBody === null
  ) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  if (row.responseStatus === 200) {
    if (row.state !== "succeeded") throw new FlowEnrollmentAuthorityIntegrityError();
    return {
      kind: "replayed",
      outcome: {
        kind: "succeeded",
        response: { statusCode: 200, body: successSchema.parse(row.responseBody) }
      }
    };
  }
  if (row.state !== "failed") throw new FlowEnrollmentAuthorityIntegrityError();
  return {
    kind: "replayed",
    outcome: {
      kind: "rejected",
      response: flowEnrollmentCommandRejectionResponseSchema.parse({
        statusCode: row.responseStatus,
        body: row.responseBody
      })
    }
  };
}

async function lockEnrollmentAuthority(
  transaction: FlowEnrollmentTransaction,
  input: {
    readonly flowId: string;
    readonly ownerUserId: string;
    readonly ownerSubjectId: string;
  }
): Promise<{
  readonly current: FlowEnrollmentAuthoritySnapshot;
  readonly control: typeof flowEnrollmentControls.$inferSelect;
} | null> {
  const [flow] = await transaction
    .select({
      id: flows.id,
      ownerUserId: flows.ownerUserId,
      definitionState: flows.definitionState,
      revision: flows.revision
    })
    .from(flows)
    .where(and(eq(flows.id, input.flowId), eq(flows.ownerUserId, input.ownerUserId)))
    .limit(1)
    .for("update", { of: flows });
  if (!flow) return null;

  await transaction
    .insert(flowEnrollmentControls)
    .values({
      flowId: flow.id,
      ownerUserId: flow.ownerUserId,
      ownerSubjectId: input.ownerSubjectId
    })
    .onConflictDoNothing({ target: flowEnrollmentControls.flowId });
  const [control] = await transaction
    .select()
    .from(flowEnrollmentControls)
    .where(
      and(
        eq(flowEnrollmentControls.flowId, flow.id),
        eq(flowEnrollmentControls.ownerUserId, flow.ownerUserId),
        eq(flowEnrollmentControls.ownerSubjectId, input.ownerSubjectId)
      )
    )
    .limit(1)
    .for("update", { of: flowEnrollmentControls });
  if (!control) throw new FlowEnrollmentAuthorityIntegrityError();
  return {
    control,
    current: {
      flowId: flow.id,
      ownerUserId: flow.ownerUserId,
      definitionState: flow.definitionState as FlowEnrollmentAuthoritySnapshot["definitionState"],
      definitionRevision: flow.revision,
      enrollmentState: control.state as FlowEnrollmentAuthoritySnapshot["enrollmentState"],
      enrollmentRevision: control.enrollmentRevision,
      activeVersionId: control.activeVersionId,
      activeActivationEpochId: control.activeActivationEpochId
    }
  };
}

async function lockAutomationQuotaAuthority(
  transaction: FlowEnrollmentTransaction,
  ownerSubjectId: string
): Promise<typeof flowAutomationQuotaAuthorities.$inferSelect> {
  await transaction
    .insert(flowAutomationQuotaAuthorities)
    .values({ ownerSubjectId })
    .onConflictDoNothing({ target: flowAutomationQuotaAuthorities.ownerSubjectId });
  const [quota] = await transaction
    .select()
    .from(flowAutomationQuotaAuthorities)
    .where(eq(flowAutomationQuotaAuthorities.ownerSubjectId, ownerSubjectId))
    .limit(1)
    .for("update", { of: flowAutomationQuotaAuthorities });
  if (!quota) throw new FlowEnrollmentAuthorityIntegrityError();
  return quota;
}

async function updateAutomationQuotaAllocation(
  transaction: FlowEnrollmentTransaction,
  current: typeof flowAutomationQuotaAuthorities.$inferSelect,
  delta: -1 | 1
): Promise<void> {
  const activeAllocations = current.activeAllocations + delta;
  const revision = current.revision + 1;
  if (
    !Number.isSafeInteger(activeAllocations) ||
    activeAllocations < 0 ||
    !Number.isSafeInteger(revision)
  ) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  const [updated] = await transaction
    .update(flowAutomationQuotaAuthorities)
    .set({ activeAllocations, revision })
    .where(
      and(
        eq(flowAutomationQuotaAuthorities.ownerSubjectId, current.ownerSubjectId),
        eq(flowAutomationQuotaAuthorities.activeAllocations, current.activeAllocations),
        eq(flowAutomationQuotaAuthorities.revision, current.revision)
      )
    )
    .returning({ ownerSubjectId: flowAutomationQuotaAuthorities.ownerSubjectId });
  if (!updated) throw new FlowEnrollmentAuthorityIntegrityError();
}

function enrollmentCommandRequestColumns(
  command: FlowEnrollmentCommand,
  commandRequest: ActivateInput["commandRequest"]
): {
  readonly requestSchemaVersion: string;
  readonly targetVersionId: string | null;
  readonly expectedDefinitionRevision: number | null;
  readonly expectedEnrollmentRevision: number;
  readonly expectedActiveVersionId: string | null;
  readonly expectedActivationEpochId: string | null;
} {
  if (
    command.scope === "flows.enrollment.activate.v1" &&
    command.routeTemplate === "/flows/:flowId/activate" &&
    commandRequest.scope === command.scope &&
    commandRequest.routeTemplate === command.routeTemplate &&
    commandRequest.request.schemaVersion === "flow-activation-command.v1"
  ) {
    return {
      requestSchemaVersion: commandRequest.request.schemaVersion,
      targetVersionId: commandRequest.request.versionId,
      expectedDefinitionRevision: commandRequest.request.expectedRevision,
      expectedEnrollmentRevision: commandRequest.request.expectedEnrollmentRevision,
      expectedActiveVersionId: commandRequest.request.expectedActiveVersionId,
      expectedActivationEpochId: null
    };
  }
  if (
    command.scope === "flows.enrollment.pause.v1" &&
    command.routeTemplate === "/flows/:flowId/pause-enrollment" &&
    commandRequest.scope === command.scope &&
    commandRequest.routeTemplate === command.routeTemplate &&
    commandRequest.request.schemaVersion === "flow-enrollment-pause-command.v1"
  ) {
    return {
      requestSchemaVersion: commandRequest.request.schemaVersion,
      targetVersionId: null,
      expectedDefinitionRevision: null,
      expectedEnrollmentRevision: commandRequest.request.expectedEnrollmentRevision,
      expectedActiveVersionId: commandRequest.request.expectedActiveVersionId,
      expectedActivationEpochId: commandRequest.request.expectedActivationEpochId
    };
  }
  throw new FlowEnrollmentAuthorityIntegrityError();
}

async function readTargetVersion(
  transaction: FlowEnrollmentTransaction,
  input: { readonly versionId: string; readonly flowId: string; readonly ownerUserId: string }
): Promise<FlowActivationVersionRow | null> {
  const [target] = await transaction
    .select({
      id: flowVersions.id,
      flowId: flowVersions.flowId,
      ownerUserId: flowVersions.ownerUserId,
      graphSchemaVersion: flowVersions.graphSchemaVersion,
      graph: flowVersions.graph,
      capabilityManifest: flowVersions.capabilityManifest
    })
    .from(flowVersions)
    .where(
      and(
        eq(flowVersions.id, input.versionId),
        eq(flowVersions.flowId, input.flowId),
        eq(flowVersions.ownerUserId, input.ownerUserId)
      )
    )
    .limit(1)
    .for("share", { of: flowVersions });
  return target ?? null;
}

function activationTarget(
  target: FlowActivationVersionRow,
  readiness: FlowActivationReadinessEvidence
): FlowActivationTargetVersion {
  return {
    id: target.id,
    flowId: target.flowId,
    ownerUserId: target.ownerUserId,
    graphSchemaVersion: readiness.graphSchemaVersion,
    manifestSchemaVersion: readiness.manifestSchemaVersion
  };
}

async function closeEpoch(
  transaction: FlowEnrollmentTransaction,
  input: {
    readonly epochId: string;
    readonly flowId: string;
    readonly commandId: string;
    readonly actorSubjectId: string;
    readonly reason: "pause_enrollment" | "version_switch";
    readonly effectiveTo: Date;
  }
): Promise<typeof flowActivationEpochs.$inferSelect> {
  const [epoch] = await transaction
    .update(flowActivationEpochs)
    .set({
      effectiveTo: input.effectiveTo,
      closeReason: input.reason,
      closedByActorSubjectId: input.actorSubjectId,
      closeCommandId: input.commandId
    })
    .where(
      and(
        eq(flowActivationEpochs.id, input.epochId),
        eq(flowActivationEpochs.flowId, input.flowId),
        sql`${flowActivationEpochs.effectiveTo} is null`
      )
    )
    .returning();
  if (!epoch) throw new FlowEnrollmentAuthorityIntegrityError();
  return epoch;
}

async function nextEpochSequence(
  transaction: FlowEnrollmentTransaction,
  flowId: string
): Promise<number> {
  const [row] = await transaction
    .select({ value: sql<number>`coalesce(max(${flowActivationEpochs.sequence}), 0)::int + 1` })
    .from(flowActivationEpochs)
    .where(eq(flowActivationEpochs.flowId, flowId));
  if (!row || !Number.isSafeInteger(row.value) || row.value < 1) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  return row.value;
}

async function persistCreatedOutcome<T>(
  transaction: FlowEnrollmentTransaction,
  commandId: string,
  outcome: FlowEnrollmentCommandOutcome<T>
): Promise<FlowEnrollmentCommandResult<T>> {
  const response = outcome.response;
  const [completed] = await transaction
    .update(flowEnrollmentCommands)
    .set({ state: outcome.kind === "succeeded" ? "succeeded" : "failed" })
    .where(
      and(eq(flowEnrollmentCommands.id, commandId), eq(flowEnrollmentCommands.state, "processing"))
    )
    .returning({ id: flowEnrollmentCommands.id });
  if (!completed) throw new FlowEnrollmentAuthorityIntegrityError();
  await transaction.insert(flowEnrollmentCommandOutcomes).values({
    commandId,
    responseStatus: response.statusCode,
    responseBody: response.body as unknown as Record<string, unknown>,
    createdAt: sql`(select completed_at from flow_enrollment_commands where id = ${commandId})`
  });
  return { kind: "created", outcome };
}

function rejection(
  code: FlowEnrollmentCommandRejectionResponse["body"]["code"]
): Extract<FlowEnrollmentCommandOutcome<never>, { kind: "rejected" }> {
  return {
    kind: "rejected",
    response: flowEnrollmentCommandRejectionResponseSchema.parse({
      statusCode:
        code === "FLOW_DEFINITION_NOT_FOUND" || code === "FLOW_ACTIVATION_VERSION_NOT_FOUND"
          ? 404
          : code === "FLOW_IDEMPOTENCY_KEY_INVALID"
            ? 400
            : 409,
      body: { code }
    })
  };
}

function mapControl(row: typeof flowEnrollmentControls.$inferSelect, definitionRevision: number) {
  return {
    schemaVersion: "flow-enrollment-control.v1" as const,
    flowId: row.flowId,
    state: row.state,
    definitionRevision,
    enrollmentRevision: row.enrollmentRevision,
    activeVersionId: row.activeVersionId,
    activeActivationEpochId: row.activeActivationEpochId,
    activeSince: row.activeSince ? toIsoInstant(row.activeSince) : null,
    lastPausedAt: row.lastPausedAt ? toIsoInstant(row.lastPausedAt) : null
  };
}

function mapEpoch(row: typeof flowActivationEpochs.$inferSelect): FlowActivationEpoch {
  return {
    schemaVersion: "flow-activation-epoch.v1",
    id: row.id,
    flowId: row.flowId,
    flowVersionId: row.flowVersionId,
    sequence: row.sequence,
    effectiveFrom: toIsoInstant(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? toIsoInstant(row.effectiveTo) : null,
    manifestDigest: row.manifestDigest as `sha256:${string}`,
    rolloutPolicyRevision: row.rolloutPolicyRevision,
    activatedByActorSubjectId: row.activatedByActorSubjectId,
    activateCommandId: row.activateCommandId,
    closeReason: row.closeReason as FlowActivationEpoch["closeReason"],
    closedByActorSubjectId: row.closedByActorSubjectId,
    closeCommandId: row.closeCommandId
  };
}

async function readDatabaseInstant(transaction: FlowEnrollmentTransaction): Promise<Date> {
  const result = await transaction.execute(
    sql<{ value: string }>`select (extract(epoch from clock_timestamp()) * 1000)::text as value`
  );
  const row = result.rows[0];
  const instant = row ? parseFlowDatabaseEpochMilliseconds(row.value) : null;
  if (!instant) throw new FlowEnrollmentAuthorityIntegrityError();
  return instant;
}

function parseReadinessInstant(value: string): Date {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new FlowEnrollmentAuthorityIntegrityError();
  return instant;
}

function toIsoInstant(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  return value.toISOString();
}

function mapPersistenceError(error: unknown): Error {
  if (
    error instanceof FlowEnrollmentAuthorityIntegrityError ||
    error instanceof FlowEnrollmentCommandBusyError
  ) {
    return error;
  }
  const postgres = findPostgresError(error);
  if (postgres && (postgres.code === "55P03" || postgres.code === "57014")) {
    return new FlowEnrollmentCommandBusyError({ cause: error });
  }
  if (postgres && ["23503", "23505", "23514", "55000"].includes(postgres.code)) {
    return new FlowEnrollmentAuthorityIntegrityError({ cause: error });
  }
  return error instanceof Error ? error : new FlowEnrollmentAuthorityIntegrityError();
}

function findPostgresError(
  error: unknown
): { readonly code: string; readonly message: string } | null {
  let candidate: unknown = error;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === "object"; depth += 1) {
    const record = candidate as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof record.code === "string" && typeof record.message === "string") {
      return { code: record.code, message: record.message };
    }
    candidate = record.cause;
  }
  return null;
}
