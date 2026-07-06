import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
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
  CalculationStoreAppendVersionInput,
  CalculationStoreCreateInput,
  CalculationVersion
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  calculationArtifacts,
  calculationClientLinks,
  calculationInterpretations,
  calculationParticipants,
  calculationRecords,
  calculationVersions
} from "../../schema";
import { insertReturningOne } from "../../shared";

type CalculationRecordRow = typeof calculationRecords.$inferSelect;
type CalculationRecordInsertRow = typeof calculationRecords.$inferInsert;
type CalculationParticipantRow = typeof calculationParticipants.$inferSelect;
type CalculationVersionRow = typeof calculationVersions.$inferSelect;
type CalculationClientLinkRow = typeof calculationClientLinks.$inferSelect;
type CalculationInterpretationRow = typeof calculationInterpretations.$inferSelect;
type CalculationArtifactRow = typeof calculationArtifacts.$inferSelect;
type CalculationTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type CalculationDatabase = ElevenHouseDatabase | CalculationTransaction;

export function createDrizzleCalculationStore(database: ElevenHouseDatabase): CalculationStore {
  return {
    listByOwner: async (query) => {
      const where =
        query.status === "all"
          ? eq(calculationRecords.ownerUserId, query.ownerUserId)
          : and(
              eq(calculationRecords.ownerUserId, query.ownerUserId),
              eq(calculationRecords.status, query.status)
            );
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
      if (!row) return null;

      const [record] = await hydrateCalculations(database, [row]);
      return record ?? null;
    },
    create: (input) => database.transaction((transaction) => insertCalculation(transaction, input)),
    appendVersion: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;

        const latestVersionNumber = await getLatestVersionNumber(transaction, input.calculationId);
        await insertVersion(transaction, input.calculationId, {
          id: input.versionIdGenerator(),
          versionNumber: latestVersionNumber + 1,
          methodVersion: input.methodVersion,
          settingsSnapshot: input.settingsSnapshot,
          inputSnapshot: input.inputSnapshot,
          resultSnapshot: input.resultSnapshot,
          resultSummary: input.resultSummary,
          resultChecksum: input.resultChecksum,
          createdAt: new Date(input.now)
        });
        await transaction
          .update(calculationClientLinks)
          .set({
            visibility: "private_to_astrologer",
            publishedAt: null,
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(calculationClientLinks.calculationId, input.calculationId),
              eq(calculationClientLinks.visibility, "visible_to_client")
            )
          );
        const linkCount = await countLinks(transaction, input.calculationId);
        const updatedRow = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: {
            currentMethodVersion: input.methodVersion,
            status: linkCount > 0 ? "linked" : "calculated",
            updatedAt: new Date(input.now)
          }
        });
        if (!updatedRow) return null;

        const [record] = await hydrateCalculations(transaction, [updatedRow]);
        return record ?? null;
      }),
    linkClient: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;

        const [insertedLink] = await transaction
          .insert(calculationClientLinks)
          .values({
            calculationId: input.calculationId,
            clientId: input.clientId,
            visibility: "private_to_astrologer",
            linkedAt: new Date(input.now),
            publishedAt: null,
            createdAt: new Date(input.now),
            updatedAt: new Date(input.now)
          })
          .onConflictDoNothing({
            target: [calculationClientLinks.calculationId, calculationClientLinks.clientId]
          })
          .returning({ id: calculationClientLinks.id });
        if (!insertedLink) {
          await transaction
            .update(calculationClientLinks)
            .set({
              visibility: "private_to_astrologer",
              publishedAt: null,
              updatedAt: new Date(input.now)
            })
            .where(
              and(
                eq(calculationClientLinks.calculationId, input.calculationId),
                eq(calculationClientLinks.clientId, input.clientId)
              )
            );
          const updatedRow = await updateOwnedMutableCalculation(transaction, {
            ownerUserId: input.ownerUserId,
            calculationId: input.calculationId,
            patch: {
              status: "linked",
              updatedAt: new Date(input.now)
            }
          });
          if (!updatedRow) return null;

          const [record] = await hydrateCalculations(transaction, [updatedRow]);
          return record ?? null;
        }

        const updatedRow = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: {
            status: "linked",
            updatedAt: new Date(input.now)
          }
        });
        if (!updatedRow) return null;

        const [record] = await hydrateCalculations(transaction, [updatedRow]);
        return record ?? null;
      }),
    publishClientLink: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;

        const [linkRow] = await transaction
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
                select 1
                from calculation_records
                where calculation_records.id = ${calculationClientLinks.calculationId}
                  and calculation_records.owner_user_id = ${input.ownerUserId}
                  and calculation_records.status <> 'archived'
              )`,
              sql`${input.expectedVersionId} = (
                select calculation_versions.id
                from calculation_versions
                where calculation_versions.calculation_id = ${input.calculationId}
                order by calculation_versions.version_number desc, calculation_versions.id desc
                limit 1
              )`
            )
          )
          .returning();
        if (!linkRow) return null;

        const updatedRow = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: {
            status: "published",
            updatedAt: new Date(input.now)
          }
        });
        if (!updatedRow) return null;

        const [record] = await hydrateCalculations(transaction, [updatedRow]);
        return record ?? null;
      }),
    saveInterpretation: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;
        const versionExists = await hasVersion(transaction, input.calculationId, input.versionId);
        if (!versionExists) return null;

        await transaction.insert(calculationInterpretations).values({
          id: input.interpretationIdGenerator(),
          calculationId: input.calculationId,
          versionId: input.versionId,
          source: input.source,
          status: "draft",
          text: input.text,
          modelId: input.modelId,
          promptVersion: input.promptVersion,
          approvedAt: null,
          createdAt: new Date(input.now),
          updatedAt: new Date(input.now)
        });
        const updatedRow = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { updatedAt: new Date(input.now) }
        });
        if (!updatedRow) return null;

        const [record] = await hydrateCalculations(transaction, [updatedRow]);
        return record ?? null;
      }),
    approveInterpretation: (input) =>
      database.transaction(async (transaction) => {
        const row = await lockOwnedMutableCalculationRow(
          transaction,
          input.ownerUserId,
          input.calculationId
        );
        if (!row) return null;

        const [interpretationRow] = await transaction
          .update(calculationInterpretations)
          .set({
            status: "approved",
            approvedAt: new Date(input.now),
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(calculationInterpretations.id, input.interpretationId),
              eq(calculationInterpretations.calculationId, input.calculationId),
              sql`exists (
                select 1
                from calculation_records
                where calculation_records.id = ${calculationInterpretations.calculationId}
                  and calculation_records.owner_user_id = ${input.ownerUserId}
                  and calculation_records.status <> 'archived'
              )`
            )
          )
          .returning();
        if (!interpretationRow) return null;

        const updatedRow = await updateOwnedMutableCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: { updatedAt: new Date(input.now) }
        });
        if (!updatedRow) return null;

        const [record] = await hydrateCalculations(transaction, [updatedRow]);
        return record ?? null;
      }),
    archive: (input) =>
      database.transaction(async (transaction) => {
        const updatedRow = await updateOwnedCalculation(transaction, {
          ownerUserId: input.ownerUserId,
          calculationId: input.calculationId,
          patch: {
            status: "archived",
            updatedAt: new Date(input.now)
          }
        });
        if (!updatedRow) return null;

        const [record] = await hydrateCalculations(transaction, [updatedRow]);
        return record ?? null;
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
      input.participants.map((participant, index) => ({
        calculationId: row.id,
        role: participant.role,
        source: participant.source,
        clientId: participant.clientId,
        displayName: participant.displayName,
        birthDate: participant.birthDate,
        inputSnapshot: participant.inputSnapshot,
        manuallyOverridden: participant.manuallyOverridden,
        order: index,
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now)
      }))
    );
  }
  await insertVersion(database, row.id, {
    id: input.versionIdGenerator(),
    versionNumber: 1,
    methodVersion: input.methodVersion,
    settingsSnapshot: input.settingsSnapshot,
    inputSnapshot: input.inputSnapshot,
    resultSnapshot: input.resultSnapshot,
    resultSummary: input.resultSummary,
    resultChecksum: input.resultChecksum,
    createdAt: new Date(input.now)
  });

  const [record] = await hydrateCalculations(database, [row]);
  if (!record) {
    throw new Error("Expected inserted calculation to hydrate");
  }
  return record;
}

async function insertVersion(
  database: CalculationDatabase,
  calculationId: string,
  input: {
    readonly id: string;
    readonly versionNumber: number;
    readonly methodVersion: string;
    readonly settingsSnapshot: unknown;
    readonly inputSnapshot: unknown;
    readonly resultSnapshot: unknown;
    readonly resultSummary: unknown;
    readonly resultChecksum: string;
    readonly createdAt: Date;
  }
): Promise<void> {
  await database.insert(calculationVersions).values({
    id: input.id,
    calculationId,
    versionNumber: input.versionNumber,
    methodVersion: input.methodVersion,
    settingsSnapshot: input.settingsSnapshot,
    inputSnapshot: input.inputSnapshot,
    resultSnapshot: input.resultSnapshot,
    resultSummary: input.resultSummary,
    resultChecksum: input.resultChecksum,
    createdAt: input.createdAt
  });
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
        sql`${calculationRecords.status} <> 'archived'`
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
        sql`${calculationRecords.status} <> 'archived'`
      )
    )
    .returning();
  return row ?? null;
}

async function getLatestVersionNumber(
  database: CalculationDatabase,
  calculationId: string
): Promise<number> {
  const [row] = await database
    .select({ versionNumber: calculationVersions.versionNumber })
    .from(calculationVersions)
    .where(eq(calculationVersions.calculationId, calculationId))
    .orderBy(desc(calculationVersions.versionNumber), desc(calculationVersions.id))
    .limit(1);
  return row?.versionNumber ?? 0;
}

async function hasVersion(
  database: CalculationDatabase,
  calculationId: string,
  versionId: string
): Promise<boolean> {
  const [row] = await database
    .select({ id: calculationVersions.id })
    .from(calculationVersions)
    .where(
      and(
        eq(calculationVersions.calculationId, calculationId),
        eq(calculationVersions.id, versionId)
      )
    )
    .limit(1);
  return Boolean(row);
}

async function countLinks(database: CalculationDatabase, calculationId: string): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(calculationClientLinks)
    .where(eq(calculationClientLinks.calculationId, calculationId));
  return Number(row?.value ?? 0);
}

async function hydrateCalculations(
  database: CalculationDatabase,
  rows: readonly CalculationRecordRow[]
): Promise<CalculationRecord[]> {
  const calculationIds = rows.map((row) => row.id);
  if (calculationIds.length === 0) return [];

  const participantRows = await database
    .select()
    .from(calculationParticipants)
    .where(inArray(calculationParticipants.calculationId, calculationIds))
    .orderBy(calculationParticipants.calculationId, calculationParticipants.order);
  const versionRows = await database
    .select()
    .from(calculationVersions)
    .where(inArray(calculationVersions.calculationId, calculationIds))
    .orderBy(calculationVersions.calculationId, calculationVersions.versionNumber);
  const linkRows = await database
    .select()
    .from(calculationClientLinks)
    .where(inArray(calculationClientLinks.calculationId, calculationIds))
    .orderBy(calculationClientLinks.calculationId, calculationClientLinks.linkedAt);
  const interpretationRows = await database
    .select()
    .from(calculationInterpretations)
    .where(inArray(calculationInterpretations.calculationId, calculationIds))
    .orderBy(
      calculationInterpretations.calculationId,
      calculationInterpretations.createdAt,
      calculationInterpretations.id
    );
  const artifactRows = await database
    .select()
    .from(calculationArtifacts)
    .where(inArray(calculationArtifacts.calculationId, calculationIds))
    .orderBy(
      calculationArtifacts.calculationId,
      calculationArtifacts.createdAt,
      calculationArtifacts.id
    );

  const participantsByCalculation = groupParticipants(participantRows);
  const versionsByCalculation = groupVersions(versionRows);
  const linksByCalculation = groupLinks(linkRows);
  const interpretationsByCalculation = groupInterpretations(interpretationRows);
  const artifactsByCalculation = groupArtifacts(artifactRows);

  return rows.map((row) => ({
    id: row.id,
    ownerUserId: row.ownerUserId,
    module: row.module as CalculationModule,
    mode: row.mode as CalculationMode,
    methodCode: row.methodCode,
    currentMethodVersion: row.currentMethodVersion,
    title: row.title,
    status: row.status as CalculationStatus,
    participants: participantsByCalculation.get(row.id) ?? [],
    versions: versionsByCalculation.get(row.id) ?? [],
    links: linksByCalculation.get(row.id) ?? [],
    interpretations: interpretationsByCalculation.get(row.id) ?? [],
    artifacts: artifactsByCalculation.get(row.id) ?? [],
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
    currentMethodVersion: input.methodVersion,
    title: input.title,
    status: "calculated",
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now)
  };
}

function groupParticipants(
  rows: readonly CalculationParticipantRow[]
): Map<string, CalculationParticipant[]> {
  const grouped = new Map<string, CalculationParticipant[]>();
  for (const row of rows) {
    const values = grouped.get(row.calculationId) ?? [];
    values.push({
      role: row.role as CalculationParticipant["role"],
      source: row.source as CalculationParticipant["source"],
      clientId: row.clientId,
      displayName: row.displayName,
      birthDate: row.birthDate,
      inputSnapshot: row.inputSnapshot,
      manuallyOverridden: row.manuallyOverridden
    });
    grouped.set(row.calculationId, values);
  }
  return grouped;
}

function groupVersions(rows: readonly CalculationVersionRow[]): Map<string, CalculationVersion[]> {
  const grouped = new Map<string, CalculationVersion[]>();
  for (const row of rows) {
    const values = grouped.get(row.calculationId) ?? [];
    values.push({
      id: row.id,
      versionNumber: row.versionNumber,
      methodVersion: row.methodVersion,
      settingsSnapshot: row.settingsSnapshot,
      inputSnapshot: row.inputSnapshot,
      resultSnapshot: row.resultSnapshot,
      resultSummary: row.resultSummary,
      resultChecksum: row.resultChecksum,
      createdAt: toIsoString(row.createdAt)
    });
    grouped.set(row.calculationId, values);
  }
  return grouped;
}

function groupLinks(
  rows: readonly CalculationClientLinkRow[]
): Map<string, CalculationClientLink[]> {
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

function groupInterpretations(
  rows: readonly CalculationInterpretationRow[]
): Map<string, CalculationInterpretation[]> {
  const grouped = new Map<string, CalculationInterpretation[]>();
  for (const row of rows) {
    const values = grouped.get(row.calculationId) ?? [];
    values.push({
      id: row.id,
      versionId: row.versionId,
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

function groupArtifacts(
  rows: readonly CalculationArtifactRow[]
): Map<string, CalculationArtifact[]> {
  const grouped = new Map<string, CalculationArtifact[]>();
  for (const row of rows) {
    const values = grouped.get(row.calculationId) ?? [];
    values.push({
      id: row.id,
      versionId: row.versionId,
      mediaAssetId: row.mediaAssetId,
      artifactType: row.artifactType as CalculationArtifact["artifactType"],
      status: row.status as CalculationArtifact["status"]
    });
    grouped.set(row.calculationId, values);
  }
  return grouped;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
