import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  AstroCalendarGenerationRecord,
  AstroCalendarGenerationStore,
  AstroCalendarGenerationWithEvents,
  AstroCalendarStoredEvent
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { astroCalendarEvents, astroCalendarGenerations } from "../../schema";

type AstroCalendarGenerationRow = typeof astroCalendarGenerations.$inferSelect;
type AstroCalendarEventRow = typeof astroCalendarEvents.$inferSelect;
type AstroCalendarTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type AstroCalendarDatabase = ElevenHouseDatabase | AstroCalendarTransaction;

export function createDrizzleAstroCalendarGenerationStore(
  database: AstroCalendarDatabase
): AstroCalendarGenerationStore {
  return {
    createCalculating: (input) => createCalculating(database, input),
    findByFingerprint: (input) =>
      findGenerationWithEvents(database, {
        ownerUserId: input.ownerUserId,
        inputFingerprint: input.inputFingerprint
      }),
    findLatestForRange: (input) => findLatestForRange(database, input),
    markReady: (input) => markReady(database, input),
    markFailed: (input) => markFailed(database, input),
    markStaleByOwner: (input) => markStaleByOwner(database, input)
  };
}

async function createCalculating(
  database: AstroCalendarDatabase,
  input: Parameters<AstroCalendarGenerationStore["createCalculating"]>[0]
): Promise<AstroCalendarGenerationRecord> {
  const now = new Date(input.now);
  const [inserted] = await database
    .insert(astroCalendarGenerations)
    .values({
      ownerUserId: input.ownerUserId,
      status: "calculating",
      inputFingerprint: input.inputFingerprint,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      timeZone: input.timeZone,
      requestSnapshot: input.requestSnapshot,
      settingsSnapshot: input.settingsSnapshot,
      readinessSummary: input.readinessSummary,
      summary: {},
      warnings: input.warnings,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing({
      target: [astroCalendarGenerations.ownerUserId, astroCalendarGenerations.inputFingerprint]
    })
    .returning();

  if (inserted) return toGenerationRecord(inserted);

  const existing = await findGenerationRowByFingerprint(
    database,
    input.ownerUserId,
    input.inputFingerprint
  );
  if (!existing) throw new Error("ASTRO_CALENDAR_GENERATION_CREATE_CONFLICT");
  return toGenerationRecord(existing);
}

async function findLatestForRange(
  database: AstroCalendarDatabase,
  input: Parameters<AstroCalendarGenerationStore["findLatestForRange"]>[0]
): Promise<AstroCalendarGenerationWithEvents | null> {
  const [row] = await database
    .select()
    .from(astroCalendarGenerations)
    .where(
      and(
        eq(astroCalendarGenerations.ownerUserId, input.ownerUserId),
        eq(astroCalendarGenerations.rangeStart, input.rangeStart),
        eq(astroCalendarGenerations.rangeEnd, input.rangeEnd),
        eq(astroCalendarGenerations.timeZone, input.timeZone)
      )
    )
    .orderBy(desc(astroCalendarGenerations.updatedAt), desc(astroCalendarGenerations.id))
    .limit(1);

  return row ? hydrateGenerationWithEvents(database, row) : null;
}

async function markReady(
  database: AstroCalendarDatabase,
  input: Parameters<AstroCalendarGenerationStore["markReady"]>[0]
): Promise<AstroCalendarGenerationWithEvents | null> {
  return database.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(astroCalendarGenerations)
      .set({
        status: "ready",
        provider: input.provider,
        readinessSummary: input.readinessSummary,
        summary: input.summary,
        warnings: input.warnings,
        generatedAt: new Date(input.generatedAt),
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(input.now)
      })
      .where(
        and(
          eq(astroCalendarGenerations.id, input.generationId),
          eq(astroCalendarGenerations.ownerUserId, input.ownerUserId)
        )
      )
      .returning();

    if (!updated) return null;

    await transaction
      .delete(astroCalendarEvents)
      .where(eq(astroCalendarEvents.generationId, input.generationId));

    if (input.events.length > 0) {
      await transaction.insert(astroCalendarEvents).values(
        input.events.map((event) => ({
          generationId: input.generationId,
          ownerUserId: input.ownerUserId,
          eventId: event.eventId,
          source: event.source,
          type: event.type,
          timePrecision: readPayloadTimePrecision(event.payload),
          startsAt: new Date(event.startsAt),
          endsAt: event.endsAt ? new Date(event.endsAt) : null,
          payload: event.payload,
          dictionaryCodes: event.dictionaryCodes,
          createdAt: new Date(input.now)
        }))
      );
    }

    return hydrateGenerationWithEvents(transaction, updated);
  });
}

