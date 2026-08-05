import { and, desc, eq, sql } from "drizzle-orm";

import {
  flowDefinitionCommandRejectionResponseSchema,
  flowDefinitionOriginV1Schema,
  flowDefinitionV2Schema,
  flowCapabilityManifestV2Schema,
  flowGraphV2Schema,
  flowPublishedVersionV3Schema,
  publishFlowDefinitionV3ResponseSchema,
  type FlowApprovalMode,
  type FlowDefinitionCommandRejectionResponse,
  type FlowDefinitionState,
  type FlowDefinitionV2,
  type FlowPresentationV1
} from "@elevenhouse/contracts";
import {
  FlowDefinitionIdempotencyConflictError,
  FlowDefinitionIdempotencyExpiredError,
  FlowDefinitionIntegrityError,
  parseFlowDefinitionPublishedVersionRecord,
  type FlowDefinitionCommand,
  type FlowDefinitionCommandOutcome,
  type FlowDefinitionCommandResult,
  type FlowDefinitionControlRecord,
  type FlowDefinitionControlStore,
  type FlowDefinitionPublishedVersionRecord
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowDefinitionCommandOutcomes,
  flowDefinitionCommands,
  flowVersions,
  flows
} from "../../schema/flows";
import { insertReturningOne } from "../../shared";
import { provisionFlowEnrollmentReadAuthority } from "./drizzle-flow-enrollment-authority-provisioning";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type FlowRow = typeof flows.$inferSelect;
type FlowVersionRow = typeof flowVersions.$inferSelect;

type LockedFlow = {
  readonly row: FlowRow;
  readonly latestVersion: FlowVersionRow | null;
};

type CommandAttempt<T> =
  | { readonly kind: "created"; readonly result: FlowDefinitionCommandResult<T> }
  | { readonly kind: "replay" };

const transactionTimestamp = sql`transaction_timestamp()`;
const replayUntil = sql`transaction_timestamp() + interval '24 hours'`;

