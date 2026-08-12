import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  executeAstroDiaryDraftCreateCommand,
  executeOpenClientCycleCommand,
  executePublishAstrologerReplyCommand,
  executeAstroDiaryParticipantDraftDeleteCommand,
  executeAstroDiaryParticipantDraftCreateCommand,
  executeAstroDiaryParticipantDraftUpdateCommand,
  executeAstroDiaryPromptCommand,
  type AstroDiaryCommandWriteSet
} from "@elevenhouse/domain";
import { astroDiaryResponseObligationSchema } from "@elevenhouse/contracts";

import type { PostgresRuntime } from "../../runtime";
import {
  astroDiaryCommandPreconditions,
  astroDiaryCommandReceipts,
  astroDiaryContextSnapshots,
  astroDiaryCycles,
  astroDiaryDerivativeCommands,
  astroDiaryDraftVersionFacts,
  astroDiaryDrafts,
  astroDiaryEntryAttachments,
  astroDiaryEventDeliveries,
  astroDiaryEvents,
  astroDiaryJournals,
  astroDiaryMediaAuthorities,
  astroDiaryResponseObligations,
  astroDiaryResponseObligationWeekdays,
  astroDiaryTimelineItemRevisions,
  astroDiaryTimelineRevisionAttachments,
  astroDiaryTimelineItems
} from "../../schema/astro-diary";
import { mediaAssets } from "../../schema/media/media-assets.schema";
import {
  clientSubscriptionAllowanceCommandEffects,
  clientSubscriptionAllowanceCommandReceipts,
  clientSubscriptionPeriodAllowances
} from "../../schema/client-subscriptions";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";
import {
  createActiveClientSubscriptionFixture,
  createClientSubscriptionIntegrationDatabase,
  type ActiveClientSubscriptionFixture
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleAstroDiaryCommandUnitOfWork } from "./drizzle-astro-diary-command-uow";

