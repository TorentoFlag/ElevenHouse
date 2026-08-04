import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type {
  CalculationArtifact,
  CalculationClientLink,
  CalculationInterpretation,
  CalculationMode,
  CalculationModule,
  CalculationParticipant,
  CalculationRecord,
  CalculationStatus,
  CalculationStore,
  CalculationStoreCreateInput,
  CalculationStoreReplaceResultInput,
  CalculationStoreReplaceResultOutcome,
  CalculationStoreSaveInterpretationOutcome
} from "@elevenhouse/domain";
import {
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
  CalculationInterpretationModeUnavailableError
} from "@elevenhouse/domain";
import type { ChartInterpretationMode } from "@elevenhouse/contracts";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  auditLogEntries,
  calculationArtifacts,
  calculationClientLinks,
  calculationInterpretations,
  calculationParticipants,
  calculationPdfJobs,
  calculationRecords,
  outboxEvents
} from "../../schema";
import { insertReturningOne } from "../../shared";
import {
  isCalculationExactKeyUniqueViolation,
  lockCalculationExactKey
} from "./calculation-exact-key";

type CalculationRecordRow = typeof calculationRecords.$inferSelect;
type CalculationRecordInsertRow = typeof calculationRecords.$inferInsert;
type CalculationParticipantRow = typeof calculationParticipants.$inferSelect;
type CalculationClientLinkRow = typeof calculationClientLinks.$inferSelect;
type CalculationInterpretationRow = typeof calculationInterpretations.$inferSelect;
type CalculationArtifactRow = typeof calculationArtifacts.$inferSelect;
type CalculationTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type CalculationDatabase = ElevenHouseDatabase | CalculationTransaction;