export function createDrizzleFlowDefinitionControlStore(
  database: ElevenHouseDatabase
): FlowDefinitionControlStore {
  return {
    executeCreate: (input) =>
      executePersistedCommand(database, input.command, async (transaction) => {
        const prepared = input.prepare();
        if (prepared.kind === "rejected") return rejectedOutcome(prepared.response);

        const timestamp = new Date(input.command.now);
        const row = await insertReturningOne(
          () =>
            transaction
              .insert(flows)
              .values({
                ownerUserId: input.command.ownerUserId,
                name: prepared.value.name,
                origin: prepared.value.origin,
                status: "draft",
                definitionState: "draft",
                approvalMode: prepared.value.approvalMode,
                revision: 1,
                draftBaseVersionId: null,
                draftGraph: prepared.value.graph,
                draftPresentation: prepared.value.presentation,
                publishedVersionId: null,
                publishedAt: null,
                createdAt: timestamp,
                updatedAt: timestamp
              })
              .returning(),
          "flows"
        );
        await provisionFlowEnrollmentReadAuthority(transaction, input.command.ownerUserId);
        const definition = parseV2Definition({ row, latestVersion: null });
        return succeededOutcome(definition, 201);
      }),

    executeDraftUpdate: (input) =>
      executePersistedCommand(database, input.command, async (transaction) => {
        const locked = await lockOwnedFlow(transaction, input.command);
        if (!locked) return notFoundOutcome();
        const current = toControlRecord(locked);
        const prepared = input.prepare(current);
        if (prepared.kind === "rejected") return rejectedOutcome(prepared.response);
        const timestamp = new Date(input.command.now);
        const [updated] = await transaction
          .update(flows)
          .set({
            name: prepared.value.name,
            definitionState: prepared.value.state,
            approvalMode: prepared.value.approvalMode,
            revision: prepared.value.revision,
            draftBaseVersionId: prepared.value.draftBaseVersionId,
            draftGraph: prepared.value.draftGraph,
            draftPresentation: prepared.value.draftPresentation,
            updatedAt: timestamp
          })
          .where(flowRevisionPredicate(input.command, current))
          .returning();
        if (!updated) throw new FlowDefinitionIntegrityError();
        return succeededOutcome(
          parseV2Definition({ row: updated, latestVersion: locked.latestVersion }),
          200
        );
      }),

    executePublish: (input) =>
      executePersistedCommand(database, input.command, async (transaction) => {
        const locked = await lockOwnedFlow(transaction, input.command);
        if (!locked) return notFoundOutcome();
        const current = toControlRecord(locked);
        const prepared = input.prepare(current);
        if (prepared.kind === "rejected") return rejectedOutcome(prepared.response);
        const capabilityManifest = flowCapabilityManifestV2Schema.parse(
          prepared.value.capabilityManifest
        );
        const versionNumber = (locked.latestVersion?.version ?? 0) + 1;
        const publishedAt = new Date(input.command.now);
        const versionRow = await insertReturningOne(
          () =>
            transaction
              .insert(flowVersions)
              .values({
                flowId: current.id,
                ownerUserId: current.ownerUserId,
                version: versionNumber,
                sourceRevision: prepared.value.sourceRevision,
                approvalMode: prepared.value.approvalMode,
                graphSchemaVersion: "flow-graph.v2",
                graph: prepared.value.graph,
                presentation: prepared.value.presentation,
                capabilityManifest,
                publishedAt
              })
              .returning(),
          "flow_versions"
        );
        const [updated] = await transaction
          .update(flows)
          .set({
            status: "published",
            definitionState: "versioned",
            approvalMode: prepared.value.approvalMode,
            revision: current.revision + 1,
            draftBaseVersionId: null,
            draftGraph: prepared.value.graph,
            draftPresentation: prepared.value.presentation,
            publishedVersionId: versionRow.id,
            publishedAt,
            updatedAt: publishedAt
          })
          .where(flowRevisionPredicate(input.command, current))
          .returning();
        if (!updated) throw new FlowDefinitionIntegrityError();

        const versionInput = {
          id: versionRow.id,
          flowId: versionRow.flowId,
          version: versionRow.version,
          sourceRevision: versionRow.sourceRevision,
          status: "published",
          approvalMode: versionRow.approvalMode,
          graph: versionRow.graph,
          presentation: versionRow.presentation,
          publishedAt: versionRow.publishedAt.toISOString()
        };
        const version = flowPublishedVersionV3Schema.parse({
          schemaVersion: "flow-published-version.v3",
          ...versionInput,
          capabilityManifest: versionRow.capabilityManifest
        });
        const flow = parseV2Definition({ row: updated, latestVersion: versionRow });
        const response = publishFlowDefinitionV3ResponseSchema.parse({ flow, version });
        input.assertCreatedResponse(response);
        return succeededOutcome(response, 200);
      }),

    executeCreateNextDraft: (input) =>
      executePersistedCommand(database, input.command, async (transaction) => {
        const locked = await lockOwnedFlow(transaction, input.command);
        if (!locked) return notFoundOutcome();
        const current = toControlRecord(locked);
        const prepared = input.prepare(
          current,
          locked.latestVersion ? toPublishedVersionRecord(locked.latestVersion) : null
        );
        if (prepared.kind === "rejected") return rejectedOutcome(prepared.response);

        const timestamp = new Date(input.command.now);
        const [updated] = await transaction
          .update(flows)
          .set({
            status: "draft",
            definitionState: "draft",
            approvalMode: prepared.value.approvalMode,
            revision: prepared.value.revision,
            draftBaseVersionId: prepared.value.draftBaseVersionId,
            draftGraph: prepared.value.draftGraph,
            draftPresentation: prepared.value.draftPresentation,
            updatedAt: timestamp
          })
          .where(flowRevisionPredicate(input.command, current))
          .returning();
        if (!updated) throw new FlowDefinitionIntegrityError();
        return succeededOutcome(
          parseV2Definition({ row: updated, latestVersion: locked.latestVersion }),
          200
        );
      }),
  };
}

