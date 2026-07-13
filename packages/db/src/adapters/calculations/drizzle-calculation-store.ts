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
  CalculationStoreReplaceResultOutcome
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  calculationArtifacts,
  calculationClientLinks,
  calculationInterpretations,
  calculationParticipants,
  calculationRecords
} from "../../schema";
import { insertReturningOne } from "../../shared";

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
      const [totalRow] = await database.select({ value: count() }).from(calculationRecords).where(where);
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
      return row ? (await hydrateCalculations(database, [row]))[0] ?? null : null;
    },
    findExact: async (input) => findExactCalculation(database, input),
    create: async (input) => {
      try {
        return await database.transaction((transaction) => insertCalculation(transaction, input));
      } catch (error) {
        if (!isExactRequestUniqueViolation(error)) throw error;
        const existing = await findExactCalculation(database, input);
        if (!existing) throw error;
        return existing;
      }
    },
    replaceResult: async (input) => {
      try {
        return await database.transaction((transaction) => replaceResult(transaction, input));
      } catch (error) {
        if (isExactRequestUniqueViolation(error)) return { status: "exact_key_conflict" };
        throw error;
      }
    },
    ensureClientLinks: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;
        await insertMissingClientLinks(transaction, input.calculationId, input.clientIds, input.now);
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
        await insertMissingClientLinks(transaction, input.calculationId, [input.clientId], input.now);
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

        const [link] = await transaction
          .update(calculationClientLinks)
          .set({
            visibility: "visible_to_client",
            publishedAt: new Date(input.now),
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(calculationClientLinks.calculationId, input.calculationId),
              eq(calculationClientLinks.clientId, input.clientId),
              sql`exists (
                select 1 from calculation_interpretations
                where calculation_interpretations.calculation_id = ${input.calculationId}
                  and calculation_interpretations.status = 'approved'
              )`
            )
          )
          .returning({ id: calculationClientLinks.id });
        if (!link) return null;
        const updated = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { status: "published", updatedAt: new Date(input.now) }
        });
        return updated ? hydrateOne(transaction, updated) : null;
      }),
    saveInterpretation: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;
        await transaction.insert(calculationInterpretations).values({
          id: input.interpretationIdGenerator(),
          calculationId: input.calculationId,
          source: input.source,
          status: "draft",
          text: input.text,
          modelId: input.modelId,
          promptVersion: input.promptVersion,
          approvedAt: null,
          createdAt: new Date(input.now),
          updatedAt: new Date(input.now)
        });
        const updated = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { updatedAt: new Date(input.now) }
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
        const [approved] = await transaction
          .update(calculationInterpretations)
          .set({
            status: "approved",
            approvedAt: new Date(input.now),
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(calculationInterpretations.id, input.interpretationId),
              eq(calculationInterpretations.calculationId, input.calculationId)
            )
          )
          .returning({ id: calculationInterpretations.id });
        if (!approved) return null;
        const updated = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { updatedAt: new Date(input.now) }
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
  return hydrateOne(database, row);
}

async function replaceResult(
  database: CalculationTransaction,
  input: CalculationStoreReplaceResultInput
): Promise<CalculationStoreReplaceResultOutcome> {
  const row = await lockOwnedMutableCalculationRow(
    database,
    input.ownerUserId,
    input.calculationId
  );
  if (!row) return { status: "not_found" };

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
    .delete(calculationInterpretations)
    .where(eq(calculationInterpretations.calculationId, input.calculationId));
  await database
    .delete(calculationArtifacts)
    .where(eq(calculationArtifacts.calculationId, input.calculationId));
  await database
    .update(calculationClientLinks)
    .set({
      visibility: "private_to_astrologer",
      publishedAt: null,
      updatedAt: new Date(input.now)
    })
    .where(eq(calculationClientLinks.calculationId, input.calculationId));

  const linkCount = await countLinks(database, input.calculationId);
  const updated = await updateOwnedMutableCalculation(database, {
    ownerUserId: input.ownerUserId,
    calculationId: input.calculationId,
    patch: {
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
        eq(calculationRecords.requestFingerprint, input.requestFingerprint)
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
  const [visible, links] = await Promise.all([
    countVisibleLinks(database, row.id),
    countLinks(database, row.id)
  ]);
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
  const [participantRows, linkRows, interpretationRows, artifactRows] = await Promise.all([
    database
      .select()
      .from(calculationParticipants)
      .where(inArray(calculationParticipants.calculationId, ids))
      .orderBy(calculationParticipants.calculationId, calculationParticipants.order),
    database
      .select()
      .from(calculationClientLinks)
      .where(inArray(calculationClientLinks.calculationId, ids))
      .orderBy(calculationClientLinks.calculationId, calculationClientLinks.linkedAt),
    database
      .select()
      .from(calculationInterpretations)
      .where(inArray(calculationInterpretations.calculationId, ids))
      .orderBy(
        calculationInterpretations.calculationId,
        calculationInterpretations.createdAt,
        calculationInterpretations.id
      ),
    database
      .select()
      .from(calculationArtifacts)
      .where(inArray(calculationArtifacts.calculationId, ids))
      .orderBy(
        calculationArtifacts.calculationId,
        calculationArtifacts.createdAt,
        calculationArtifacts.id
      )
  ]);
  const participants = groupParticipants(participantRows);
  const links = groupLinks(linkRows);
  const interpretations = groupInterpretations(interpretationRows);
  const artifacts = groupArtifacts(artifactRows);

  return rows.map((row) => ({
    id: row.id,
    ownerUserId: row.ownerUserId,
    module: row.module as CalculationModule,
    mode: row.mode as CalculationMode,
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
      approvedAt: row.approvedAt ? toIsoString(row.approvedAt) : null
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

function isExactRequestUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === "calculation_records_exact_request_unique"
  );
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