export function createDrizzleCalculationStore(database: ElevenHouseDatabase): CalculationStore {
  return {
    listByOwner: async (query) => {
      const filters = [eq(calculationRecords.ownerUserId, query.ownerUserId)];
      if (query.module !== "all") filters.push(eq(calculationRecords.module, query.module));
      if (query.status !== "all") filters.push(eq(calculationRecords.status, query.status));
      const where = and(...filters);
      const [totalRow] = await database
        .select({ value: count() })
        .from(calculationRecords)
        .where(where);
      const rows = await database
        .select()
        .from(calculationRecords)
        .where(where)
        .orderBy(desc(calculationRecords.updatedAt), desc(calculationRecords.id))
        .limit(query.limit)
        .offset(query.offset);
      return {
        calculations: await hydrateCalculations(database, rows),
        total: Number(totalRow?.value ?? 0)
      };
    },
    findByOwnerAndId: async (input) => {
      const row = await findOwnedCalculationRow(database, input.ownerUserId, input.calculationId);
      return row ? ((await hydrateCalculations(database, [row]))[0] ?? null) : null;
    },
    findExact: async (input) => findExactCalculation(database, input),
    create: async (input) => {
      try {
        return await database.transaction((transaction) => insertCalculation(transaction, input));
      } catch (error) {
        if (!isCalculationExactKeyUniqueViolation(error)) throw error;
        const existing = await findExactCalculation(database, input);
        if (!existing) throw error;
        if (input.linkClientIds.length === 0) return existing;
        return (
          (await database.transaction(async (transaction) => {
            const row = await lockOwnedMutableCalculationRow(
              transaction,
              existing.ownerUserId,
              existing.id
            );
            if (!row) return null;
            await insertMissingClientLinks(
              transaction,
              existing.id,
              input.linkClientIds,
              input.now
            );
            const updated = await syncStatusFromLinks(transaction, row, input.now);
            return hydrateOne(transaction, updated);
          })) ?? existing
        );
      }
    },
    replaceResult: async (input) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await database.transaction((transaction) => replaceResult(transaction, input));
        } catch (error) {
          if (error instanceof CalculationIdentityChangedWhileLockingError && attempt < 2) continue;
          if (isCalculationExactKeyUniqueViolation(error)) return { status: "exact_key_conflict" };
          throw error;
        }
      }
      throw new CalculationIdentityChangedWhileLockingError();
    },
    ensureClientLinks: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;
        await insertMissingClientLinks(
          transaction,
          input.calculationId,
          input.clientIds,
          input.now
        );
        const updated = await syncStatusFromLinks(transaction, row, input.now);
        return hydrateOne(transaction, updated);
      }),
    linkClient: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;
        await insertMissingClientLinks(
          transaction,
          input.calculationId,
          [input.clientId],
          input.now
        );
        const updated = await syncStatusFromLinks(transaction, row, input.now);
        return hydrateOne(transaction, updated);
      }),
    publishClientLink: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row || row.resultChecksum !== input.expectedResultChecksum) return null;
        if (
          row.module === "chart" &&
          row.methodCode === "natal" &&
          row.interpretationMode !== "adult_natal"
        ) {
          throw new CalculationInterpretationModeUnavailableError();
        }

        const [interpretation] = await transaction
          .select()
          .from(calculationInterpretations)
          .where(
            and(
              eq(calculationInterpretations.calculationId, input.calculationId),
              eq(calculationInterpretations.status, "approved")
            )
          )
          .orderBy(
            desc(calculationInterpretations.approvedAt),
            desc(calculationInterpretations.updatedAt),
            desc(calculationInterpretations.id)
          )
          .limit(1)
          .for("update");
        if (!interpretation) return null;

        const [link] = await transaction
          .select()
          .from(calculationClientLinks)
          .where(
            and(
              eq(calculationClientLinks.calculationId, input.calculationId),
              eq(calculationClientLinks.clientId, input.clientId)
            )
          )
          .limit(1)
          .for("update");
        if (!link) return null;
        if (
          link.visibility === "visible_to_client" &&
          link.publishedInterpretationId === interpretation.id &&
          link.publishedResultChecksum === row.resultChecksum
        ) {
          return hydrateOne(transaction, row);
        }

        const now = new Date(input.now);
        await transaction
          .update(calculationClientLinks)
          .set({
            visibility: "visible_to_client",
            publishedAt: now,
            publishedInterpretationId: interpretation.id,
            publishedResultChecksum: row.resultChecksum,
            updatedAt: now
          })
          .where(eq(calculationClientLinks.id, link.id));
        await insertCalculationAudit(transaction, {
          actorUserId: row.ownerUserId,
          action: "calculation.published",
          calculationId: row.id,
          occurredAt: now,
          metadata: {
            interpretationId: interpretation.id,
            resultChecksum: row.resultChecksum
          }
        });
        const updated = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { status: "published", updatedAt: now }
        });
        return updated ? hydrateOne(transaction, updated) : null;
      }),
    saveInterpretation: (input) =>
      database.transaction(async (transaction) => {
        const interpretationId = input.interpretationIdGenerator();
        await lockInterpretationResourceId(transaction, interpretationId);
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;
        const auditEvidence = await findInterpretationResourceAuditEvidence(
          transaction,
          interpretationId
        );
        const [existing] = await transaction
          .select()
          .from(calculationInterpretations)
          .where(eq(calculationInterpretations.id, interpretationId))
          .limit(1)
          .for("update");
        if (existing) {
          return resolveInterpretationReplay(transaction, row, existing, auditEvidence, input);
        }
        if (auditEvidence.length > 0) return { kind: "idempotency_conflict" };
        if (row.resultChecksum !== input.expectedResultChecksum) return null;
        const now = new Date(input.now);
        const [inserted] = await transaction
          .insert(calculationInterpretations)
          .values({
            id: interpretationId,
            calculationId: input.calculationId,
            source: input.source,
            status: "draft",
            text: input.text,
            modelId: input.modelId,
            promptVersion: input.promptVersion,
            approvedAt: null,
            createdAt: now,
            updatedAt: now
          })
          .onConflictDoNothing({ target: calculationInterpretations.id })
          .returning({ id: calculationInterpretations.id });
        if (!inserted) {
          const [raced] = await transaction
            .select()
            .from(calculationInterpretations)
            .where(eq(calculationInterpretations.id, interpretationId))
            .limit(1)
            .for("update");
          if (!raced) throw new Error("Interpretation resource conflict could not be resolved");
          return resolveInterpretationReplay(
            transaction,
            row,
            raced,
            await findInterpretationResourceAuditEvidence(transaction, interpretationId),
            input
          );
        }
        await insertCalculationAudit(transaction, {
          actorUserId: row.ownerUserId,
          action: "calculation.interpretation.saved",
          calculationId: row.id,
          occurredAt: now,
          metadata: {
            interpretationId,
            source: input.source,
            resultChecksum: row.resultChecksum
          }
        });
        const updated = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { updatedAt: now }
        });
        return updated ? hydrateOne(transaction, updated) : null;
      }),
    approveInterpretation: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;
        const [interpretation] = await transaction
          .select()
          .from(calculationInterpretations)
          .where(
            and(
              eq(calculationInterpretations.id, input.interpretationId),
              eq(calculationInterpretations.calculationId, input.calculationId)
            )
          )
          .limit(1)
          .for("update");
        if (!interpretation) return null;
        if (interpretation.status === "approved") return hydrateOne(transaction, row);

        const now = new Date(input.now);
        const [approved] = await transaction
          .update(calculationInterpretations)
          .set({
            status: "approved",
            approvedAt: now,
            updatedAt: now
          })
          .where(
            and(
              eq(calculationInterpretations.id, input.interpretationId),
              eq(calculationInterpretations.calculationId, input.calculationId),
              eq(calculationInterpretations.status, "draft")
            )
          )
          .returning({ id: calculationInterpretations.id });
        if (!approved) return null;
        await insertCalculationAudit(transaction, {
          actorUserId: row.ownerUserId,
          action: "calculation.interpretation.approved",
          calculationId: row.id,
          occurredAt: now,
          metadata: {
            interpretationId: interpretation.id,
            resultChecksum: row.resultChecksum
          }
        });
        const updated = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { updatedAt: now }
        });
        return updated ? hydrateOne(transaction, updated) : null;
      }),
    archive: (input) =>
      database.transaction(async (transaction) => {
        const updated = await updateOwnedCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { status: "archived", updatedAt: new Date(input.now) }
        });
        return updated ? hydrateOne(transaction, updated) : null;
      })
  };
}