async function markFailed(
  database: AstroCalendarDatabase,
  input: Parameters<AstroCalendarGenerationStore["markFailed"]>[0]
): Promise<AstroCalendarGenerationRecord | null> {
  const [updated] = await database
    .update(astroCalendarGenerations)
    .set({
      status: "failed",
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      updatedAt: new Date(input.now)
    })
    .where(
      and(
        eq(astroCalendarGenerations.id, input.generationId),
        eq(astroCalendarGenerations.ownerUserId, input.ownerUserId)
      )
    )
    .returning();

  return updated ? toGenerationRecord(updated) : null;
}

async function markStaleByOwner(
  database: AstroCalendarDatabase,
  input: Parameters<AstroCalendarGenerationStore["markStaleByOwner"]>[0]
): Promise<number> {
  const rows = await database
    .update(astroCalendarGenerations)
    .set({
      status: "stale",
      updatedAt: new Date(input.now)
    })
    .where(
      and(
        eq(astroCalendarGenerations.ownerUserId, input.ownerUserId),
        inArray(astroCalendarGenerations.status, ["ready", "calculating"])
      )
    )
    .returning({ id: astroCalendarGenerations.id });

  return rows.length;
}

async function findGenerationWithEvents(
  database: AstroCalendarDatabase,
  input: { readonly ownerUserId: string; readonly inputFingerprint: string }
): Promise<AstroCalendarGenerationWithEvents | null> {
  const row = await findGenerationRowByFingerprint(
    database,
    input.ownerUserId,
    input.inputFingerprint
  );
  return row ? hydrateGenerationWithEvents(database, row) : null;
}

async function findGenerationRowByFingerprint(
  database: AstroCalendarDatabase,
  ownerUserId: string,
  inputFingerprint: string
): Promise<AstroCalendarGenerationRow | null> {
  const [row] = await database
    .select()
    .from(astroCalendarGenerations)
    .where(
      and(
        eq(astroCalendarGenerations.ownerUserId, ownerUserId),
        eq(astroCalendarGenerations.inputFingerprint, inputFingerprint)
      )
    )
    .limit(1);

  return row ?? null;
}

async function hydrateGenerationWithEvents(
  database: AstroCalendarDatabase,
  row: AstroCalendarGenerationRow
): Promise<AstroCalendarGenerationWithEvents> {
  const eventRows = await database
    .select()
    .from(astroCalendarEvents)
    .where(eq(astroCalendarEvents.generationId, row.id))
    .orderBy(astroCalendarEvents.startsAt, astroCalendarEvents.id);

  return {
    generation: toGenerationRecord(row),
    events: eventRows.map(toStoredEvent)
  };
}

function toGenerationRecord(row: AstroCalendarGenerationRow): AstroCalendarGenerationRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    status: row.status as AstroCalendarGenerationRecord["status"],
    inputFingerprint: row.inputFingerprint,
    rangeStart: row.rangeStart,
    rangeEnd: row.rangeEnd,
    timeZone: row.timeZone,
    requestSnapshot: row.requestSnapshot,
    settingsSnapshot: row.settingsSnapshot,
    readinessSummary: row.readinessSummary as AstroCalendarGenerationRecord["readinessSummary"],
    summary: row.summary,
    warnings: row.warnings as AstroCalendarGenerationRecord["warnings"],
    provider: row.provider,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toStoredEvent(row: AstroCalendarEventRow): AstroCalendarStoredEvent {
  return {
    id: row.id,
    generationId: row.generationId,
    ownerUserId: row.ownerUserId,
    eventId: row.eventId,
    source: row.source as AstroCalendarStoredEvent["source"],
    type: row.type as AstroCalendarStoredEvent["type"],
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    payload: row.payload,
    dictionaryCodes: row.dictionaryCodes as readonly string[]
  };
}

function readPayloadTimePrecision(payload: unknown): "exact" | "hour" | "day" {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "timePrecision" in payload &&
    (payload.timePrecision === "exact" ||
      payload.timePrecision === "hour" ||
      payload.timePrecision === "day")
  ) {
    return payload.timePrecision;
  }
  return "exact";
}