async function executePersistedCommand<T>(
  database: ElevenHouseDatabase,
  command: FlowDefinitionCommand,
  execute: (
    transaction: FlowTransaction,
    commandId: string
  ) => Promise<FlowDefinitionCommandOutcome<T>>
): Promise<FlowDefinitionCommandResult<T>> {
  const attempt = await database.transaction<CommandAttempt<T>>(async (transaction) => {
    const [inserted] = await transaction
      .insert(flowDefinitionCommands)
      .values({
        apiSurface: command.apiSurface,
        actorUserId: command.actorUserId,
        ownerUserId: command.ownerUserId,
        routeTemplate: command.routeTemplate,
        resourceId: command.resourceId,
        commandScope: command.scope,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        replayUntil,
        createdAt: transactionTimestamp,
        updatedAt: transactionTimestamp
      })
      .onConflictDoNothing({
        target: [
          flowDefinitionCommands.apiSurface,
          flowDefinitionCommands.actorUserId,
          flowDefinitionCommands.ownerUserId,
          flowDefinitionCommands.routeTemplate,
          flowDefinitionCommands.resourceId,
          flowDefinitionCommands.idempotencyKey
        ]
      })
      .returning({ id: flowDefinitionCommands.id });
    if (!inserted) return { kind: "replay" };

    const outcome = await execute(transaction, inserted.id);
    const response = outcome.response;
    await transaction.insert(flowDefinitionCommandOutcomes).values({
      commandId: inserted.id,
      responseStatus: response.statusCode,
      responseBody: response.body as unknown as Record<string, unknown>,
      createdAt: transactionTimestamp
    });
    const [completed] = await transaction
      .update(flowDefinitionCommands)
      .set({
        state: outcome.kind === "succeeded" ? "succeeded" : "failed",
        completedAt: transactionTimestamp,
        updatedAt: transactionTimestamp
      })
      .where(
        and(
          eq(flowDefinitionCommands.id, inserted.id),
          eq(flowDefinitionCommands.state, "processing")
        )
      )
      .returning({ id: flowDefinitionCommands.id });
    if (!completed) throw new FlowDefinitionIntegrityError();
    return { kind: "created", result: { kind: "created", outcome } };
  });

  return attempt.kind === "created" ? attempt.result : replayPersistedCommand<T>(database, command);
}

async function replayPersistedCommand<T>(
  database: ElevenHouseDatabase,
  command: FlowDefinitionCommand
): Promise<FlowDefinitionCommandResult<T>> {
  const [row] = await database
    .select({
      commandScope: flowDefinitionCommands.commandScope,
      requestHash: flowDefinitionCommands.requestHash,
      state: flowDefinitionCommands.state,
      replayExpired: sql<boolean>`${flowDefinitionCommands.replayUntil} <= transaction_timestamp()`,
      responseStatus: flowDefinitionCommandOutcomes.responseStatus,
      responseBody: flowDefinitionCommandOutcomes.responseBody
    })
    .from(flowDefinitionCommands)
    .leftJoin(
      flowDefinitionCommandOutcomes,
      eq(flowDefinitionCommandOutcomes.commandId, flowDefinitionCommands.id)
    )
    .where(commandIdentityPredicate(command))
    .limit(1);
  if (!row) throw new FlowDefinitionIntegrityError();
  if (row.commandScope !== command.scope || row.requestHash !== command.requestHash) {
    throw new FlowDefinitionIdempotencyConflictError();
  }
  if (row.replayExpired) throw new FlowDefinitionIdempotencyExpiredError();
  if (!row.responseBody || row.responseStatus === null) {
    throw new FlowDefinitionIntegrityError();
  }
  if (row.state === "succeeded" && (row.responseStatus === 200 || row.responseStatus === 201)) {
    return {
      kind: "replayed",
      outcome: {
        kind: "succeeded",
        response: { statusCode: row.responseStatus, body: row.responseBody as T }
      }
    };
  }
  if (row.state === "failed") {
    const response = flowDefinitionCommandRejectionResponseSchema.safeParse({
      statusCode: row.responseStatus,
      body: row.responseBody
    });
    if (response.success) {
      return {
        kind: "replayed",
        outcome: { kind: "rejected", response: response.data }
      };
    }
  }
  throw new FlowDefinitionIntegrityError();
}