async function insertCalculation(
  database: CalculationDatabase,
  input: CalculationStoreCreateInput
): Promise<CalculationRecord> {
  await lockCalculationExactKey(database, input);
  const row = await insertReturningOne(
    () => database.insert(calculationRecords).values(toCalculationInsertRow(input)).returning(),
    "calculation_records"
  );
  if (input.participants.length > 0) {
    await database.insert(calculationParticipants).values(
      input.participants.map((participant, order) => ({
        calculationId: row.id,
        role: participant.role,
        source: participant.source,
        clientId: participant.clientId,
        displayName: participant.displayName,
        order,
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now)
      }))
    );
  }
  await insertMissingClientLinks(database, row.id, input.linkClientIds, input.now);
  const current =
    input.linkClientIds.length > 0
      ? ((
          await database
            .update(calculationRecords)
            .set({ status: "linked", updatedAt: new Date(input.now) })
            .where(eq(calculationRecords.id, row.id))
            .returning()
        )[0] ?? row)
      : row;
  return hydrateOne(database, current);
}

async function replaceResult(
  database: CalculationTransaction,
  input: CalculationStoreReplaceResultInput
): Promise<CalculationStoreReplaceResultOutcome> {
  const [observed] = await database
    .select({
      ownerUserId: calculationRecords.ownerUserId,
      module: calculationRecords.module,
      mode: calculationRecords.mode,
      methodCode: calculationRecords.methodCode
    })
    .from(calculationRecords)
    .where(
      and(
        eq(calculationRecords.ownerUserId, input.ownerUserId),
        eq(calculationRecords.id, input.calculationId),
        ne(calculationRecords.status, "archived")
      )
    )
    .limit(1);
  if (!observed) return { status: "not_found" };
  await lockCalculationExactKey(database, {
    ownerUserId: observed.ownerUserId,
    module: observed.module as CalculationModule,
    mode: observed.mode as CalculationMode,
    methodCode: observed.methodCode,
    requestFingerprint: input.requestFingerprint
  });
  const row = await lockOwnedMutableCalculationRow(
    database,
    input.ownerUserId,
    input.calculationId
  );
  if (!row) return { status: "not_found" };
  if (
    row.ownerUserId !== observed.ownerUserId ||
    row.module !== observed.module ||
    row.mode !== observed.mode ||
    row.methodCode !== observed.methodCode
  ) {
    throw new CalculationIdentityChangedWhileLockingError();
  }

  const collision = await database
    .select({ id: calculationRecords.id })
    .from(calculationRecords)
    .where(
      and(
        eq(calculationRecords.ownerUserId, row.ownerUserId),
        eq(calculationRecords.module, row.module),
        eq(calculationRecords.mode, row.mode),
        eq(calculationRecords.methodCode, row.methodCode),
        eq(calculationRecords.requestFingerprint, input.requestFingerprint),
        ne(calculationRecords.status, "archived"),
        ne(calculationRecords.id, row.id)
      )
    )
    .limit(1);
  if (collision.length > 0) return { status: "exact_key_conflict" };

  const participantRows = await database
    .select()
    .from(calculationParticipants)
    .where(eq(calculationParticipants.calculationId, input.calculationId))
    .orderBy(calculationParticipants.order)
    .for("update");
  assertParticipantIdentity(participantRows, input.participants);
  for (const [order, participant] of input.participants.entries()) {
    await database
      .update(calculationParticipants)
      .set({ displayName: participant.displayName, updatedAt: new Date(input.now) })
      .where(
        and(
          eq(calculationParticipants.calculationId, input.calculationId),
          eq(calculationParticipants.order, order)
        )
      );
  }

  await database
    .update(calculationClientLinks)
    .set({
      visibility: "private_to_astrologer",
      publishedAt: null,
      publishedInterpretationId: null,
      publishedResultChecksum: null,
      updatedAt: new Date(input.now)
    })
    .where(eq(calculationClientLinks.calculationId, input.calculationId));
  await database
    .delete(calculationInterpretations)
    .where(eq(calculationInterpretations.calculationId, input.calculationId));
  await scheduleCalculationPdfCleanup(database, input.calculationId, input.now);
  await database
    .delete(calculationPdfJobs)
    .where(eq(calculationPdfJobs.calculationId, input.calculationId));
  await database
    .delete(calculationArtifacts)
    .where(eq(calculationArtifacts.calculationId, input.calculationId));
  const linkCount = await countLinks(database, input.calculationId);
  const updated = await updateOwnedMutableCalculation(database, {
    ownerUserId: input.ownerUserId,
    calculationId: input.calculationId,
    patch: {
      ...(input.title === undefined ? {} : { title: input.title }),
      requestFingerprint: input.requestFingerprint,
      inputData: input.inputData,
      resultData: input.resultData,
      resultSummary: input.resultSummary,
      resultChecksum: input.resultChecksum,
      status: linkCount > 0 ? "linked" : "calculated",
      updatedAt: new Date(input.now)
    }
  });
  if (!updated) return { status: "not_found" };
  return { status: "updated", calculation: await hydrateOne(database, updated) };
}