describe.sequential("Drizzle AstroDiary command UOW", () => {
  let runtime: PostgresRuntime;
  let closeDatabase: () => Promise<void>;

  beforeAll(async () => {
    const integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
    closeDatabase = integration.close;
  }, 30_000);

  afterAll(async () => {
    await closeDatabase?.();
  }, 30_000);

  it("allocates and persists one draft, then replays its body-free receipt without deciding again", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const idempotencyKey = `draft-${randomUUID()}`;
    const body = "Текст черновика остаётся только в приватной таблице";
    const input = {
      journalId,
      idempotencyKey,
      actorUserId: fixture.authority.clientUserId,
      actorRole: "client" as const,
      request: clientDraftCreateRequest(body)
    };
    const applied = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, input);

    expect(applied).toMatchObject({
      outcome: "applied",
      response: {
        outcome: "applied",
        eventIds: [],
        resource: { type: "draft", version: 1 }
      }
    });
    if (applied.outcome !== "applied" || applied.response.resource === null) {
      throw new Error("Expected an applied draft creation");
    }
    const draftId = applied.response.resource.draftId;
    const replayed = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, input);

    expect(replayed).toEqual({ outcome: "replayed", result: applied.receipt.result });
    expect(JSON.stringify(replayed)).not.toContain(body);
    await expect(
      runtime.database.select().from(astroDiaryDrafts).where(eq(astroDiaryDrafts.id, draftId))
    ).resolves.toMatchObject([
      {
        id: draftId,
        journalId,
        authorUserId: fixture.authority.clientUserId,
        version: 1,
        body
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDraftVersionFacts)
        .where(eq(astroDiaryDraftVersionFacts.draftId, draftId))
    ).resolves.toMatchObject([{ draftId, journalId, version: 1 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCommandReceipts)
        .where(eq(astroDiaryCommandReceipts.journalId, journalId))
    ).resolves.toMatchObject([
      {
        journalId,
        idempotencyKey,
        outcome: "applied",
        resultResourceType: "draft",
        resultResourceId: draftId,
        resultResourceVersion: 1
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCommandPreconditions)
        .where(eq(astroDiaryCommandPreconditions.journalId, journalId))
    ).resolves.toMatchObject([
      {
        journalId,
        idempotencyKey,
        aggregate: "journal",
        aggregateId: journalId,
        expectedVersion: 1
      }
    ]);
    await expect(
      runtime.database
        .select({ version: astroDiaryJournals.version })
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.id, journalId))
    ).resolves.toEqual([{ version: 2 }]);
  });

  it("converges concurrent same-key retries and allocates only once", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const idempotencyKey = `draft-race-${randomUUID()}`;
    const input = draftCreateInput(fixture, journalId, idempotencyKey, "Один черновик");
    const run = () => executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, input);

    const [left, right] = await Promise.all([run(), run()]);

    expect([left.outcome, right.outcome].sort()).toEqual(["applied", "replayed"]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDrafts)
        .where(eq(astroDiaryDrafts.journalId, journalId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCommandReceipts)
        .where(eq(astroDiaryCommandReceipts.journalId, journalId))
    ).resolves.toHaveLength(1);
  });

  it("returns a hash conflict before stale CAS evaluation", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const idempotencyKey = `draft-conflict-${randomUUID()}`;
    const firstInput = draftCreateInput(fixture, journalId, idempotencyKey, "Первая версия");
    const first = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, firstInput);
    expect(first.outcome).toBe("applied");

    const conflict = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      draftCreateInput(fixture, journalId, idempotencyKey, "Другая версия")
    );

    expect(conflict).toEqual({ outcome: "idempotency_conflict" });
  });

  it("does not seal a stale journal version", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const idempotencyKey = `draft-stale-${randomUUID()}`;
    const stale = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      ...draftCreateInput(fixture, journalId, idempotencyKey, "Не сохранять"),
      request: clientDraftCreateRequest("Не сохранять", 2)
    });

    expect(stale).toEqual({
      outcome: "version_conflict",
      aggregate: "journal",
      id: journalId,
      expectedVersion: 2,
      currentVersion: 1
    });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCommandReceipts)
        .where(eq(astroDiaryCommandReceipts.idempotencyKey, idempotencyKey))
    ).resolves.toEqual([]);
  });

  it("atomically reserves an allowance and publishes an astrologer reflection prompt", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const promptDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-open-prompt-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 1,
        cycleId: null,
        kind: "reflection_prompt",
        body: "Что из прожитого сегодня вы хотите бережно заметить?",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    if (promptDraft.outcome !== "applied" || promptDraft.response.resource === null) {
      throw new Error("Expected an astrologer reflection prompt draft");
    }
    const cycleId = randomUUID();
    const promptItemId = randomUUID();
    const reservationId = randomUUID();
    const eventIds = {
      cycleOpened: randomUUID(),
      promptPublished: randomUUID(),
      derivativeRequested: randomUUID()
    };
    const input = {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: `open-prompt-${randomUUID()}`,
      request: {
        type: "open_prompt" as const,
        command: {
          actorUserId: fixture.authority.astrologerUserId,
          promptDraftId: promptDraft.response.resource.draftId,
          expectedPromptDraftVersion: 1,
          cycleId,
          promptItemId,
          periodId: fixture.periodId,
          allowanceExpectedVersion: 1,
          allowanceIdempotencyKey: `reserve-prompt-${randomUUID()}`,
          reservationId,
          derivativeCommandId: randomUUID(),
          eventIds
        }
      }
    };

    const applied = await executeAstroDiaryPromptCommand(unitOfWork, input);
    expect(applied).toMatchObject({
      outcome: "applied",
      response: { outcome: "applied", eventIds: Object.values(eventIds), resource: null }
    });
    await expect(executeAstroDiaryPromptCommand(unitOfWork, input)).resolves.toEqual({
      outcome: "replayed",
      result: applied.outcome === "applied" ? applied.receipt.result : expect.anything()
    });
    await expect(
      runtime.database.select().from(astroDiaryCycles).where(eq(astroDiaryCycles.id, cycleId))
    ).resolves.toMatchObject([
      {
        id: cycleId,
        state: "awaiting_client_entry",
        openingPeriodId: fixture.periodId,
        openingAllowanceReservationId: reservationId,
        awaitingClientPromptItemId: promptItemId,
        version: 1
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItems)
        .where(eq(astroDiaryTimelineItems.id, promptItemId))
    ).resolves.toMatchObject([
      { id: promptItemId, cycleId, kind: "reflection_prompt", cursor: 1, currentRevision: 1 }
    ]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionPeriodAllowances)
        .where(eq(clientSubscriptionPeriodAllowances.periodId, fixture.periodId))
    ).resolves.toMatchObject([{ available: 3, reserved: 1, consumed: 0, version: 2 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEvents)
        .where(eq(astroDiaryEvents.journalId, journalId))
    ).resolves.toHaveLength(3);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEventDeliveries)
        .where(inArray(astroDiaryEventDeliveries.eventId, Object.values(eventIds)))
    ).resolves.toHaveLength(5);
  });

  it("consumes the opening prompt reservation and accepts one client entry in the same transaction", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const promptDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-accept-prompt-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 1,
        cycleId: null,
        kind: "reflection_prompt",
        body: "Какой маленький шаг сегодня был бы для вас честным?",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    if (promptDraft.outcome !== "applied" || promptDraft.response.resource === null) {
      throw new Error("Expected a prompt draft");
    }
    const cycleId = randomUUID();
    const promptItemId = randomUUID();
    const reservationId = randomUUID();
    await expect(
      executeAstroDiaryPromptCommand(unitOfWork, {
        journalId,
        expectedJournalVersion: 2,
        idempotencyKey: `open-accept-prompt-${randomUUID()}`,
        request: {
          type: "open_prompt",
          command: {
            actorUserId: fixture.authority.astrologerUserId,
            promptDraftId: promptDraft.response.resource.draftId,
            expectedPromptDraftVersion: 1,
            cycleId,
            promptItemId,
            periodId: fixture.periodId,
            allowanceExpectedVersion: 1,
            allowanceIdempotencyKey: `reserve-accept-${randomUUID()}`,
            reservationId,
            derivativeCommandId: randomUUID(),
            eventIds: {
              cycleOpened: randomUUID(),
              promptPublished: randomUUID(),
              derivativeRequested: randomUUID()
            }
          }
        }
      })
    ).resolves.toMatchObject({ outcome: "applied" });
    const entryDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-accept-entry-${randomUUID()}`,
      actorUserId: fixture.authority.clientUserId,
      actorRole: "client",
      request: {
        expectedJournalVersion: 3,
        cycleId,
        kind: "client_entry",
        body: "Я хочу начать с десяти минут тишины без телефона.",
        attachmentIds: [],
        moodId: "calm",
        correctsItemId: null
      }
    });
    if (entryDraft.outcome !== "applied" || entryDraft.response.resource === null) {
      throw new Error("Expected a client entry draft");
    }
    const entryItemId = randomUUID();
    const obligationId = randomUUID();
    const eventIds = {
      itemPublished: randomUUID(),
      obligationCreated: randomUUID(),
      contextRequested: randomUUID(),
      derivativeRequested: randomUUID()
    };
    const input = {
      journalId,
      expectedJournalVersion: 4,
      idempotencyKey: `accept-prompt-${randomUUID()}`,
      request: {
        type: "accept_prompt" as const,
        command: {
          actorUserId: fixture.authority.clientUserId,
          cycleId,
          expectedCycleVersion: 1,
          entryDraftId: entryDraft.response.resource.draftId,
          expectedEntryDraftVersion: 1,
          entryItemId,
          obligationId,
          contextId: randomUUID(),
          derivativeCommandId: randomUUID(),
          allowancePeriodId: fixture.periodId,
          allowanceExpectedVersion: 2,
          allowanceIdempotencyKey: `consume-accept-${randomUUID()}`,
          eventIds
        }
      }
    };
    const applied = await executeAstroDiaryPromptCommand(unitOfWork, input);
    expect(applied).toMatchObject({
      outcome: "applied",
      response: { outcome: "applied", eventIds: Object.values(eventIds), resource: null }
    });
    await expect(executeAstroDiaryPromptCommand(unitOfWork, input)).resolves.toEqual({
      outcome: "replayed",
      result: applied.outcome === "applied" ? applied.receipt.result : expect.anything()
    });
    await expect(
      runtime.database.select().from(astroDiaryCycles).where(eq(astroDiaryCycles.id, cycleId))
    ).resolves.toMatchObject([
      {
        state: "awaiting_astrologer_response",
        version: 2,
        openingAllowanceReservationId: null,
        awaitingClientPromptItemId: null
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionPeriodAllowances)
        .where(eq(clientSubscriptionPeriodAllowances.periodId, fixture.periodId))
    ).resolves.toMatchObject([{ available: 3, reserved: 0, consumed: 1, version: 3 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligations)
        .where(eq(astroDiaryResponseObligations.id, obligationId))
    ).resolves.toMatchObject([{ cycleId, triggerItemId: entryItemId, state: "open", version: 1 }]);
  });

  it("closes a declined prompt and releases its reservation without leaving an open cycle", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const promptDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-decline-prompt-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 1,
        cycleId: null,
        kind: "reflection_prompt",
        body: "Хотите ли вы оставить это наблюдение здесь без ответа?",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    if (promptDraft.outcome !== "applied" || promptDraft.response.resource === null) {
      throw new Error("Expected a prompt draft");
    }
    const cycleId = randomUUID();
    const promptItemId = randomUUID();
    const reservationId = randomUUID();
    await executeAstroDiaryPromptCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: `open-decline-prompt-${randomUUID()}`,
      request: {
        type: "open_prompt",
        command: {
          actorUserId: fixture.authority.astrologerUserId,
          promptDraftId: promptDraft.response.resource.draftId,
          expectedPromptDraftVersion: 1,
          cycleId,
          promptItemId,
          periodId: fixture.periodId,
          allowanceExpectedVersion: 1,
          allowanceIdempotencyKey: `reserve-decline-${randomUUID()}`,
          reservationId,
          derivativeCommandId: randomUUID(),
          eventIds: {
            cycleOpened: randomUUID(),
            promptPublished: randomUUID(),
            derivativeRequested: randomUUID()
          }
        }
      }
    });
    const input = {
      journalId,
      expectedJournalVersion: 3,
      idempotencyKey: `decline-prompt-${randomUUID()}`,
      request: {
        type: "close_prompt" as const,
        command: {
          reason: "client_declined" as const,
          actorUserId: fixture.authority.clientUserId,
          cycleId,
          expectedCycleVersion: 1,
          promptItemId,
          expectedPromptRevision: 1,
          allowancePeriodId: fixture.periodId,
          allowanceExpectedVersion: 2,
          allowanceIdempotencyKey: `release-decline-${randomUUID()}`,
          cycleClosedEventId: randomUUID()
        }
      }
    };
    const applied = await executeAstroDiaryPromptCommand(unitOfWork, input);
    expect(applied).toMatchObject({ outcome: "applied" });
    await expect(executeAstroDiaryPromptCommand(unitOfWork, input)).resolves.toEqual({
      outcome: "replayed",
      result: applied.outcome === "applied" ? applied.receipt.result : expect.anything()
    });
    await expect(
      runtime.database.select().from(astroDiaryCycles).where(eq(astroDiaryCycles.id, cycleId))
    ).resolves.toMatchObject([
      {
        state: "closed",
        version: 2,
        closeReason: "client_declined",
        openingAllowanceReservationId: null
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionPeriodAllowances)
        .where(eq(clientSubscriptionPeriodAllowances.periodId, fixture.periodId))
    ).resolves.toMatchObject([{ available: 4, reserved: 0, consumed: 0, released: 0, version: 3 }]);
  });

  it("withdraws a prompt with an append-only tombstone revision and releases its reservation", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const promptDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-withdraw-prompt-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 1,
        cycleId: null,
        kind: "reflection_prompt",
        body: "Какой вопрос сейчас важнее оставить открытым?",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    if (promptDraft.outcome !== "applied" || promptDraft.response.resource === null) {
      throw new Error("Expected a prompt draft");
    }
    const cycleId = randomUUID();
    const promptItemId = randomUUID();
    await executeAstroDiaryPromptCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: `open-withdraw-prompt-${randomUUID()}`,
      request: {
        type: "open_prompt",
        command: {
          actorUserId: fixture.authority.astrologerUserId,
          promptDraftId: promptDraft.response.resource.draftId,
          expectedPromptDraftVersion: 1,
          cycleId,
          promptItemId,
          periodId: fixture.periodId,
          allowanceExpectedVersion: 1,
          allowanceIdempotencyKey: `reserve-withdraw-${randomUUID()}`,
          reservationId: randomUUID(),
          derivativeCommandId: randomUUID(),
          eventIds: {
            cycleOpened: randomUUID(),
            promptPublished: randomUUID(),
            derivativeRequested: randomUUID()
          }
        }
      }
    });
    const input = {
      journalId,
      expectedJournalVersion: 3,
      idempotencyKey: `withdraw-prompt-${randomUUID()}`,
      request: {
        type: "close_prompt" as const,
        command: {
          reason: "prompt_withdrawn" as const,
          actorUserId: fixture.authority.astrologerUserId,
          cycleId,
          expectedCycleVersion: 1,
          promptItemId,
          expectedPromptRevision: 1,
          allowancePeriodId: fixture.periodId,
          allowanceExpectedVersion: 2,
          allowanceIdempotencyKey: `release-withdraw-${randomUUID()}`,
          cycleClosedEventId: randomUUID()
        }
      }
    };
    const applied = await executeAstroDiaryPromptCommand(unitOfWork, input);
    expect(applied).toMatchObject({ outcome: "applied" });
    await expect(executeAstroDiaryPromptCommand(unitOfWork, input)).resolves.toEqual({
      outcome: "replayed",
      result: applied.outcome === "applied" ? applied.receipt.result : expect.anything()
    });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItems)
        .where(eq(astroDiaryTimelineItems.id, promptItemId))
    ).resolves.toMatchObject([
      {
        kind: "tombstone",
        originalKind: "reflection_prompt",
        currentRevision: 2,
        body: null,
        tombstoneReason: "hidden_by_author"
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItemRevisions)
        .where(eq(astroDiaryTimelineItemRevisions.itemId, promptItemId))
    ).resolves.toHaveLength(2);
    await expect(
      runtime.database.select().from(astroDiaryCycles).where(eq(astroDiaryCycles.id, cycleId))
    ).resolves.toMatchObject([{ state: "closed", closeReason: "prompt_withdrawn" }]);
  });

  it("updates and deletes an own draft with journal plus draft CAS and body-free replay", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      ...draftCreateInput(fixture, journalId, `draft-create-${randomUUID()}`, "Первая версия")
    });
    if (created.outcome !== "applied" || created.response.resource === null) {
      throw new Error("Expected a created draft");
    }
    const draftId = created.response.resource.draftId;
    const updateInput = {
      journalId,
      idempotencyKey: `draft-update-${randomUUID()}`,
      actorUserId: fixture.authority.clientUserId,
      actorRole: "client" as const,
      request: {
        expectedJournalVersion: 2,
        draftId,
        expectedDraftVersion: 1,
        body: "Вторая приватная версия",
        attachmentIds: [],
        moodId: "joy" as const
      }
    };
    const updated = await executeAstroDiaryParticipantDraftUpdateCommand(unitOfWork, updateInput);
    expect(updated).toMatchObject({
      outcome: "applied",
      response: { resource: { type: "draft", draftId, version: 2 } }
    });
    const updateReplay = await executeAstroDiaryParticipantDraftUpdateCommand(
      unitOfWork,
      updateInput
    );
    expect(updateReplay).toEqual({
      outcome: "replayed",
      result: updated.outcome === "applied" ? updated.receipt.result : expect.anything()
    });
    await expect(
      runtime.database.select().from(astroDiaryDrafts).where(eq(astroDiaryDrafts.id, draftId))
    ).resolves.toMatchObject([
      { id: draftId, version: 2, body: "Вторая приватная версия", moodId: "joy" }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDraftVersionFacts)
        .where(eq(astroDiaryDraftVersionFacts.draftId, draftId))
    ).resolves.toHaveLength(2);

    const deleteInput = {
      journalId,
      idempotencyKey: `draft-delete-${randomUUID()}`,
      actorUserId: fixture.authority.clientUserId,
      actorRole: "client" as const,
      draftId,
      request: { expectedJournalVersion: 3, expectedDraftVersion: 2 }
    };
    const deleted = await executeAstroDiaryParticipantDraftDeleteCommand(unitOfWork, deleteInput);
    expect(deleted).toMatchObject({
      outcome: "applied",
      response: { resource: { type: "draft", draftId, version: 2 } }
    });
    expect(await executeAstroDiaryParticipantDraftDeleteCommand(unitOfWork, deleteInput)).toEqual({
      outcome: "replayed",
      result: deleted.outcome === "applied" ? deleted.receipt.result : expect.anything()
    });
    await expect(
      runtime.database.select().from(astroDiaryDrafts).where(eq(astroDiaryDrafts.id, draftId))
    ).resolves.toEqual([]);
    await expect(
      runtime.database
        .select({ version: astroDiaryJournals.version })
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.id, journalId))
    ).resolves.toEqual([{ version: 4 }]);
  });

  it("atomically publishes a client entry and opens its complete paid reflection cycle", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      draftCreateInput(
        fixture,
        journalId,
        `draft-for-cycle-${randomUUID()}`,
        "Сегодня я наконец разрешила себе не отвечать сразу."
      )
    );
    if (created.outcome !== "applied" || created.response.resource === null) {
      throw new Error("Expected a created client entry draft");
    }
    const draftId = created.response.resource.draftId;
    const cycleId = randomUUID();
    const entryItemId = randomUUID();
    const obligationId = randomUUID();
    const contextId = randomUUID();
    const derivativeCommandId = randomUUID();
    const eventIds = {
      cycleOpened: randomUUID(),
      itemPublished: randomUUID(),
      obligationCreated: randomUUID(),
      contextRequested: randomUUID(),
      derivativeRequested: randomUUID()
    };
    const input = {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: `open-cycle-${randomUUID()}`,
      command: {
        actorUserId: fixture.authority.clientUserId,
        draftId,
        expectedDraftVersion: 1,
        cycleId,
        entryItemId,
        obligationId,
        contextId,
        derivativeCommandId,
        allowancePeriodId: fixture.periodId,
        allowanceExpectedVersion: 1,
        allowanceIdempotencyKey: `cycle-allowance-${randomUUID()}`,
        allowanceConsumptionId: randomUUID(),
        eventIds
      }
    };

    const applied = await executeOpenClientCycleCommand(unitOfWork, input);

    expect(applied).toMatchObject({
      outcome: "applied",
      response: { outcome: "applied", eventIds: Object.values(eventIds), resource: null }
    });
    expect(await executeOpenClientCycleCommand(unitOfWork, input)).toEqual({
      outcome: "replayed",
      result: applied.outcome === "applied" ? applied.receipt.result : expect.anything()
    });
    await expect(
      runtime.database.select().from(astroDiaryDrafts).where(eq(astroDiaryDrafts.id, draftId))
    ).resolves.toEqual([]);
    await expect(
      runtime.database
        .select({ version: astroDiaryJournals.version })
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.id, journalId))
    ).resolves.toEqual([{ version: 3 }]);
    await expect(
      runtime.database.select().from(astroDiaryCycles).where(eq(astroDiaryCycles.id, cycleId))
    ).resolves.toMatchObject([
      {
        id: cycleId,
        journalId,
        openingPeriodId: fixture.periodId,
        state: "awaiting_astrologer_response"
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligations)
        .where(eq(astroDiaryResponseObligations.id, obligationId))
    ).resolves.toMatchObject([{ id: obligationId, cycleId, state: "open", version: 1 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligationWeekdays)
        .where(eq(astroDiaryResponseObligationWeekdays.obligationId, obligationId))
    ).resolves.toHaveLength(5);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItems)
        .where(eq(astroDiaryTimelineItems.id, entryItemId))
    ).resolves.toMatchObject([
      { id: entryItemId, cycleId, currentRevision: 1, cursor: 1, kind: "client_entry" }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItemRevisions)
        .where(eq(astroDiaryTimelineItemRevisions.itemId, entryItemId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryContextSnapshots)
        .where(eq(astroDiaryContextSnapshots.id, contextId))
    ).resolves.toMatchObject([
      { id: contextId, itemId: entryItemId, status: "pending", version: 1 }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDerivativeCommands)
        .where(eq(astroDiaryDerivativeCommands.id, derivativeCommandId))
    ).resolves.toMatchObject([{ id: derivativeCommandId, itemId: entryItemId, state: "pending" }]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionPeriodAllowances)
        .where(eq(clientSubscriptionPeriodAllowances.periodId, fixture.periodId))
    ).resolves.toMatchObject([
      { periodId: fixture.periodId, available: 3, consumed: 1, version: 2 }
    ]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandReceipts)
        .where(
          and(
            eq(clientSubscriptionAllowanceCommandReceipts.periodId, fixture.periodId),
            eq(
              clientSubscriptionAllowanceCommandReceipts.idempotencyKey,
              input.command.allowanceIdempotencyKey
            )
          )
        )
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandEffects)
        .where(
          and(
            eq(clientSubscriptionAllowanceCommandEffects.periodId, fixture.periodId),
            eq(
              clientSubscriptionAllowanceCommandEffects.idempotencyKey,
              input.command.allowanceIdempotencyKey
            )
          )
        )
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEvents)
        .where(eq(astroDiaryEvents.journalId, journalId))
    ).resolves.toHaveLength(5);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEventDeliveries)
        .where(inArray(astroDiaryEventDeliveries.eventId, Object.values(eventIds)))
    ).resolves.toHaveLength(8);
    await expect(
      runtime.database
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, "astro_diary.event_delivery.dispatch_requested.v1"),
            inArray(
              outboxEvents.aggregateId,
              runtime.database
                .select({ id: astroDiaryEventDeliveries.id })
                .from(astroDiaryEventDeliveries)
                .where(inArray(astroDiaryEventDeliveries.eventId, Object.values(eventIds)))
            )
          )
        )
    ).resolves.toHaveLength(8);
  });

  it("binds a ready private Diary asset to the published client entry atomically", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      draftCreateInput(fixture, journalId, `draft-media-${randomUUID()}`, "Текст с вложением")
    );
    if (created.outcome !== "applied" || created.response.resource === null) {
      throw new Error("Expected a created client entry draft");
    }
    const mediaId = randomUUID();
    const now = new Date();
    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(mediaAssets).values({
        id: mediaId,
        ownerUserId: fixture.authority.clientUserId,
        purpose: "astro_diary_attachment",
        status: "ready",
        visibility: "private",
        storageBucket: "private",
        storageKey: `test/${mediaId}`,
        originalFileName: "entry.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        checksumSha256: "a".repeat(64)
      });
      await transaction.insert(astroDiaryMediaAuthorities).values({
        mediaId,
        journalId,
        ownerUserId: fixture.authority.clientUserId,
        purpose: "astro_diary_attachment",
        visibility: "private",
        state: "pending",
        boundItemId: null,
        readyAt: null,
        boundAt: null,
        createdAt: now,
        updatedAt: now
      });
      await transaction
        .update(astroDiaryMediaAuthorities)
        .set({ state: "ready", readyAt: now, updatedAt: now })
        .where(eq(astroDiaryMediaAuthorities.mediaId, mediaId));
    });
    const draftId = created.response.resource.draftId;
    const updated = await executeAstroDiaryParticipantDraftUpdateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-media-update-${randomUUID()}`,
      actorUserId: fixture.authority.clientUserId,
      actorRole: "client",
      request: {
        expectedJournalVersion: 2,
        draftId,
        expectedDraftVersion: 1,
        body: "Текст с вложением",
        attachmentIds: [mediaId],
        moodId: null
      }
    });
    if (updated.outcome !== "applied") throw new Error("Expected an updated client draft");
    const entryItemId = randomUUID();
    const eventIds = {
      cycleOpened: randomUUID(),
      itemPublished: randomUUID(),
      obligationCreated: randomUUID(),
      contextRequested: randomUUID(),
      derivativeRequested: randomUUID()
    };
    await expect(
      executeOpenClientCycleCommand(unitOfWork, {
        journalId,
        expectedJournalVersion: 3,
        idempotencyKey: `open-cycle-media-${randomUUID()}`,
        command: {
          actorUserId: fixture.authority.clientUserId,
          draftId,
          expectedDraftVersion: 2,
          cycleId: randomUUID(),
          entryItemId,
          obligationId: randomUUID(),
          contextId: randomUUID(),
          derivativeCommandId: randomUUID(),
          allowancePeriodId: fixture.periodId,
          allowanceExpectedVersion: 1,
          allowanceIdempotencyKey: `cycle-media-allowance-${randomUUID()}`,
          allowanceConsumptionId: randomUUID(),
          eventIds
        }
      })
    ).resolves.toMatchObject({ outcome: "applied" });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEntryAttachments)
        .where(eq(astroDiaryEntryAttachments.mediaId, mediaId))
    ).resolves.toMatchObject([{ mediaId, itemId: entryItemId, state: "bound" }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineRevisionAttachments)
        .where(eq(astroDiaryTimelineRevisionAttachments.mediaId, mediaId))
    ).resolves.toMatchObject([{ mediaId, itemId: entryItemId, revision: 1 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryMediaAuthorities)
        .where(eq(astroDiaryMediaAuthorities.mediaId, mediaId))
    ).resolves.toMatchObject([{ mediaId, state: "bound", boundItemId: entryItemId }]);
  });

  it("closes the paid cycle with one astrologer reply, obligation settlement and canonical delivery fanout", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const clientDraft = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      draftCreateInput(fixture, journalId, `draft-close-client-${randomUUID()}`, "Мне нужна опора")
    );
    if (clientDraft.outcome !== "applied" || clientDraft.response.resource === null) {
      throw new Error("Expected a client draft");
    }
    const cycleId = randomUUID();
    const obligationId = randomUUID();
    const clientEntryId = randomUUID();
    await expect(
      executeOpenClientCycleCommand(unitOfWork, {
        journalId,
        expectedJournalVersion: 2,
        idempotencyKey: `open-close-cycle-${randomUUID()}`,
        command: {
          actorUserId: fixture.authority.clientUserId,
          draftId: clientDraft.response.resource.draftId,
          expectedDraftVersion: 1,
          cycleId,
          entryItemId: clientEntryId,
          obligationId,
          contextId: randomUUID(),
          derivativeCommandId: randomUUID(),
          allowancePeriodId: fixture.periodId,
          allowanceExpectedVersion: 1,
          allowanceIdempotencyKey: `open-close-allowance-${randomUUID()}`,
          allowanceConsumptionId: randomUUID(),
          eventIds: {
            cycleOpened: randomUUID(),
            itemPublished: randomUUID(),
            obligationCreated: randomUUID(),
            contextRequested: randomUUID(),
            derivativeRequested: randomUUID()
          }
        }
      })
    ).resolves.toMatchObject({ outcome: "applied" });
    const [persistedObligation] = await runtime.database
      .select()
      .from(astroDiaryResponseObligations)
      .where(eq(astroDiaryResponseObligations.id, obligationId));
    const rehydratedObligation = astroDiaryResponseObligationSchema.safeParse({
      id: persistedObligation?.id,
      journalId: persistedObligation?.journalId,
      cycleId: persistedObligation?.cycleId,
      triggerItemId: persistedObligation?.triggerItemId,
      state: persistedObligation?.state,
      version: persistedObligation?.version,
      openedAt: persistedObligation?.openedAt.toISOString(),
      dueAt: persistedObligation?.dueAt.toISOString(),
      responseSlaWorkingDays: persistedObligation?.responseSlaWorkingDays,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: persistedObligation?.serviceTimezone,
      resolvedDueLocal: persistedObligation?.resolvedDueLocal,
      resolvedDueOffset: persistedObligation?.resolvedDueOffset,
      satisfiedByItemId: persistedObligation?.satisfiedByItemId,
      closedAt: persistedObligation?.closedAt?.toISOString() ?? null
    });
    if (!rehydratedObligation.success) {
      throw new Error(
        JSON.stringify({ persistedObligation, issues: rehydratedObligation.error.issues })
      );
    }
    const replyDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-close-reply-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 3,
        cycleId,
        kind: "astrologer_reply",
        body: "Вы уже нашли точку, в которой можно замедлиться.",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    if (replyDraft.outcome !== "applied" || replyDraft.response.resource === null) {
      throw new Error("Expected an astrologer reply draft");
    }
    const replyItemId = randomUUID();
    const input = {
      journalId,
      expectedJournalVersion: 4,
      idempotencyKey: `close-cycle-${randomUUID()}`,
      command: {
        actorUserId: fixture.authority.astrologerUserId,
        cycleId,
        expectedCycleVersion: 1,
        obligationId,
        expectedObligationVersion: 1,
        replyDraftId: replyDraft.response.resource.draftId,
        expectedReplyDraftVersion: 1,
        replyItemId,
        derivativeCommandId: randomUUID(),
        mode: "close" as const,
        eventIds: {
          itemPublished: randomUUID(),
          obligationSatisfied: randomUUID(),
          cycleClosed: randomUUID(),
          derivativeRequested: randomUUID()
        }
      }
    };
    const applied = await executePublishAstrologerReplyCommand(unitOfWork, input);
    expect(applied).toMatchObject({
      outcome: "applied",
      response: { outcome: "applied", eventIds: Object.values(input.command.eventIds) }
    });
    await expect(executePublishAstrologerReplyCommand(unitOfWork, input)).resolves.toEqual({
      outcome: "replayed",
      result: applied.outcome === "applied" ? applied.receipt.result : expect.anything()
    });
    await expect(
      runtime.database.select().from(astroDiaryCycles).where(eq(astroDiaryCycles.id, cycleId))
    ).resolves.toMatchObject([{ state: "closed", version: 2, closeReason: "completed" }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligations)
        .where(eq(astroDiaryResponseObligations.id, obligationId))
    ).resolves.toMatchObject([{ state: "satisfied", version: 2, satisfiedByItemId: replyItemId }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDrafts)
        .where(eq(astroDiaryDrafts.id, replyDraft.response.resource.draftId))
    ).resolves.toEqual([]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItems)
        .where(eq(astroDiaryTimelineItems.id, replyItemId))
    ).resolves.toMatchObject([{ kind: "astrologer_reply", cycleId, currentRevision: 1 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEvents)
        .where(eq(astroDiaryEvents.journalId, journalId))
    ).resolves.toHaveLength(9);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEventDeliveries)
        .where(inArray(astroDiaryEventDeliveries.eventId, Object.values(input.command.eventIds)))
    ).resolves.toHaveLength(6);
  });

  it("persists an astrologer reply with a follow-up prompt as one open-cycle transition", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const clientDraft = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      draftCreateInput(
        fixture,
        journalId,
        `draft-follow-client-${randomUUID()}`,
        "Я хочу понять себя"
      )
    );
    if (clientDraft.outcome !== "applied" || clientDraft.response.resource === null) {
      throw new Error("Expected a client draft");
    }
    const cycleId = randomUUID();
    const obligationId = randomUUID();
    await executeOpenClientCycleCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: `open-follow-cycle-${randomUUID()}`,
      command: {
        actorUserId: fixture.authority.clientUserId,
        draftId: clientDraft.response.resource.draftId,
        expectedDraftVersion: 1,
        cycleId,
        entryItemId: randomUUID(),
        obligationId,
        contextId: randomUUID(),
        derivativeCommandId: randomUUID(),
        allowancePeriodId: fixture.periodId,
        allowanceExpectedVersion: 1,
        allowanceIdempotencyKey: `open-follow-allowance-${randomUUID()}`,
        allowanceConsumptionId: randomUUID(),
        eventIds: {
          cycleOpened: randomUUID(),
          itemPublished: randomUUID(),
          obligationCreated: randomUUID(),
          contextRequested: randomUUID(),
          derivativeRequested: randomUUID()
        }
      }
    });
    const replyDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-follow-reply-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 3,
        cycleId,
        kind: "astrologer_reply",
        body: "Сначала заметим, где вы уже можете быть мягче к себе.",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    const promptDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-follow-prompt-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 4,
        cycleId,
        kind: "reflection_prompt",
        body: "Что из этого вы готовы попробовать до завтра?",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    if (
      replyDraft.outcome !== "applied" ||
      replyDraft.response.resource === null ||
      promptDraft.outcome !== "applied" ||
      promptDraft.response.resource === null
    ) {
      throw new Error("Expected the two astrologer drafts");
    }
    const replyItemId = randomUUID();
    const promptItemId = randomUUID();
    const input = {
      journalId,
      expectedJournalVersion: 5,
      idempotencyKey: `follow-cycle-${randomUUID()}`,
      command: {
        mode: "follow_up" as const,
        actorUserId: fixture.authority.astrologerUserId,
        cycleId,
        expectedCycleVersion: 1,
        obligationId,
        expectedObligationVersion: 1,
        replyDraftId: replyDraft.response.resource.draftId,
        expectedReplyDraftVersion: 1,
        replyItemId,
        replyDerivativeCommandId: randomUUID(),
        promptDraftId: promptDraft.response.resource.draftId,
        expectedPromptDraftVersion: 1,
        promptItemId,
        promptDerivativeCommandId: randomUUID(),
        eventIds: {
          replyPublished: randomUUID(),
          promptPublished: randomUUID(),
          obligationSatisfied: randomUUID(),
          replyDerivativeRequested: randomUUID(),
          promptDerivativeRequested: randomUUID()
        }
      }
    };
    const applied = await executePublishAstrologerReplyCommand(unitOfWork, input);
    expect(applied).toMatchObject({ outcome: "applied" });
    await expect(executePublishAstrologerReplyCommand(unitOfWork, input)).resolves.toEqual({
      outcome: "replayed",
      result: applied.outcome === "applied" ? applied.receipt.result : expect.anything()
    });
    await expect(
      runtime.database.select().from(astroDiaryCycles).where(eq(astroDiaryCycles.id, cycleId))
    ).resolves.toMatchObject([
      {
        state: "awaiting_client_follow_up",
        version: 2,
        awaitingClientPromptItemId: promptItemId
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligations)
        .where(eq(astroDiaryResponseObligations.id, obligationId))
    ).resolves.toMatchObject([{ state: "satisfied", version: 2, satisfiedByItemId: replyItemId }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItems)
        .where(inArray(astroDiaryTimelineItems.id, [replyItemId, promptItemId]))
    ).resolves.toHaveLength(2);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDerivativeCommands)
        .where(
          inArray(astroDiaryDerivativeCommands.id, [
            input.command.replyDerivativeCommandId,
            input.command.promptDerivativeCommandId
          ])
        )
    ).resolves.toHaveLength(2);
  });

  it("publishes a client follow-up without consuming allowance twice and creates the closing obligation", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const initialDraft = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      draftCreateInput(fixture, journalId, `draft-follow-up-initial-${randomUUID()}`, "Начинаю")
    );
    if (initialDraft.outcome !== "applied" || initialDraft.response.resource === null) {
      throw new Error("Expected an initial client draft");
    }
    const cycleId = randomUUID();
    const firstObligationId = randomUUID();
    await executeOpenClientCycleCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 2,
      idempotencyKey: `open-follow-up-${randomUUID()}`,
      command: {
        actorUserId: fixture.authority.clientUserId,
        draftId: initialDraft.response.resource.draftId,
        expectedDraftVersion: 1,
        cycleId,
        entryItemId: randomUUID(),
        obligationId: firstObligationId,
        contextId: randomUUID(),
        derivativeCommandId: randomUUID(),
        allowancePeriodId: fixture.periodId,
        allowanceExpectedVersion: 1,
        allowanceIdempotencyKey: `consume-follow-up-${randomUUID()}`,
        allowanceConsumptionId: randomUUID(),
        eventIds: {
          cycleOpened: randomUUID(),
          itemPublished: randomUUID(),
          obligationCreated: randomUUID(),
          contextRequested: randomUUID(),
          derivativeRequested: randomUUID()
        }
      }
    });
    const replyDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-follow-up-reply-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 3,
        cycleId,
        kind: "astrologer_reply",
        body: "Давайте посмотрим, что меняется после этого первого шага.",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    const promptDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-follow-up-prompt-${randomUUID()}`,
      actorUserId: fixture.authority.astrologerUserId,
      actorRole: "astrologer",
      request: {
        expectedJournalVersion: 4,
        cycleId,
        kind: "reflection_prompt",
        body: "Что вы заметите, если сделаете этот шаг сегодня?",
        attachmentIds: [],
        moodId: null,
        correctsItemId: null
      }
    });
    if (
      replyDraft.outcome !== "applied" ||
      replyDraft.response.resource === null ||
      promptDraft.outcome !== "applied" ||
      promptDraft.response.resource === null
    ) {
      throw new Error("Expected reply and prompt drafts");
    }
    await executePublishAstrologerReplyCommand(unitOfWork, {
      journalId,
      expectedJournalVersion: 5,
      idempotencyKey: `publish-follow-up-reply-${randomUUID()}`,
      command: {
        mode: "follow_up",
        actorUserId: fixture.authority.astrologerUserId,
        cycleId,
        expectedCycleVersion: 1,
        obligationId: firstObligationId,
        expectedObligationVersion: 1,
        replyDraftId: replyDraft.response.resource.draftId,
        expectedReplyDraftVersion: 1,
        replyItemId: randomUUID(),
        replyDerivativeCommandId: randomUUID(),
        promptDraftId: promptDraft.response.resource.draftId,
        expectedPromptDraftVersion: 1,
        promptItemId: randomUUID(),
        promptDerivativeCommandId: randomUUID(),
        eventIds: {
          replyPublished: randomUUID(),
          promptPublished: randomUUID(),
          obligationSatisfied: randomUUID(),
          replyDerivativeRequested: randomUUID(),
          promptDerivativeRequested: randomUUID()
        }
      }
    });
    const followUpDraft = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, {
      journalId,
      idempotencyKey: `draft-client-follow-up-${randomUUID()}`,
      actorUserId: fixture.authority.clientUserId,
      actorRole: "client",
      request: {
        expectedJournalVersion: 6,
        cycleId,
        kind: "client_entry",
        body: "Я заметила, что дышу свободнее, когда не тороплю себя.",
        attachmentIds: [],
        moodId: "calm",
        correctsItemId: null
      }
    });
    if (followUpDraft.outcome !== "applied" || followUpDraft.response.resource === null) {
      throw new Error("Expected a client follow-up draft");
    }
    const obligationId = randomUUID();
    const entryItemId = randomUUID();
    const input = {
      journalId,
      expectedJournalVersion: 7,
      idempotencyKey: `publish-client-follow-up-${randomUUID()}`,
      request: {
        type: "client_follow_up" as const,
        command: {
          actorUserId: fixture.authority.clientUserId,
          cycleId,
          expectedCycleVersion: 2,
          entryDraftId: followUpDraft.response.resource.draftId,
          expectedEntryDraftVersion: 1,
          entryItemId,
          obligationId,
          contextId: randomUUID(),
          derivativeCommandId: randomUUID(),
          eventIds: {
            itemPublished: randomUUID(),
            obligationCreated: randomUUID(),
            contextRequested: randomUUID(),
            derivativeRequested: randomUUID()
          }
        }
      }
    };
    await expect(executeAstroDiaryPromptCommand(unitOfWork, input)).resolves.toMatchObject({
      outcome: "applied"
    });
    await expect(
      runtime.database.select().from(astroDiaryCycles).where(eq(astroDiaryCycles.id, cycleId))
    ).resolves.toMatchObject([{ state: "awaiting_astrologer_closing_response", version: 3 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligations)
        .where(eq(astroDiaryResponseObligations.id, obligationId))
    ).resolves.toMatchObject([{ state: "open", triggerItemId: entryItemId }]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionPeriodAllowances)
        .where(eq(clientSubscriptionPeriodAllowances.periodId, fixture.periodId))
    ).resolves.toMatchObject([{ available: 3, reserved: 0, consumed: 1, version: 2 }]);
    await expect(
      runtime.database
        .select({ version: astroDiaryJournals.version })
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.id, journalId))
    ).resolves.toEqual([{ version: 8 }]);
  });

  it("rolls back instead of partially persisting an unsupported write-set", async () => {
    const { fixture, journalId } = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const idempotencyKey = `draft-unsupported-${randomUUID()}`;
    await expect(
      executeAstroDiaryDraftCreateCommand(
        unitOfWork,
        lowLevelDraftCreateInput(fixture, journalId, idempotencyKey, "Не сохранять частично"),
        (authority, _envelope, allocation) => {
          const applied = draftCreateDecision(
            authority,
            allocation.draftId,
            fixture,
            "Не сохранять частично"
          );
          if (applied.outcome !== "applied") throw new Error("Expected an applied fixture");
          return {
            ...applied,
            writeSet: {
              ...applied.writeSet,
              cycles: [{ beforeVersion: null, after: null }]
            }
          };
        }
      )
    ).rejects.toThrow("refuses an unsupported partial write-set");
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDrafts)
        .where(eq(astroDiaryDrafts.journalId, journalId))
    ).resolves.toEqual([]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCommandReceipts)
        .where(eq(astroDiaryCommandReceipts.idempotencyKey, idempotencyKey))
    ).resolves.toEqual([]);
    await expect(
      runtime.database
        .select({ version: astroDiaryJournals.version })
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.id, journalId))
    ).resolves.toEqual([{ version: 1 }]);
  });
});

async function createJournalFixture(runtime: PostgresRuntime): Promise<{
  fixture: ActiveClientSubscriptionFixture;
  journalId: string;
}> {
  const clock = await runtime.pool.query<{ command_at: Date | string }>(
    "select clock_timestamp() as command_at"
  );
  const clockValue = clock.rows[0]?.command_at;
  const capturedAt = clockValue instanceof Date ? clockValue.toISOString() : clockValue;
  if (!capturedAt) throw new Error("Integration database clock is missing");
  const fixture = await createActiveClientSubscriptionFixture(runtime, capturedAt);
  const journalId = randomUUID();
  await runtime.database.insert(astroDiaryJournals).values({
    id: journalId,
    relationshipId: fixture.authority.relationshipId,
    journalEpochId: fixture.subscription.journalEpochId,
    astrologerUserId: fixture.authority.astrologerUserId,
    clientUserId: fixture.authority.clientUserId,
    state: "active",
    version: 1,
    createdAt: new Date(capturedAt)
  });
  return { fixture, journalId };
}

function draftCreateInput(
  fixture: ActiveClientSubscriptionFixture,
  journalId: string,
  idempotencyKey: string,
  body: string
) {
  return {
    journalId,
    idempotencyKey,
    actorUserId: fixture.authority.clientUserId,
    actorRole: "client" as const,
    request: clientDraftCreateRequest(body)
  };
}

function clientDraftCreateRequest(body: string, expectedJournalVersion = 1) {
  return {
    expectedJournalVersion,
    cycleId: null,
    kind: "client_entry" as const,
    body,
    attachmentIds: [],
    moodId: null,
    correctsItemId: null
  };
}

function lowLevelDraftCreateInput(
  fixture: ActiveClientSubscriptionFixture,
  journalId: string,
  idempotencyKey: string,
  body: string
) {
  return {
    journalId,
    idempotencyKey,
    preconditions: [{ aggregate: "journal", id: journalId, expectedVersion: 1 }] as const,
    envelope: {
      operation: "start_cycle" as const,
      actorUserId: fixture.authority.clientUserId,
      actorRole: "client" as const,
      request: { command: "create_draft", body }
    }
  };
}

function draftCreateDecision(
  authority: Parameters<Parameters<typeof executeAstroDiaryDraftCreateCommand>[2]>[0],
  draftId: string,
  fixture: ActiveClientSubscriptionFixture,
  body: string
) {
  return {
    outcome: "applied" as const,
    writeSet: {
      ...emptyWriteSet,
      journals: [
        {
          beforeVersion: authority.journal.version,
          after: { ...authority.journal, version: authority.journal.version + 1 }
        }
      ],
      drafts: [
        {
          draftId,
          beforeVersion: null,
          after: {
            id: draftId,
            journalId: authority.journal.id,
            cycleId: null,
            authorUserId: fixture.authority.clientUserId,
            authorRole: "client" as const,
            kind: "client_entry" as const,
            version: 1,
            body,
            attachmentIds: [],
            moodId: null,
            correctsItemId: null,
            updatedAt: authority.commandAt
          }
        }
      ]
    }
  };
}

const emptyWriteSet: AstroDiaryCommandWriteSet = {
  journals: [],
  cycles: [],
  drafts: [],
  obligations: [],
  allowances: [],
  timelineItems: [],
  mediaBindings: [],
  mediaReleases: [],
  mediaAccessRevocations: [],
  journalMediaAccessRevocations: [],
  itemReadAccessRevocations: [],
  contextSnapshots: [],
  contextInvalidations: [],
  derivativeCommands: [],
  erasureCommands: [],
  subscriptionTransitions: [],
  cascadeCommands: [],
  cascadeTargets: [],
  erasureFacts: [],
  readCursors: [],
  events: []
};