async function lockOwnedFlow(
  transaction: FlowTransaction,
  command: FlowDefinitionCommand
): Promise<LockedFlow | null> {
  const [row] = await transaction
    .select()
    .from(flows)
    .where(and(eq(flows.ownerUserId, command.ownerUserId), eq(flows.id, command.resourceId)))
    .limit(1)
    .for("update");
  if (!row) return null;

  const [latestVersion] = await transaction
    .select()
    .from(flowVersions)
    .where(
      and(
        eq(flowVersions.ownerUserId, command.ownerUserId),
        eq(flowVersions.flowId, command.resourceId)
      )
    )
    .orderBy(desc(flowVersions.version))
    .limit(1);
  assertPublicationPointer(row, latestVersion ?? null);
  return { row, latestVersion: latestVersion ?? null };
}

function assertPublicationPointer(row: FlowRow, latestVersion: FlowVersionRow | null): void {
  if (!latestVersion) {
    if (row.publishedVersionId !== null || row.publishedAt !== null) {
      throw new FlowDefinitionIntegrityError();
    }
    return;
  }
  if (
    row.publishedVersionId !== latestVersion.id ||
    row.publishedAt === null ||
    row.publishedAt.getTime() !== latestVersion.publishedAt.getTime()
  ) {
    throw new FlowDefinitionIntegrityError();
  }
}

function flowRevisionPredicate(
  command: FlowDefinitionCommand,
  current: FlowDefinitionControlRecord
) {
  return and(
    eq(flows.ownerUserId, command.ownerUserId),
    eq(flows.id, command.resourceId),
    eq(flows.revision, current.revision),
    eq(flows.definitionState, current.state)
  );
}

function commandIdentityPredicate(command: FlowDefinitionCommand) {
  return and(
    eq(flowDefinitionCommands.apiSurface, command.apiSurface),
    eq(flowDefinitionCommands.actorUserId, command.actorUserId),
    eq(flowDefinitionCommands.ownerUserId, command.ownerUserId),
    eq(flowDefinitionCommands.routeTemplate, command.routeTemplate),
    eq(flowDefinitionCommands.resourceId, command.resourceId),
    eq(flowDefinitionCommands.idempotencyKey, command.idempotencyKey)
  );
}

function toControlRecord(locked: LockedFlow): FlowDefinitionControlRecord {
  const { row, latestVersion } = locked;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    origin: flowDefinitionOriginV1Schema.parse(row.origin),
    state: row.definitionState as FlowDefinitionState,
    approvalMode: row.approvalMode as FlowApprovalMode,
    revision: row.revision,
    draftBaseVersionId: row.draftBaseVersionId,
    draftGraph: flowGraphV2Schema.parse(row.draftGraph),
    draftPresentation: row.draftPresentation as FlowPresentationV1 | null,
    latestPublishedVersionId: row.publishedVersionId,
    latestPublishedVersion: latestVersion?.version ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null
  };
}

function parseV2Definition(locked: LockedFlow): FlowDefinitionV2 {
  return flowDefinitionV2Schema.parse({
    schemaVersion: "flow-definition.v2",
    ...toControlRecord(locked)
  });
}

function toPublishedVersionRecord(row: FlowVersionRow): FlowDefinitionPublishedVersionRecord {
  return parseFlowDefinitionPublishedVersionRecord({
    id: row.id,
    flowId: row.flowId,
    version: row.version,
    sourceRevision: row.sourceRevision,
    approvalMode: row.approvalMode,
    graph: row.graph,
    presentation: row.presentation,
    capabilityManifest: row.capabilityManifest,
    publishedAt: row.publishedAt.toISOString()
  });
}

function succeededOutcome<T>(body: T, statusCode: 200 | 201): FlowDefinitionCommandOutcome<T> {
  return { kind: "succeeded", response: { statusCode, body } };
}

function rejectedOutcome<T>(
  response: FlowDefinitionCommandRejectionResponse
): FlowDefinitionCommandOutcome<T> {
  return { kind: "rejected", response };
}

function notFoundOutcome<T>(): FlowDefinitionCommandOutcome<T> {
  return rejectedOutcome({
    statusCode: 404,
    body: { code: "FLOW_DEFINITION_NOT_FOUND" }
  });
}