async function scheduleCalculationPdfCleanup(
  database: CalculationTransaction,
  calculationId: string,
  now: string
): Promise<void> {
  const pdfArtifacts = await database
    .select({ mediaAssetId: calculationArtifacts.mediaAssetId })
    .from(calculationArtifacts)
    .where(
      and(
        eq(calculationArtifacts.calculationId, calculationId),
        eq(calculationArtifacts.artifactType, "pdf")
      )
    );
  const mediaAssetIds = [...new Set(pdfArtifacts.map((artifact) => artifact.mediaAssetId))];
  if (mediaAssetIds.length === 0) return;

  const occurredAt = new Date(now);
  const availableAt = new Date(occurredAt.getTime() + 60 * 60 * 1_000);
  await database
    .insert(outboxEvents)
    .values(
      mediaAssetIds.map((mediaAssetId) => ({
        eventType: CALCULATION_PDF_DELETE_REQUESTED_EVENT,
        aggregateId: mediaAssetId,
        payload: { mediaAssetId },
        status: "pending",
        attempts: 0,
        availableAt,
        createdAt: occurredAt,
        updatedAt: occurredAt
      }))
    )
    .onConflictDoNothing({
      target: [outboxEvents.eventType, outboxEvents.aggregateId]
    });
}

async function lockInterpretationResourceId(
  database: CalculationTransaction,
  interpretationId: string
): Promise<void> {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`calculation:interpretation:${interpretationId}`}, 0))`
  );
}

async function resolveInterpretationReplay(
  database: CalculationTransaction,
  row: CalculationRecordRow,
  existing: CalculationInterpretationRow,
  auditEvidence: readonly InterpretationResourceAuditEvidence[],
  input: Parameters<CalculationStore["saveInterpretation"]>[0]
): Promise<CalculationStoreSaveInterpretationOutcome> {
  if (
    existing.calculationId !== input.calculationId ||
    row.resultChecksum !== input.expectedResultChecksum ||
    existing.source !== input.source ||
    existing.text !== input.text ||
    existing.modelId !== input.modelId ||
    existing.promptVersion !== input.promptVersion
  ) {
    return { kind: "idempotency_conflict" };
  }

  const evidence = auditEvidence[0];
  const metadata = evidence?.metadata;
  if (
    auditEvidence.length !== 1 ||
    evidence?.actorUserId !== row.ownerUserId ||
    evidence.targetId !== row.id ||
    !isStringRecord(metadata) ||
    metadata.resultChecksum !== input.expectedResultChecksum ||
    metadata.source !== input.source
  ) {
    return { kind: "idempotency_conflict" };
  }

  return hydrateOne(database, row);
}

type InterpretationResourceAuditEvidence = {
  readonly actorUserId: string | null;
  readonly targetId: string;
  readonly metadata: unknown;
};

function findInterpretationResourceAuditEvidence(
  database: CalculationTransaction,
  interpretationId: string
): Promise<readonly InterpretationResourceAuditEvidence[]> {
  return database
    .select({
      actorUserId: auditLogEntries.actorUserId,
      targetId: auditLogEntries.targetId,
      metadata: auditLogEntries.metadata
    })
    .from(auditLogEntries)
    .where(
      and(
        eq(auditLogEntries.action, "calculation.interpretation.saved"),
        eq(auditLogEntries.targetType, "calculation"),
        sql`${auditLogEntries.metadata} ->> 'interpretationId' = ${interpretationId}`
      )
    )
    .limit(2);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

async function insertCalculationAudit(
  database: CalculationTransaction,
  input: {
    readonly actorUserId: string;
    readonly action:
      | "calculation.interpretation.saved"
      | "calculation.interpretation.approved"
      | "calculation.published";
    readonly calculationId: string;
    readonly occurredAt: Date;
    readonly metadata: Readonly<Record<string, string>>;
  }
): Promise<void> {
  await database.insert(auditLogEntries).values({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: "calculation",
    targetId: input.calculationId,
    occurredAt: input.occurredAt,
    metadata: input.metadata
  });
}

async function findExactCalculation(
  database: CalculationDatabase,
  input: {
    readonly ownerUserId: string;
    readonly module: CalculationModule;
    readonly mode: CalculationMode;
    readonly methodCode: string;
    readonly requestFingerprint: string;
  }
): Promise<CalculationRecord | null> {
  const [row] = await database
    .select()
    .from(calculationRecords)
    .where(
      and(
        eq(calculationRecords.ownerUserId, input.ownerUserId),
        eq(calculationRecords.module, input.module),
        eq(calculationRecords.mode, input.mode),
        eq(calculationRecords.methodCode, input.methodCode),
        eq(calculationRecords.requestFingerprint, input.requestFingerprint),
        ne(calculationRecords.status, "archived")
      )
    )
    .limit(1);
  return row ? hydrateOne(database, row) : null;
}

async function insertMissingClientLinks(
  database: CalculationDatabase,
  calculationId: string,
  clientIds: readonly string[],
  now: string
): Promise<void> {
  const uniqueClientIds = [...new Set(clientIds)];
  if (uniqueClientIds.length === 0) return;
  await database
    .insert(calculationClientLinks)
    .values(
      uniqueClientIds.map((clientId) => ({
        calculationId,
        clientId,
        visibility: "private_to_astrologer",
        linkedAt: new Date(now),
        publishedAt: null,
        publishedInterpretationId: null,
        publishedResultChecksum: null,
        createdAt: new Date(now),
        updatedAt: new Date(now)
      }))
    )
    .onConflictDoNothing({
      target: [calculationClientLinks.calculationId, calculationClientLinks.clientId]
    });
}

async function syncStatusFromLinks(
  database: CalculationDatabase,
  row: CalculationRecordRow,
  now: string
): Promise<CalculationRecordRow> {
  const visible = await countVisibleLinks(database, row.id);
  const links = await countLinks(database, row.id);
  const status: CalculationStatus = visible > 0 ? "published" : links > 0 ? "linked" : "calculated";
  return (
    (await updateOwnedMutableCalculation(database, {
      ownerUserId: row.ownerUserId,
      calculationId: row.id,
      patch: { status, updatedAt: new Date(now) }
    })) ?? row
  );
}

function assertParticipantIdentity(
  rows: readonly CalculationParticipantRow[],
  participants: readonly CalculationParticipant[]
): void {
  if (
    rows.length !== participants.length ||
    rows.some((row, index) => {
      const participant = participants[index];
      return (
        !participant ||
        row.order !== index ||
        row.role !== participant.role ||
        row.source !== participant.source ||
        row.clientId !== participant.clientId
      );
    })
  ) {
    throw new Error("Calculation participant identity mismatch");
  }
}

async function findOwnedCalculationRow(
  database: CalculationDatabase,
  ownerUserId: string,
  calculationId: string
): Promise<CalculationRecordRow | null> {
  const [row] = await database
    .select()
    .from(calculationRecords)
    .where(
      and(eq(calculationRecords.ownerUserId, ownerUserId), eq(calculationRecords.id, calculationId))
    )
    .limit(1);
  return row ?? null;
}

async function lockOwnedMutableCalculationRow(
  database: CalculationDatabase,
  ownerUserId: string,
  calculationId: string
): Promise<CalculationRecordRow | null> {
  const [row] = await database
    .select()
    .from(calculationRecords)
    .where(
      and(
        eq(calculationRecords.ownerUserId, ownerUserId),
        eq(calculationRecords.id, calculationId),
        ne(calculationRecords.status, "archived")
      )
    )
    .limit(1)
    .for("update");
  return row ?? null;
}

async function updateOwnedCalculation(
  database: CalculationDatabase,
  input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly patch: Partial<CalculationRecordInsertRow>;
  }
): Promise<CalculationRecordRow | null> {
  const [row] = await database
    .update(calculationRecords)
    .set(input.patch)
    .where(
      and(
        eq(calculationRecords.ownerUserId, input.ownerUserId),
        eq(calculationRecords.id, input.calculationId)
      )
    )
    .returning();
  return row ?? null;
}

async function updateOwnedMutableCalculation(
  database: CalculationDatabase,
  input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly patch: Partial<CalculationRecordInsertRow>;
  }
): Promise<CalculationRecordRow | null> {
  const [row] = await database
    .update(calculationRecords)
    .set(input.patch)
    .where(
      and(
        eq(calculationRecords.ownerUserId, input.ownerUserId),
        eq(calculationRecords.id, input.calculationId),
        ne(calculationRecords.status, "archived")
      )
    )
    .returning();
  return row ?? null;
}

async function countLinks(database: CalculationDatabase, calculationId: string): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(calculationClientLinks)
    .where(eq(calculationClientLinks.calculationId, calculationId));
  return Number(row?.value ?? 0);
}

async function countVisibleLinks(
  database: CalculationDatabase,
  calculationId: string
): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(calculationClientLinks)
    .where(
      and(
        eq(calculationClientLinks.calculationId, calculationId),
        eq(calculationClientLinks.visibility, "visible_to_client")
      )
    );
  return Number(row?.value ?? 0);
}

async function hydrateOne(
  database: CalculationDatabase,
  row: CalculationRecordRow
): Promise<CalculationRecord> {
  const [record] = await hydrateCalculations(database, [row]);
  if (!record) throw new Error("Expected calculation to hydrate");
  return record;
}

async function hydrateCalculations(
  database: CalculationDatabase,
  rows: readonly CalculationRecordRow[]
): Promise<CalculationRecord[]> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];
  const participantRows = await database
    .select()
    .from(calculationParticipants)
    .where(inArray(calculationParticipants.calculationId, ids))
    .orderBy(calculationParticipants.calculationId, calculationParticipants.order);
  const linkRows = await database
    .select()
    .from(calculationClientLinks)
    .where(inArray(calculationClientLinks.calculationId, ids))
    .orderBy(calculationClientLinks.calculationId, calculationClientLinks.linkedAt);
  const interpretationRows = await database
    .select()
    .from(calculationInterpretations)
    .where(inArray(calculationInterpretations.calculationId, ids))
    .orderBy(
      calculationInterpretations.calculationId,
      calculationInterpretations.createdAt,
      calculationInterpretations.id
    );
  const artifactRows = await database
    .select()
    .from(calculationArtifacts)
    .where(inArray(calculationArtifacts.calculationId, ids))
    .orderBy(
      calculationArtifacts.calculationId,
      calculationArtifacts.createdAt,
      calculationArtifacts.id
    );
  const participants = groupParticipants(participantRows);
  const links = groupLinks(linkRows);
  const interpretations = groupInterpretations(interpretationRows);
  const artifacts = groupArtifacts(artifactRows);

  return rows.map((row) => ({
    id: row.id,
    ownerUserId: row.ownerUserId,
    module: row.module as CalculationModule,
    mode: row.mode as CalculationMode,
    interpretationMode:
      row.module === "chart" && row.methodCode === "natal"
        ? ((row.interpretationMode ?? "legacy_unclassified") as ChartInterpretationMode)
        : null,
    methodCode: row.methodCode,
    title: row.title,
    status: row.status as CalculationStatus,
    requestFingerprint: row.requestFingerprint,
    inputData: row.inputData,
    resultData: row.resultData,
    resultSummary: row.resultSummary,
    resultChecksum: row.resultChecksum,
    participants: participants.get(row.id) ?? [],
    links: links.get(row.id) ?? [],
    interpretations: interpretations.get(row.id) ?? [],
    artifacts: artifacts.get(row.id) ?? [],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  }));
}

function toCalculationInsertRow(input: CalculationStoreCreateInput): CalculationRecordInsertRow {
  return {
    id: input.idGenerator(),
    ownerUserId: input.ownerUserId,
    module: input.module,
    mode: input.mode,
    interpretationMode: input.interpretationMode ?? null,
    methodCode: input.methodCode,
    title: input.title,
    status: "calculated",
    requestFingerprint: input.requestFingerprint,
    inputData: input.inputData,
    resultData: input.resultData,
    resultSummary: input.resultSummary,
    resultChecksum: input.resultChecksum,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now)
  };
}

function groupParticipants(rows: readonly CalculationParticipantRow[]) {
  const grouped = new Map<string, CalculationParticipant[]>();
  for (const row of rows) {
    const values = grouped.get(row.calculationId) ?? [];
    values.push({
      role: row.role as CalculationParticipant["role"],
      source: row.source as CalculationParticipant["source"],
      clientId: row.clientId,
      displayName: row.displayName
    });
    grouped.set(row.calculationId, values);
  }
  return grouped;
}

function groupLinks(rows: readonly CalculationClientLinkRow[]) {
  const grouped = new Map<string, CalculationClientLink[]>();
  for (const row of rows) {
    const values = grouped.get(row.calculationId) ?? [];
    values.push({
      clientId: row.clientId,
      visibility: row.visibility as CalculationClientLink["visibility"],
      linkedAt: toIsoString(row.linkedAt),
      publishedAt: row.publishedAt ? toIsoString(row.publishedAt) : null
    });
    grouped.set(row.calculationId, values);
  }
  return grouped;
}

function groupInterpretations(rows: readonly CalculationInterpretationRow[]) {
  const grouped = new Map<string, CalculationInterpretation[]>();
  for (const row of rows) {
    const values = grouped.get(row.calculationId) ?? [];
    values.push({
      id: row.id,
      source: row.source as CalculationInterpretation["source"],
      status: row.status as CalculationInterpretation["status"],
      text: row.text,
      modelId: row.modelId,
      promptVersion: row.promptVersion,
      approvedAt: row.approvedAt ? toIsoString(row.approvedAt) : null,
      updatedAt: toIsoString(row.updatedAt)
    });
    grouped.set(row.calculationId, values);
  }
  return grouped;
}

function groupArtifacts(rows: readonly CalculationArtifactRow[]) {
  const grouped = new Map<string, CalculationArtifact[]>();
  for (const row of rows) {
    const values = grouped.get(row.calculationId) ?? [];
    values.push({
      id: row.id,
      mediaAssetId: row.mediaAssetId,
      artifactType: row.artifactType as CalculationArtifact["artifactType"],
      status: row.status as CalculationArtifact["status"]
    });
    grouped.set(row.calculationId, values);
  }
  return grouped;
}

class CalculationIdentityChangedWhileLockingError extends Error {}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
