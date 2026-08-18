import { createHash, randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyClientSubscriptionSourceEvent,
  consumeAvailableAllowance,
  createAstroDiaryResponseObligation,
  endSubscriptionAtPaidBoundary,
  executeClientSubscriptionAllowanceCommand,
  executeAstroDiaryParticipantDraftCreateCommand,
  executeAstroDiaryParticipantDraftUpdateCommand,
  executeOpenClientCycleCommand,
  executePublishAstrologerReplyCommand,
  hashClientSubscriptionAllowanceCommand
} from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import {
  astroDiaryCommandReceipts,
  astroDiaryContextSnapshots,
  astroDiaryCycleOpeningAllowanceFacts,
  astroDiaryCycles,
  astroDiaryDerivativeCommands,
  astroDiaryDraftAttachments,
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
import {
  clientEntitlementGrants,
  clientSubscriptionAllowanceCommandEffects,
  clientSubscriptionAllowanceCommandReceipts,
  clientSubscriptionAllowanceConsumptions,
  clientSubscriptionPeriodAllowances
} from "../../schema/client-subscriptions";
import { mediaAssets } from "../../schema/media";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";
import {
  createActiveClientSubscriptionFixture,
  createClientSubscriptionIntegrationDatabase,
  type ActiveClientSubscriptionFixture
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork } from "../client-subscriptions/drizzle-client-subscription-uow";
import {
  createDrizzleClientSubscriptionAllowanceCommandUnitOfWork,
  executeClientSubscriptionAllowanceCommandInTransaction,
  executePrelockedClientSubscriptionAllowanceCommandInTransaction
} from "../client-subscriptions/drizzle-client-subscription-allowance-uow";
import { createDrizzleAstroDiaryCommandUnitOfWork } from "./drizzle-astro-diary-command-uow";
import { createDrizzleAstroDiaryJournalReader } from "./drizzle-astro-diary-journal-reader";

type JournalFixture = Readonly<{
  fixture: ActiveClientSubscriptionFixture;
  journalId: string;
}>;

type OpenCycleFixture = JournalFixture &
  Readonly<{
    cycleId: string;
    clientEntryItemId: string;
    obligationId: string;
    journalVersion: number;
  }>;

describe.sequential("Drizzle AstroDiary paid-core command UOW", () => {
  let runtime: PostgresRuntime;
  let closeDatabase: () => Promise<void>;

  beforeAll(async () => {
    const integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
    closeDatabase = integration.close;
  }, 60_000);

  afterAll(async () => {
    await closeDatabase?.();
  }, 30_000);

  it("publishes one client entry with the complete paid write-set and replays stored identities", async () => {
    const journal = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const draftInput = clientDraftInput(journal, "Сегодня я выбираю не торопиться.");
    const created = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, draftInput);
    const replayedDraft = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      draftInput
    );
    const draftId = appliedDraftId(created);
    if (created.outcome !== "applied") throw new Error("Expected an applied client draft");
    expect(replayedDraft).toEqual({ outcome: "replayed", result: created.receipt.result });

    const idempotencyKey = `entry-${randomUUID()}`;
    const first = openClientCycleInput(journal, draftId, idempotencyKey, 2);
    const applied = await executeOpenClientCycleCommand(unitOfWork, first);
    expect(applied).toMatchObject({ outcome: "applied", response: { outcome: "applied" } });
    if (applied.outcome !== "applied") throw new Error("Expected an applied client entry");

    const retryWithFreshServerIdentities = openClientCycleInput(
      journal,
      draftId,
      idempotencyKey,
      2
    );
    const replay = await executeOpenClientCycleCommand(unitOfWork, retryWithFreshServerIdentities);
    expect(replay).toEqual({ outcome: "replayed", result: applied.receipt.result });
    expect(retryWithFreshServerIdentities.command.cycleId).not.toBe(first.command.cycleId);

    await expect(
      runtime.database
        .select({ version: astroDiaryJournals.version })
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.id, journal.journalId))
    ).resolves.toEqual([{ version: 3 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCycles)
        .where(eq(astroDiaryCycles.journalId, journal.journalId))
    ).resolves.toMatchObject([
      {
        id: first.command.cycleId,
        openingPeriodId: journal.fixture.periodId,
        state: "awaiting_astrologer_response",
        version: 1
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItems)
        .where(eq(astroDiaryTimelineItems.journalId, journal.journalId))
    ).resolves.toMatchObject([
      {
        id: first.command.entryItemId,
        cycleId: first.command.cycleId,
        cursor: 1,
        currentRevision: 1,
        kind: "client_entry"
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItemRevisions)
        .where(eq(astroDiaryTimelineItemRevisions.itemId, first.command.entryItemId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligations)
        .where(eq(astroDiaryResponseObligations.id, first.command.obligationId))
    ).resolves.toMatchObject([
      {
        cycleId: first.command.cycleId,
        triggerItemId: first.command.entryItemId,
        state: "open",
        version: 1,
        responseSlaWorkingDays: 2,
        serviceTimezone: "Europe/Moscow"
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligationWeekdays)
        .where(eq(astroDiaryResponseObligationWeekdays.obligationId, first.command.obligationId))
    ).resolves.toHaveLength(5);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionPeriodAllowances)
        .where(eq(clientSubscriptionPeriodAllowances.periodId, journal.fixture.periodId))
    ).resolves.toMatchObject([{ available: 3, reserved: 0, consumed: 1, version: 2 }]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandReceipts)
        .where(eq(clientSubscriptionAllowanceCommandReceipts.periodId, journal.fixture.periodId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandEffects)
        .where(eq(clientSubscriptionAllowanceCommandEffects.periodId, journal.fixture.periodId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceConsumptions)
        .where(eq(clientSubscriptionAllowanceConsumptions.periodId, journal.fixture.periodId))
    ).resolves.toMatchObject([
      {
        id: first.command.allowanceConsumptionId,
        source: "available",
        reservationId: null
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCycleOpeningAllowanceFacts)
        .where(eq(astroDiaryCycleOpeningAllowanceFacts.cycleId, first.command.cycleId))
    ).resolves.toMatchObject([
      {
        openingPeriodId: journal.fixture.periodId,
        openingAllowanceConsumptionId: first.command.allowanceConsumptionId,
        openingAllowanceReservationId: null
      }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryContextSnapshots)
        .where(eq(astroDiaryContextSnapshots.id, first.command.contextId))
    ).resolves.toMatchObject([
      { itemId: first.command.entryItemId, sourceItemRevision: 1, status: "pending", version: 1 }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDerivativeCommands)
        .where(eq(astroDiaryDerivativeCommands.id, first.command.derivativeCommandId))
    ).resolves.toMatchObject([
      { itemId: first.command.entryItemId, sourceRevision: 1, operation: "generate" }
    ]);

    const eventIds = Object.values(first.command.eventIds);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEvents)
        .where(inArray(astroDiaryEvents.eventId, eventIds))
    ).resolves.toHaveLength(5);
    const deliveries = await runtime.database
      .select()
      .from(astroDiaryEventDeliveries)
      .where(inArray(astroDiaryEventDeliveries.eventId, eventIds));
    expect(deliveries).toHaveLength(8);
    await expect(
      runtime.database
        .select()
        .from(outboxEvents)
        .where(
          inArray(
            outboxEvents.aggregateId,
            deliveries.map(({ id }) => id)
          )
        )
    ).resolves.toHaveLength(8);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCommandReceipts)
        .where(eq(astroDiaryCommandReceipts.idempotencyKey, idempotencyKey))
    ).resolves.toMatchObject([{ outcome: "applied", requestHash: applied.receipt.requestHash }]);
    await expect(
      runtime.database.select().from(astroDiaryDrafts).where(eq(astroDiaryDrafts.id, draftId))
    ).resolves.toEqual([]);
  });

  it("replays a server-allocated client draft after the journal version is refreshed", async () => {
    const journal = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const firstInput = clientDraftInput(journal, "Черновик остаётся тем же намерением.");
    const applied = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, firstInput);
    if (applied.outcome !== "applied") throw new Error("Expected an applied client draft");
    const retry = clientDraftInput(journal, firstInput.request.body);
    retry.idempotencyKey = firstInput.idempotencyKey;
    retry.request.expectedJournalVersion = 2;

    await expect(
      executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, retry)
    ).resolves.toEqual({ outcome: "replayed", result: applied.receipt.result });
  });

  it("replays client publication intent with refreshed journal and allowance authority", async () => {
    const journal = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInput(journal, "Повтор использует актуальное состояние сервера.")
    );
    const draftId = appliedDraftId(created);
    const idempotencyKey = `entry-refreshed-${randomUUID()}`;
    const first = openClientCycleInput(journal, draftId, idempotencyKey, 2);
    const applied = await executeOpenClientCycleCommand(unitOfWork, first);
    if (applied.outcome !== "applied") throw new Error("Expected an applied client entry");
    const retry = openClientCycleInput(journal, draftId, idempotencyKey, 3, {
      allowanceExpectedVersion: 2
    });

    await expect(executeOpenClientCycleCommand(unitOfWork, retry)).resolves.toEqual({
      outcome: "replayed",
      result: applied.receipt.result
    });
  });

  it("atomically binds ready private client media to the entry and its first revision", async () => {
    const journal = await createJournalFixture(runtime);
    const mediaId = await createReadyDiaryMedia(
      runtime,
      journal,
      journal.fixture.authority.clientUserId
    );
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInputWithMedia(journal, "Запись с приватным вложением.", [mediaId])
    );
    const draftId = appliedDraftId(created);
    await expect(
      runtime.database
        .select({ mediaId: astroDiaryDraftAttachments.mediaId })
        .from(astroDiaryDraftAttachments)
        .where(eq(astroDiaryDraftAttachments.draftId, draftId))
    ).resolves.toEqual([{ mediaId }]);
    const input = openClientCycleInput(journal, draftId, `entry-media-${randomUUID()}`, 2);

    await expect(executeOpenClientCycleCommand(unitOfWork, input)).resolves.toMatchObject({
      outcome: "applied"
    });
    await expect(
      runtime.database
        .select({
          state: astroDiaryMediaAuthorities.state,
          boundItemId: astroDiaryMediaAuthorities.boundItemId
        })
        .from(astroDiaryMediaAuthorities)
        .where(eq(astroDiaryMediaAuthorities.mediaId, mediaId))
    ).resolves.toEqual([{ state: "bound", boundItemId: input.command.entryItemId }]);
    await expect(
      runtime.database
        .select({
          mediaId: astroDiaryEntryAttachments.mediaId,
          itemId: astroDiaryEntryAttachments.itemId,
          state: astroDiaryEntryAttachments.state
        })
        .from(astroDiaryEntryAttachments)
        .where(eq(astroDiaryEntryAttachments.mediaId, mediaId))
    ).resolves.toEqual([{ mediaId, itemId: input.command.entryItemId, state: "bound" }]);
    await expect(
      runtime.database
        .select({
          mediaId: astroDiaryTimelineRevisionAttachments.mediaId,
          itemId: astroDiaryTimelineRevisionAttachments.itemId,
          revision: astroDiaryTimelineRevisionAttachments.revision
        })
        .from(astroDiaryTimelineRevisionAttachments)
        .where(eq(astroDiaryTimelineRevisionAttachments.mediaId, mediaId))
    ).resolves.toEqual([{ mediaId, itemId: input.command.entryItemId, revision: 1 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDraftAttachments)
        .where(eq(astroDiaryDraftAttachments.draftId, draftId))
    ).resolves.toEqual([]);
  });

  it("converges concurrent same-key client publications without duplicate cycle or allowance use", async () => {
    const journal = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInput(journal, "Один и тот же смысл, одна публикация.")
    );
    const draftId = appliedDraftId(created);
    const idempotencyKey = `entry-race-${randomUUID()}`;
    const leftInput = openClientCycleInput(journal, draftId, idempotencyKey, 2);
    const rightInput = openClientCycleInput(journal, draftId, idempotencyKey, 2);

    const [left, right] = await Promise.all([
      executeOpenClientCycleCommand(unitOfWork, leftInput),
      executeOpenClientCycleCommand(unitOfWork, rightInput)
    ]);

    expect([left.outcome, right.outcome].sort()).toEqual(["applied", "replayed"]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCycles)
        .where(eq(astroDiaryCycles.journalId, journal.journalId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceConsumptions)
        .where(eq(clientSubscriptionAllowanceConsumptions.periodId, journal.fixture.periodId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandReceipts)
        .where(eq(clientSubscriptionAllowanceCommandReceipts.periodId, journal.fixture.periodId))
    ).resolves.toHaveLength(1);
  });

  it("does not seal stale client publication preconditions", async () => {
    const journal = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInput(journal, "Версия журнала уже изменилась.")
    );
    const draftId = appliedDraftId(created);
    const input = openClientCycleInput(journal, draftId, `entry-stale-${randomUUID()}`, 1);

    await expect(executeOpenClientCycleCommand(unitOfWork, input)).resolves.toEqual({
      outcome: "version_conflict",
      aggregate: "journal",
      id: journal.journalId,
      expectedVersion: 1,
      currentVersion: 2
    });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCommandReceipts)
        .where(eq(astroDiaryCommandReceipts.idempotencyKey, input.idempotencyKey))
    ).resolves.toEqual([]);
  });

  it("seals a foreign client rejection without publishing or consuming allowance", async () => {
    const journal = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInput(journal, "Только владелец может опубликовать это.")
    );
    const draftId = appliedDraftId(created);
    const input = openClientCycleInput(journal, draftId, `entry-foreign-${randomUUID()}`, 2, {
      actorUserId: randomUUID()
    });

    await expect(executeOpenClientCycleCommand(unitOfWork, input)).resolves.toMatchObject({
      outcome: "rejected",
      code: "actor_mismatch",
      receipt: { result: { outcome: "rejected", code: "actor_mismatch" } }
    });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCycles)
        .where(eq(astroDiaryCycles.journalId, journal.journalId))
    ).resolves.toEqual([]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceConsumptions)
        .where(eq(clientSubscriptionAllowanceConsumptions.periodId, journal.fixture.periodId))
    ).resolves.toEqual([]);
  });

  it("seals exhausted allowance without any visible client publication", async () => {
    const journal = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInput(journal, "Лимит цикла уже исчерпан.")
    );
    const draftId = appliedDraftId(created);
    await exhaustPeriodAllowance(runtime, journal.fixture);
    const input = openClientCycleInput(journal, draftId, `entry-exhausted-${randomUUID()}`, 2, {
      allowanceExpectedVersion: 5
    });

    await expect(executeOpenClientCycleCommand(unitOfWork, input)).resolves.toMatchObject({
      outcome: "rejected",
      code: "allowance_exhausted"
    });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCycles)
        .where(eq(astroDiaryCycles.journalId, journal.journalId))
    ).resolves.toEqual([]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandReceipts)
        .where(
          eq(
            clientSubscriptionAllowanceCommandReceipts.idempotencyKey,
            input.command.allowanceIdempotencyKey
          )
        )
    ).resolves.toEqual([]);
    await expect(
      runtime.database.select().from(astroDiaryDrafts).where(eq(astroDiaryDrafts.id, draftId))
    ).resolves.toHaveLength(1);
  });

  it("rolls back every client publication effect after a late duplicate event failure", async () => {
    const journal = await createJournalFixture(runtime);
    const mediaId = await createReadyDiaryMedia(
      runtime,
      journal,
      journal.fixture.authority.clientUserId
    );
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInputWithMedia(journal, "Поздняя ошибка не должна оставить полузапись.", [mediaId])
    );
    const draftId = appliedDraftId(created);
    const input = openClientCycleInput(journal, draftId, `entry-rollback-${randomUUID()}`, 2);
    input.command.eventIds.itemPublished = input.command.eventIds.cycleOpened;
    const before = await paidCoreSnapshot(runtime, journal);
    const mediaBefore = await mediaPersistenceSnapshot(runtime, [mediaId]);

    await expect(executeOpenClientCycleCommand(unitOfWork, input)).rejects.toThrow();

    await expect(paidCoreSnapshot(runtime, journal)).resolves.toEqual(before);
    await expect(mediaPersistenceSnapshot(runtime, [mediaId])).resolves.toEqual(mediaBefore);
  });

  it("keeps Diary lock order while standalone allowance commands retain advisory serialization", async () => {
    const journal = await createJournalFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInput(journal, "Глобальный порядок блокировок остаётся единым.")
    );
    const draftId = appliedDraftId(created);
    const input = openClientCycleInput(journal, draftId, `entry-lock-order-${randomUUID()}`, 2);
    const blocker = await runtime.pool.connect();
    let execution: ReturnType<typeof executeOpenClientCycleCommand> | null = null;
    let standaloneExecution: ReturnType<typeof executeClientSubscriptionAllowanceCommand> | null =
      null;
    let blockerReleased = false;
    try {
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `client-subscription-allowance:${journal.fixture.periodId}:${input.command.allowanceIdempotencyKey}`
      ]);
      execution = executeOpenClientCycleCommand(unitOfWork, input);
      const outcome = await Promise.race([
        execution.then((result) => ({ kind: "result" as const, result })),
        delay(1_000).then(() => ({ kind: "timeout" as const }))
      ]);
      expect(outcome).toMatchObject({ kind: "result", result: { outcome: "applied" } });

      const [receipt] = await runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandReceipts)
        .where(
          eq(
            clientSubscriptionAllowanceCommandReceipts.idempotencyKey,
            input.command.allowanceIdempotencyKey
          )
        );
      if (!receipt) throw new Error("Expected the embedded allowance receipt");
      const command = consumeAvailableCommand(receipt.command);
      standaloneExecution = executeClientSubscriptionAllowanceCommand(
        createDrizzleClientSubscriptionAllowanceCommandUnitOfWork(runtime.database),
        {
          periodId: journal.fixture.periodId,
          expectedVersion: 1,
          idempotencyKey: input.command.allowanceIdempotencyKey,
          command
        },
        (current) =>
          consumeAvailableAllowance(current, {
            expectedVersion: 1,
            idempotencyKey: input.command.allowanceIdempotencyKey,
            consumptionId: command.consumptionId,
            now: command.occurredAt
          })
      );
      const standaloneWhileLocked = await Promise.race([
        standaloneExecution.then((result) => ({ kind: "result" as const, result })),
        delay(250).then(() => ({ kind: "timeout" as const }))
      ]);
      expect(standaloneWhileLocked).toEqual({ kind: "timeout" });
      await blocker.query("rollback");
      blockerReleased = true;
      await expect(standaloneExecution).resolves.toMatchObject({ outcome: "replayed" });
    } finally {
      if (!blockerReleased) await blocker.query("rollback");
      blocker.release();
      await execution?.catch(() => undefined);
      await standaloneExecution?.catch(() => undefined);
    }
  });

  it("replays a Diary allowance receipt after a standalone command waited on its allowance row", async () => {
    const journal = await createJournalFixture(runtime);
    const period = journal.fixture.subscription.paidPeriods.find(
      ({ id }) => id === journal.fixture.periodId
    );
    if (!period) throw new Error("Paid period is missing from the fixture");
    const idempotencyKey = `allowance-cross-entry-${randomUUID()}`;
    const command = {
      operation: "consume_available" as const,
      consumptionId: randomUUID(),
      occurredAt: period.startsAt
    };
    const requestHash = hashClientSubscriptionAllowanceCommand({
      periodId: journal.fixture.periodId,
      expectedVersion: 1,
      command
    });
    const input = {
      periodId: journal.fixture.periodId,
      expectedVersion: 1,
      idempotencyKey,
      requestHash,
      command,
      decide: (current: Parameters<typeof consumeAvailableAllowance>[0]) =>
        consumeAvailableAllowance(current, {
          expectedVersion: 1,
          idempotencyKey,
          consumptionId: command.consumptionId,
          now: command.occurredAt
        })
    };
    let releaseDiary: () => void = () => {};
    const diaryMayPersist = new Promise<void>((resolve) => {
      releaseDiary = resolve;
    });
    let markDiaryLocked: () => void = () => {};
    const diaryLocked = new Promise<void>((resolve) => {
      markDiaryLocked = resolve;
    });
    const diaryExecution = runtime.database.transaction(async (transaction) => {
      await transaction
        .select({ periodId: clientSubscriptionPeriodAllowances.periodId })
        .from(clientSubscriptionPeriodAllowances)
        .where(eq(clientSubscriptionPeriodAllowances.periodId, journal.fixture.periodId))
        .for("update");
      markDiaryLocked();
      await diaryMayPersist;
      return executePrelockedClientSubscriptionAllowanceCommandInTransaction(transaction, input);
    });
    await diaryLocked;

    const applicationName = `astro-diary-allowance-race-${randomUUID()}`;
    const standaloneExecution = runtime.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('application_name', ${applicationName}, true)`
      );
      return executeClientSubscriptionAllowanceCommandInTransaction(transaction, input);
    });
    try {
      await waitForDatabaseLock(runtime, applicationName);
      releaseDiary();
      const [diary, standalone] = await Promise.all([diaryExecution, standaloneExecution]);
      expect(diary).toMatchObject({ outcome: "applied" });
      expect(standalone).toMatchObject({ outcome: "replayed" });
    } finally {
      releaseDiary();
      await diaryExecution.catch(() => undefined);
      await standaloneExecution.catch(() => undefined);
    }
  });

  it("closes one exact paid cycle atomically and replays the stored closing reply", async () => {
    const opened = await createOpenCycleFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const draftInput = astrologerReplyDraftInput(opened, "Ответ сохраняет границы цикла.");
    const created = await executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, draftInput);
    const replayedDraft = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      draftInput
    );
    const draftId = appliedDraftId(created);
    if (created.outcome !== "applied") throw new Error("Expected an applied astrologer draft");
    expect(replayedDraft).toEqual({ outcome: "replayed", result: created.receipt.result });
    const idempotencyKey = `reply-${randomUUID()}`;
    const first = closingReplyInput(opened, draftId, idempotencyKey, opened.journalVersion + 1);

    const applied = await executePublishAstrologerReplyCommand(unitOfWork, first);
    expect(applied).toMatchObject({ outcome: "applied", response: { outcome: "applied" } });
    if (applied.outcome !== "applied") throw new Error("Expected an applied closing reply");
    const freshServerIdentities = closingReplyInput(
      opened,
      draftId,
      idempotencyKey,
      opened.journalVersion + 1
    );
    await expect(
      executePublishAstrologerReplyCommand(unitOfWork, freshServerIdentities)
    ).resolves.toEqual({ outcome: "replayed", result: applied.receipt.result });
    expect(freshServerIdentities.command.replyItemId).not.toBe(first.command.replyItemId);

    await expect(
      runtime.database
        .select({ version: astroDiaryJournals.version })
        .from(astroDiaryJournals)
        .where(eq(astroDiaryJournals.id, opened.journalId))
    ).resolves.toEqual([{ version: 5 }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCycles)
        .where(eq(astroDiaryCycles.id, opened.cycleId))
    ).resolves.toMatchObject([{ state: "closed", version: 2, closeReason: "completed" }]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryResponseObligations)
        .where(eq(astroDiaryResponseObligations.id, opened.obligationId))
    ).resolves.toMatchObject([
      { state: "satisfied", version: 2, satisfiedByItemId: first.command.replyItemId }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItems)
        .where(eq(astroDiaryTimelineItems.id, first.command.replyItemId))
    ).resolves.toMatchObject([
      { kind: "astrologer_reply", cycleId: opened.cycleId, cursor: 2, currentRevision: 1 }
    ]);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryTimelineItemRevisions)
        .where(eq(astroDiaryTimelineItemRevisions.itemId, first.command.replyItemId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryDerivativeCommands)
        .where(eq(astroDiaryDerivativeCommands.id, first.command.derivativeCommandId))
    ).resolves.toMatchObject([
      { itemId: first.command.replyItemId, sourceRevision: 1, operation: "generate" }
    ]);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandReceipts)
        .where(eq(clientSubscriptionAllowanceCommandReceipts.periodId, opened.fixture.periodId))
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceConsumptions)
        .where(eq(clientSubscriptionAllowanceConsumptions.periodId, opened.fixture.periodId))
    ).resolves.toHaveLength(1);
    const eventIds = Object.values(first.command.eventIds);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryEvents)
        .where(inArray(astroDiaryEvents.eventId, eventIds))
    ).resolves.toHaveLength(4);
    const deliveries = await runtime.database
      .select()
      .from(astroDiaryEventDeliveries)
      .where(inArray(astroDiaryEventDeliveries.eventId, eventIds));
    expect(deliveries).toHaveLength(6);
    await expect(
      runtime.database
        .select()
        .from(outboxEvents)
        .where(
          inArray(
            outboxEvents.aggregateId,
            deliveries.map(({ id }) => id)
          )
        )
    ).resolves.toHaveLength(6);
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCommandReceipts)
        .where(eq(astroDiaryCommandReceipts.idempotencyKey, idempotencyKey))
    ).resolves.toMatchObject([{ outcome: "applied", requestHash: applied.receipt.requestHash }]);
    await expect(
      runtime.database.select().from(astroDiaryDrafts).where(eq(astroDiaryDrafts.id, draftId))
    ).resolves.toEqual([]);
  });

  it("replays closing intent with refreshed journal, cycle, and obligation authority", async () => {
    const opened = await createOpenCycleFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      astrologerReplyDraftInput(opened, "Повтор ответа использует свежие версии сервера.")
    );
    const draftId = appliedDraftId(created);
    const idempotencyKey = `reply-refreshed-${randomUUID()}`;
    const first = closingReplyInput(opened, draftId, idempotencyKey, opened.journalVersion + 1);
    const applied = await executePublishAstrologerReplyCommand(unitOfWork, first);
    if (applied.outcome !== "applied") throw new Error("Expected an applied closing reply");
    const retry = closingReplyInput(opened, draftId, idempotencyKey, 5);
    retry.command.expectedCycleVersion = 2;
    retry.command.expectedObligationVersion = 2;

    await expect(executePublishAstrologerReplyCommand(unitOfWork, retry)).resolves.toEqual({
      outcome: "replayed",
      result: applied.receipt.result
    });
  });

  it("replays cycle-A draft and closing receipts after cycle B becomes current", async () => {
    const openedA = await createOpenCycleFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const replyBody = "Повтор относится к уже закрытому циклу A.";
    const firstDraftInput = astrologerReplyDraftInput(openedA, replyBody);
    const firstDraft = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      firstDraftInput
    );
    const replyDraftId = appliedDraftId(firstDraft);
    if (firstDraft.outcome !== "applied") throw new Error("Expected an applied reply draft");

    const closingKey = `reply-old-cycle-${randomUUID()}`;
    const firstClosing = closingReplyInput(
      openedA,
      replyDraftId,
      closingKey,
      openedA.journalVersion + 1
    );
    const closedA = await executePublishAstrologerReplyCommand(unitOfWork, firstClosing);
    if (closedA.outcome !== "applied") throw new Error("Expected cycle A to close");

    const secondClientDraftInput = clientDraftInput(openedA, "Новая запись открывает цикл B.");
    secondClientDraftInput.request.expectedJournalVersion = 5;
    const secondClientDraft = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      secondClientDraftInput
    );
    const secondClientDraftId = appliedDraftId(secondClientDraft);
    const openingB = openClientCycleInput(openedA, secondClientDraftId, `open-b-${randomUUID()}`, 6, {
      allowanceExpectedVersion: 2
    });
    const openedBResult = await executeOpenClientCycleCommand(unitOfWork, openingB);
    if (openedBResult.outcome !== "applied") throw new Error("Expected cycle B to open");
    const openedB: OpenCycleFixture = {
      ...openedA,
      cycleId: openingB.command.cycleId,
      clientEntryItemId: openingB.command.entryItemId,
      obligationId: openingB.command.obligationId,
      journalVersion: 7
    };

    const draftRetry = astrologerReplyDraftInput(openedB, replyBody);
    draftRetry.idempotencyKey = firstDraftInput.idempotencyKey;
    await expect(
      executeAstroDiaryParticipantDraftCreateCommand(unitOfWork, draftRetry)
    ).resolves.toEqual({ outcome: "replayed", result: firstDraft.receipt.result });

    const closingRetry = closingReplyInput(openedB, replyDraftId, closingKey, 7);
    await expect(executePublishAstrologerReplyCommand(unitOfWork, closingRetry)).resolves.toEqual({
      outcome: "replayed",
      result: closedA.receipt.result
    });
    const conflictingRetry = closingReplyInput(openedB, randomUUID(), closingKey, 7);
    await expect(
      executePublishAstrologerReplyCommand(unitOfWork, conflictingRetry)
    ).resolves.toEqual({ outcome: "idempotency_conflict" });
  });

  it("conceals cross-participant private draft and pending-media state before owner CAS", async () => {
    const opened = await createOpenCycleFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      astrologerReplyDraftInput(opened, "Владелец сохраняет приватный ответ.")
    );
    const replyDraftId = appliedDraftId(created);
    const foreignDraftKey = `foreign-draft-${randomUUID()}`;
    const foreignDraftUpdate = {
      journalId: opened.journalId,
      idempotencyKey: foreignDraftKey,
      actorUserId: opened.fixture.authority.clientUserId,
      actorRole: "client" as const,
      request: {
        expectedJournalVersion: 4,
        draftId: replyDraftId,
        expectedDraftVersion: 73,
        body: "Версия чужого черновика не раскрывается.",
        attachmentIds: [],
        moodId: "calm" as const
      }
    };
    await expect(
      executeAstroDiaryParticipantDraftUpdateCommand(unitOfWork, foreignDraftUpdate)
    ).resolves.toEqual({ outcome: "not_found" });

    const clientPendingMediaId = await createPendingDiaryMedia(
      runtime,
      opened,
      opened.fixture.authority.clientUserId
    );
    const foreignMediaKey = `foreign-media-${randomUUID()}`;
    const foreignMediaUpdate = {
      journalId: opened.journalId,
      idempotencyKey: foreignMediaKey,
      actorUserId: opened.fixture.authority.astrologerUserId,
      actorRole: "astrologer" as const,
      request: {
        expectedJournalVersion: 4,
        draftId: replyDraftId,
        expectedDraftVersion: 1,
        body: "Pending media другого участника не раскрывается.",
        attachmentIds: [clientPendingMediaId],
        moodId: null
      }
    };
    await expect(
      executeAstroDiaryParticipantDraftUpdateCommand(unitOfWork, foreignMediaUpdate)
    ).resolves.toEqual({ outcome: "not_found" });

    const ownerStaleKey = `owner-stale-${randomUUID()}`;
    const ownerStaleUpdate = {
      ...foreignMediaUpdate,
      idempotencyKey: ownerStaleKey,
      request: {
        ...foreignMediaUpdate.request,
        expectedDraftVersion: 73,
        attachmentIds: []
      }
    };
    await expect(
      executeAstroDiaryParticipantDraftUpdateCommand(unitOfWork, ownerStaleUpdate)
    ).resolves.toMatchObject({
      outcome: "version_conflict",
      aggregate: "draft",
      id: replyDraftId,
      expectedVersion: 73,
      currentVersion: 1
    });

    const ownerUpdate = {
      ...foreignMediaUpdate,
      idempotencyKey: `owner-update-${randomUUID()}`,
      request: {
        ...foreignMediaUpdate.request,
        body: "Владелец обновляет собственный черновик.",
        attachmentIds: []
      }
    };
    const applied = await executeAstroDiaryParticipantDraftUpdateCommand(unitOfWork, ownerUpdate);
    if (applied.outcome !== "applied") throw new Error("Expected an owner draft update");
    await expect(
      executeAstroDiaryParticipantDraftUpdateCommand(unitOfWork, ownerUpdate)
    ).resolves.toEqual({ outcome: "replayed", result: applied.receipt.result });

    await expect(
      runtime.database
        .select({ idempotencyKey: astroDiaryCommandReceipts.idempotencyKey })
        .from(astroDiaryCommandReceipts)
        .where(inArray(astroDiaryCommandReceipts.idempotencyKey, [foreignDraftKey, foreignMediaKey]))
    ).resolves.toEqual([]);
  });

  it("atomically binds ready private astrologer media to the reply and its first revision", async () => {
    const opened = await createOpenCycleFixture(runtime);
    const mediaId = await createReadyDiaryMedia(
      runtime,
      opened,
      opened.fixture.authority.astrologerUserId
    );
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      astrologerReplyDraftInputWithMedia(opened, "Ответ с приватным вложением.", [mediaId])
    );
    const draftId = appliedDraftId(created);
    const input = closingReplyInput(
      opened,
      draftId,
      `reply-media-${randomUUID()}`,
      opened.journalVersion + 1
    );

    await expect(executePublishAstrologerReplyCommand(unitOfWork, input)).resolves.toMatchObject({
      outcome: "applied"
    });
    await expect(
      runtime.database
        .select({
          state: astroDiaryMediaAuthorities.state,
          boundItemId: astroDiaryMediaAuthorities.boundItemId
        })
        .from(astroDiaryMediaAuthorities)
        .where(eq(astroDiaryMediaAuthorities.mediaId, mediaId))
    ).resolves.toEqual([{ state: "bound", boundItemId: input.command.replyItemId }]);
    await expect(
      runtime.database
        .select({
          mediaId: astroDiaryEntryAttachments.mediaId,
          itemId: astroDiaryEntryAttachments.itemId,
          state: astroDiaryEntryAttachments.state
        })
        .from(astroDiaryEntryAttachments)
        .where(eq(astroDiaryEntryAttachments.mediaId, mediaId))
    ).resolves.toEqual([{ mediaId, itemId: input.command.replyItemId, state: "bound" }]);
    await expect(
      runtime.database
        .select({
          mediaId: astroDiaryTimelineRevisionAttachments.mediaId,
          itemId: astroDiaryTimelineRevisionAttachments.itemId,
          revision: astroDiaryTimelineRevisionAttachments.revision
        })
        .from(astroDiaryTimelineRevisionAttachments)
        .where(eq(astroDiaryTimelineRevisionAttachments.mediaId, mediaId))
    ).resolves.toEqual([{ mediaId, itemId: input.command.replyItemId, revision: 1 }]);
  });

  it("rejects a closing reply after the paid entitlement ended", async () => {
    const opened = await createOpenCycleFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      astrologerReplyDraftInput(opened, "После окончания доступа запись запрещена.")
    );
    const draftId = appliedDraftId(created);
    await endPaidSubscription(runtime, opened.fixture);
    const reader = createDrizzleAstroDiaryJournalReader(runtime.database);
    const endedAt =
      opened.fixture.subscription.paidPeriods.find(({ id }) => id === opened.fixture.periodId)
        ?.endsAt ?? "";
    await expect(
      reader.getParticipantJournalSummary({
        participantUserId: opened.fixture.authority.astrologerUserId,
        participantRole: "astrologer",
        journalId: opened.journalId,
        now: endedAt
      })
    ).resolves.toMatchObject({ access: { mode: "read_only", subscriptionState: "ended" } });
    await expect(
      reader.getPaidCoreCommandContext({
        participantUserId: opened.fixture.authority.astrologerUserId,
        participantRole: "astrologer",
        journalId: opened.journalId,
        now: endedAt
      })
    ).resolves.toMatchObject({ activePeriod: null });
    const input = closingReplyInput(
      opened,
      draftId,
      `reply-ended-${randomUUID()}`,
      opened.journalVersion + 1
    );

    await expect(executePublishAstrologerReplyCommand(unitOfWork, input)).resolves.toMatchObject({
      outcome: "rejected",
      code: "paid_access_ended"
    });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCycles)
        .where(eq(astroDiaryCycles.id, opened.cycleId))
    ).resolves.toMatchObject([{ state: "awaiting_astrologer_response", version: 1 }]);
  });

  it("rejects closing when the persisted response deadline no longer matches paid terms", async () => {
    const opened = await createOpenCycleFixture(runtime);
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      astrologerReplyDraftInput(opened, "Срок ответа должен быть доказан контрактом.")
    );
    const draftId = appliedDraftId(created);
    const [current] = await runtime.database
      .select()
      .from(astroDiaryResponseObligations)
      .where(eq(astroDiaryResponseObligations.id, opened.obligationId));
    if (!current) throw new Error("Expected the response obligation");
    const mismatched = createAstroDiaryResponseObligation({
      obligationId: current.id,
      journalId: current.journalId,
      cycleId: current.cycleId,
      triggerItemId: current.triggerItemId,
      openedAt: current.openedAt.toISOString(),
      responseSlaWorkingDays: 3,
      workingWeekdays: [1, 2, 3, 4, 5],
      serviceTimezone: "Europe/Moscow"
    });
    await injectPersistedDeadlineMismatch(runtime, opened.obligationId, mismatched);
    const input = closingReplyInput(
      opened,
      draftId,
      `reply-deadline-${randomUUID()}`,
      opened.journalVersion + 1
    );

    await expect(executePublishAstrologerReplyCommand(unitOfWork, input)).resolves.toMatchObject({
      outcome: "rejected",
      code: "obligation_deadline_conflict"
    });
    await expect(
      runtime.database
        .select()
        .from(astroDiaryCycles)
        .where(eq(astroDiaryCycles.id, opened.cycleId))
    ).resolves.toMatchObject([{ state: "awaiting_astrologer_response", version: 1 }]);
  });

  it("rolls back every closing-reply effect after a late duplicate event failure", async () => {
    const opened = await createOpenCycleFixture(runtime);
    const mediaId = await createReadyDiaryMedia(
      runtime,
      opened,
      opened.fixture.authority.astrologerUserId
    );
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      astrologerReplyDraftInputWithMedia(opened, "Ошибка доставки не закрывает цикл частично.", [
        mediaId
      ])
    );
    const draftId = appliedDraftId(created);
    const input = closingReplyInput(
      opened,
      draftId,
      `reply-rollback-${randomUUID()}`,
      opened.journalVersion + 1
    );
    input.command.eventIds.obligationSatisfied = input.command.eventIds.itemPublished;
    const before = await paidCoreSnapshot(runtime, opened);
    const mediaBefore = await mediaPersistenceSnapshot(runtime, [mediaId]);

    await expect(executePublishAstrologerReplyCommand(unitOfWork, input)).rejects.toThrow();

    await expect(paidCoreSnapshot(runtime, opened)).resolves.toEqual(before);
    await expect(mediaPersistenceSnapshot(runtime, [mediaId])).resolves.toEqual(mediaBefore);
  });

  it("reads the same paid journal through client and astrologer scopes without foreign leakage", async () => {
    const opened = await createOpenCycleFixture(runtime);
    const replyAttachmentId = await createReadyDiaryMedia(
      runtime,
      opened,
      opened.fixture.authority.astrologerUserId
    );
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const createdReply = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      astrologerReplyDraftInputWithMedia(opened, "Сохранённый ответ", [replyAttachmentId])
    );
    const replyDraftId = appliedDraftId(createdReply);
    const reader = createDrizzleAstroDiaryJournalReader(runtime.database);
    const [clock] = (
      await runtime.pool.query<{ command_at: Date }>("select clock_timestamp() as command_at")
    ).rows;
    if (!clock) throw new Error("Integration database clock is missing");
    const now = clock.command_at.toISOString();

    const [clientList, astrologerList, clientSummary, clientTimeline, astrologerTimeline, replyDraft, context] =
      await Promise.all([
        reader.listParticipantJournals({
          participantUserId: opened.fixture.authority.clientUserId,
          participantRole: "client",
          limit: 100,
          now
        }),
        reader.listParticipantJournals({
          participantUserId: opened.fixture.authority.astrologerUserId,
          participantRole: "astrologer",
          limit: 100,
          now
        }),
        reader.getParticipantJournalSummary({
          participantUserId: opened.fixture.authority.clientUserId,
          participantRole: "client",
          journalId: opened.journalId,
          now
        }),
        reader.getParticipantJournalTimeline({
          participantUserId: opened.fixture.authority.clientUserId,
          participantRole: "client",
          journalId: opened.journalId,
          afterCursor: 0,
          limit: 50
        }),
        reader.getParticipantJournalTimeline({
          participantUserId: opened.fixture.authority.astrologerUserId,
          participantRole: "astrologer",
          journalId: opened.journalId,
          afterCursor: 0,
          limit: 50
        }),
        reader.getParticipantAstrologerReplyDraft({
          participantUserId: opened.fixture.authority.astrologerUserId,
          participantRole: "astrologer",
          journalId: opened.journalId,
          now
        }),
        reader.getPaidCoreCommandContext({
          participantUserId: opened.fixture.authority.astrologerUserId,
          participantRole: "astrologer",
          journalId: opened.journalId,
          now
        })
      ]);

    expect(clientList.journals.map(({ journal }) => journal.id)).toContain(opened.journalId);
    expect(astrologerList.journals.map(({ journal }) => journal.id)).toContain(opened.journalId);
    expect(clientSummary?.journal.id).toBe(opened.journalId);
    expect(clientTimeline?.items.map(({ id }) => id)).toContain(opened.clientEntryItemId);
    expect(astrologerTimeline).toEqual(clientTimeline);
    expect(replyDraft).toEqual({
      draft: {
        draftId: replyDraftId,
        version: 1,
        body: "Сохранённый ответ",
        attachmentIds: [replyAttachmentId]
      }
    });
    expect(context).toMatchObject({
      activePeriod: { id: opened.fixture.periodId },
      currentCycle: { id: opened.cycleId },
      currentObligation: { id: opened.obligationId }
    });

    await expect(
      reader.getParticipantJournalSummary({
        participantUserId: randomUUID(),
        participantRole: "client",
        journalId: opened.journalId,
        now
      })
    ).resolves.toBeNull();
    await expect(
      reader.getParticipantAstrologerReplyDraft({
        participantUserId: randomUUID(),
        participantRole: "astrologer",
        journalId: opened.journalId,
        now
      })
    ).resolves.toBeNull();
    await expect(
      reader.getParticipantAstrologerReplyDraft({
        participantUserId: opened.fixture.authority.clientUserId,
        participantRole: "client",
        journalId: opened.journalId,
        now
      })
    ).resolves.toBeNull();
    await expect(
      reader.getPaidCoreCommandContext({
        participantUserId: randomUUID(),
        participantRole: "astrologer",
        journalId: opened.journalId,
        now
      })
    ).resolves.toBeNull();
  });

  it("hydrates only the owning client's unpublished entry draft", async () => {
    const journal = await createJournalFixture(runtime);
    const clientAttachmentId = await createReadyDiaryMedia(
      runtime,
      journal,
      journal.fixture.authority.clientUserId
    );
    const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
    const created = await executeAstroDiaryParticipantDraftCreateCommand(
      unitOfWork,
      clientDraftInputWithMedia(journal, "Черновик клиента после перезагрузки", [
        clientAttachmentId
      ])
    );
    const clientDraftId = appliedDraftId(created);
    const reader = createDrizzleAstroDiaryJournalReader(runtime.database);
    const [clock] = (
      await runtime.pool.query<{ command_at: Date }>("select clock_timestamp() as command_at")
    ).rows;
    if (!clock) throw new Error("Integration database clock is missing");
    const now = clock.command_at.toISOString();

    await expect(
      reader.getParticipantClientEntryDraft({
        participantUserId: journal.fixture.authority.clientUserId,
        participantRole: "client",
        journalId: journal.journalId,
        now
      })
    ).resolves.toEqual({
      draft: {
        draftId: clientDraftId,
        version: 1,
        body: "Черновик клиента после перезагрузки",
        moodId: "calm",
        attachmentIds: [clientAttachmentId]
      }
    });
    await expect(
      reader.getParticipantClientEntryDraft({
        participantUserId: randomUUID(),
        participantRole: "client",
        journalId: journal.journalId,
        now
      })
    ).resolves.toBeNull();
    await expect(
      reader.getParticipantClientEntryDraft({
        participantUserId: journal.fixture.authority.astrologerUserId,
        participantRole: "astrologer",
        journalId: journal.journalId,
        now
      })
    ).resolves.toBeNull();
  });
});

async function createJournalFixture(runtime: PostgresRuntime): Promise<JournalFixture> {
  const [clock] = (
    await runtime.pool.query<{ command_at: Date }>("select clock_timestamp() as command_at")
  ).rows;
  if (!clock) throw new Error("Integration database clock is missing");
  const fixture = await createActiveClientSubscriptionFixture(
    runtime,
    clock.command_at.toISOString()
  );
  const journalId = randomUUID();
  await runtime.database.insert(astroDiaryJournals).values({
    id: journalId,
    relationshipId: fixture.authority.relationshipId,
    journalEpochId: fixture.subscription.journalEpochId,
    astrologerUserId: fixture.authority.astrologerUserId,
    clientUserId: fixture.authority.clientUserId,
    state: "active",
    version: 1,
    createdAt: clock.command_at
  });
  return { fixture, journalId };
}

async function createOpenCycleFixture(runtime: PostgresRuntime): Promise<OpenCycleFixture> {
  const journal = await createJournalFixture(runtime);
  const unitOfWork = createDrizzleAstroDiaryCommandUnitOfWork(runtime.database);
  const created = await executeAstroDiaryParticipantDraftCreateCommand(
    unitOfWork,
    clientDraftInput(journal, "Мне важно заметить собственный ритм.")
  );
  const draftId = appliedDraftId(created);
  const opened = openClientCycleInput(journal, draftId, `open-${randomUUID()}`, 2);
  const result = await executeOpenClientCycleCommand(unitOfWork, opened);
  if (result.outcome !== "applied") {
    throw new Error(`Expected an open client cycle, received ${result.outcome}`);
  }
  return {
    ...journal,
    cycleId: opened.command.cycleId,
    clientEntryItemId: opened.command.entryItemId,
    obligationId: opened.command.obligationId,
    journalVersion: 3
  };
}

async function createReadyDiaryMedia(
  runtime: PostgresRuntime,
  journal: JournalFixture,
  ownerUserId: string
): Promise<string> {
  const [clock] = (
    await runtime.pool.query<{ command_at: Date }>("select clock_timestamp() as command_at")
  ).rows;
  if (!clock) throw new Error("Integration database clock is missing");
  const mediaId = randomUUID();
  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(mediaAssets).values({
      id: mediaId,
      ownerUserId,
      purpose: "astro_diary_attachment",
      status: "ready",
      visibility: "private",
      storageBucket: "astro-diary-integration",
      storageKey: `${journal.journalId}/${mediaId}`,
      originalFileName: `${mediaId}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 128,
      checksumSha256: "a".repeat(64),
      width: null,
      height: null,
      altText: null,
      failureReason: null,
      createdAt: clock.command_at,
      updatedAt: clock.command_at
    });
    await transaction.insert(astroDiaryMediaAuthorities).values({
      mediaId,
      journalId: journal.journalId,
      ownerUserId,
      purpose: "astro_diary_attachment",
      visibility: "private",
      state: "pending",
      boundItemId: null,
      readyAt: null,
      boundAt: null,
      createdAt: clock.command_at,
      updatedAt: clock.command_at
    });
    await transaction
      .update(astroDiaryMediaAuthorities)
      .set({ state: "ready", readyAt: clock.command_at, updatedAt: clock.command_at })
      .where(eq(astroDiaryMediaAuthorities.mediaId, mediaId));
  });
  return mediaId;
}

async function createPendingDiaryMedia(
  runtime: PostgresRuntime,
  journal: JournalFixture,
  ownerUserId: string
): Promise<string> {
  const [clock] = (
    await runtime.pool.query<{ command_at: Date }>("select clock_timestamp() as command_at")
  ).rows;
  if (!clock) throw new Error("Integration database clock is missing");
  const mediaId = randomUUID();
  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(mediaAssets).values({
      id: mediaId,
      ownerUserId,
      purpose: "astro_diary_attachment",
      status: "uploading",
      visibility: "private",
      storageBucket: "astro-diary-integration",
      storageKey: `${journal.journalId}/${mediaId}`,
      originalFileName: `${mediaId}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 128,
      checksumSha256: null,
      width: null,
      height: null,
      altText: null,
      failureReason: null,
      createdAt: clock.command_at,
      updatedAt: clock.command_at
    });
    await transaction.insert(astroDiaryMediaAuthorities).values({
      mediaId,
      journalId: journal.journalId,
      ownerUserId,
      purpose: "astro_diary_attachment",
      visibility: "private",
      state: "pending",
      boundItemId: null,
      readyAt: null,
      boundAt: null,
      createdAt: clock.command_at,
      updatedAt: clock.command_at
    });
  });
  return mediaId;
}

function clientDraftInput(journal: JournalFixture, body: string) {
  return {
    journalId: journal.journalId,
    idempotencyKey: `client-draft-${randomUUID()}`,
    actorUserId: journal.fixture.authority.clientUserId,
    actorRole: "client" as const,
    request: {
      expectedJournalVersion: 1,
      cycleId: null,
      kind: "client_entry" as const,
      body,
      attachmentIds: [],
      moodId: "calm" as const,
      correctsItemId: null
    }
  };
}

function clientDraftInputWithMedia(
  journal: JournalFixture,
  body: string,
  attachmentIds: readonly string[]
) {
  const input = clientDraftInput(journal, body);
  return {
    ...input,
    request: { ...input.request, attachmentIds: [...attachmentIds] }
  };
}

function astrologerReplyDraftInput(opened: OpenCycleFixture, body: string) {
  return {
    journalId: opened.journalId,
    idempotencyKey: `reply-draft-${randomUUID()}`,
    actorUserId: opened.fixture.authority.astrologerUserId,
    actorRole: "astrologer" as const,
    request: {
      expectedJournalVersion: opened.journalVersion,
      cycleId: opened.cycleId,
      kind: "astrologer_reply" as const,
      body,
      attachmentIds: [],
      moodId: null,
      correctsItemId: null
    }
  };
}

function astrologerReplyDraftInputWithMedia(
  opened: OpenCycleFixture,
  body: string,
  attachmentIds: readonly string[]
) {
  const input = astrologerReplyDraftInput(opened, body);
  return {
    ...input,
    request: { ...input.request, attachmentIds: [...attachmentIds] }
  };
}

function openClientCycleInput(
  journal: JournalFixture,
  draftId: string,
  idempotencyKey: string,
  expectedJournalVersion: number,
  override: Readonly<{ actorUserId?: string; allowanceExpectedVersion?: number }> = {}
) {
  return {
    journalId: journal.journalId,
    expectedJournalVersion,
    idempotencyKey,
    command: {
      actorUserId: override.actorUserId ?? journal.fixture.authority.clientUserId,
      draftId,
      expectedDraftVersion: 1,
      cycleId: randomUUID(),
      entryItemId: randomUUID(),
      obligationId: randomUUID(),
      contextId: randomUUID(),
      derivativeCommandId: randomUUID(),
      allowancePeriodId: journal.fixture.periodId,
      allowanceExpectedVersion: override.allowanceExpectedVersion ?? 1,
      allowanceIdempotencyKey: `allowance-${randomUUID()}`,
      allowanceConsumptionId: randomUUID(),
      eventIds: {
        cycleOpened: randomUUID(),
        itemPublished: randomUUID(),
        obligationCreated: randomUUID(),
        contextRequested: randomUUID(),
        derivativeRequested: randomUUID()
      }
    }
  };
}

async function injectPersistedDeadlineMismatch(
  runtime: PostgresRuntime,
  obligationId: string,
  mismatch: Readonly<{
    dueAt: string;
    responseSlaWorkingDays: number;
    resolvedDueLocal: string;
    resolvedDueOffset: string;
  }>
): Promise<void> {
  const connection = await runtime.pool.connect();
  try {
    // Production writers cannot mutate SLA evidence. This isolated-database injection proves that
    // the closing command still fails closed if pre-existing persisted evidence is inconsistent.
    await connection.query(
      "alter table astro_diary_response_obligations disable trigger astro_diary_response_obligations_version_guard"
    );
    await connection.query(
      `update astro_diary_response_obligations
          set due_at = $1,
              response_sla_working_days = $2,
              resolved_due_local = $3,
              resolved_due_offset = $4
        where id = $5`,
      [
        mismatch.dueAt,
        mismatch.responseSlaWorkingDays,
        mismatch.resolvedDueLocal,
        mismatch.resolvedDueOffset,
        obligationId
      ]
    );
  } finally {
    await connection.query(
      "alter table astro_diary_response_obligations enable trigger astro_diary_response_obligations_version_guard"
    );
    connection.release();
  }
}

async function exhaustPeriodAllowance(
  runtime: PostgresRuntime,
  fixture: ActiveClientSubscriptionFixture
): Promise<void> {
  const period = fixture.subscription.paidPeriods.find(({ id }) => id === fixture.periodId);
  if (!period) throw new Error("Paid period is missing from the fixture");
  const unitOfWork = createDrizzleClientSubscriptionAllowanceCommandUnitOfWork(runtime.database);
  for (let expectedVersion = 1; expectedVersion <= 4; expectedVersion += 1) {
    const idempotencyKey = `exhaust-${randomUUID()}`;
    const consumptionId = randomUUID();
    const result = await executeClientSubscriptionAllowanceCommand(
      unitOfWork,
      {
        periodId: fixture.periodId,
        expectedVersion,
        idempotencyKey,
        command: {
          operation: "consume_available",
          consumptionId,
          occurredAt: period.startsAt
        }
      },
      (current) =>
        consumeAvailableAllowance(current, {
          expectedVersion,
          idempotencyKey,
          consumptionId,
          now: period.startsAt
        })
    );
    if (result.outcome !== "applied") {
      throw new Error(`Expected allowance exhaustion setup, received ${result.outcome}`);
    }
  }
}

function closingReplyInput(
  opened: OpenCycleFixture,
  draftId: string,
  idempotencyKey: string,
  expectedJournalVersion: number
) {
  return {
    journalId: opened.journalId,
    expectedJournalVersion,
    idempotencyKey,
    command: {
      mode: "close" as const,
      actorUserId: opened.fixture.authority.astrologerUserId,
      cycleId: opened.cycleId,
      expectedCycleVersion: 1,
      obligationId: opened.obligationId,
      expectedObligationVersion: 1,
      replyDraftId: draftId,
      expectedReplyDraftVersion: 1,
      replyItemId: randomUUID(),
      derivativeCommandId: randomUUID(),
      eventIds: {
        itemPublished: randomUUID(),
        obligationSatisfied: randomUUID(),
        cycleClosed: randomUUID(),
        derivativeRequested: randomUUID()
      }
    }
  };
}

function appliedDraftId(
  result: Awaited<ReturnType<typeof executeAstroDiaryParticipantDraftCreateCommand>>
): string {
  if (result.outcome !== "applied" || result.response.resource === null) {
    throw new Error(`Expected an applied server-allocated draft, received ${result.outcome}`);
  }
  return result.response.resource.draftId;
}

async function endPaidSubscription(
  runtime: PostgresRuntime,
  fixture: ActiveClientSubscriptionFixture
): Promise<void> {
  const period = fixture.subscription.paidPeriods.find(({ id }) => id === fixture.periodId);
  if (!period) throw new Error("Paid period is missing from the fixture");
  const sourceEventId = randomUUID();
  const evidenceId = randomUUID();
  const result = await applyClientSubscriptionSourceEvent(
    createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(runtime.database),
    {
      subscriptionId: fixture.subscription.id,
      expectedVersion: fixture.subscription.version,
      sourceEventId,
      sourceEventDigest: sha256(sourceEventId),
      evidenceId
    },
    (current) =>
      endSubscriptionAtPaidBoundary(current, {
        now: period.endsAt,
        eventIds: [randomUUID(), randomUUID()]
      })
  );
  if (result.outcome !== "applied") {
    throw new Error(`Expected paid-boundary end, received ${result.outcome}`);
  }
  await expect(
    runtime.database
      .select()
      .from(clientEntitlementGrants)
      .where(eq(clientEntitlementGrants.subscriptionId, fixture.subscription.id))
  ).resolves.toMatchObject([{ state: "ended" }]);
}

async function paidCoreSnapshot(runtime: PostgresRuntime, journal: JournalFixture) {
  const counts = await runtime.pool.query<{
    journal_version: number;
    drafts: number;
    cycles: number;
    items: number;
    revisions: number;
    obligations: number;
    contexts: number;
    derivatives: number;
    diary_receipts: number;
    allowance_receipts: number;
    allowance_effects: number;
    allowance_consumptions: number;
    allowance_facts: number;
    events: number;
    deliveries: number;
    outbox: number;
    allowance_head: unknown;
    cycle_heads: unknown;
    obligation_heads: unknown;
  }>(
    `select
      (select version from astro_diary_journals where id = $1) as journal_version,
      (select count(*)::int from astro_diary_drafts where journal_id = $1) as drafts,
      (select count(*)::int from astro_diary_cycles where journal_id = $1) as cycles,
      (select count(*)::int from astro_diary_timeline_items where journal_id = $1) as items,
      (select count(*)::int from astro_diary_timeline_item_revisions where journal_id = $1) as revisions,
      (select count(*)::int from astro_diary_response_obligations where journal_id = $1) as obligations,
      (select count(*)::int from astro_diary_context_snapshots where journal_id = $1) as contexts,
      (select count(*)::int from astro_diary_derivative_commands where journal_id = $1) as derivatives,
      (select count(*)::int from astro_diary_command_receipts where journal_id = $1) as diary_receipts,
      (select count(*)::int from client_subscription_allowance_command_receipts where period_id = $2) as allowance_receipts,
      (select count(*)::int from client_subscription_allowance_command_effects where period_id = $2) as allowance_effects,
      (select count(*)::int from client_subscription_allowance_consumptions where period_id = $2) as allowance_consumptions,
      (select count(*)::int from astro_diary_cycle_opening_allowance_facts where journal_id = $1) as allowance_facts,
      (select count(*)::int from astro_diary_events where journal_id = $1) as events,
      (select count(*)::int from astro_diary_event_deliveries d join astro_diary_events e on e.event_id = d.event_id where e.journal_id = $1) as deliveries,
      (select count(*)::int from outbox_events o where exists (
        select 1 from astro_diary_event_deliveries d
        join astro_diary_events e on e.event_id = d.event_id
        where e.journal_id = $1 and d.id = o.aggregate_id
      )) as outbox,
      (select jsonb_build_object(
        'available', available,
        'reserved', reserved,
        'consumed', consumed,
        'released', released,
        'version', version
      ) from client_subscription_period_allowances where period_id = $2) as allowance_head,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'state', state,
        'version', version,
        'closedAt', closed_at,
        'closeReason', close_reason
      ) order by id), '[]'::jsonb) from astro_diary_cycles where journal_id = $1) as cycle_heads,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'state', state,
        'version', version,
        'satisfiedByItemId', satisfied_by_item_id,
        'closedAt', closed_at
      ) order by id), '[]'::jsonb) from astro_diary_response_obligations where journal_id = $1) as obligation_heads`,
    [journal.journalId, journal.fixture.periodId]
  );
  return counts.rows[0];
}

async function mediaPersistenceSnapshot(runtime: PostgresRuntime, mediaIds: readonly string[]) {
  return {
    assets: await runtime.database
      .select({
        id: mediaAssets.id,
        ownerUserId: mediaAssets.ownerUserId,
        purpose: mediaAssets.purpose,
        status: mediaAssets.status,
        visibility: mediaAssets.visibility
      })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, [...mediaIds])),
    authorities: await runtime.database
      .select({
        mediaId: astroDiaryMediaAuthorities.mediaId,
        state: astroDiaryMediaAuthorities.state,
        boundItemId: astroDiaryMediaAuthorities.boundItemId,
        boundAt: astroDiaryMediaAuthorities.boundAt,
        updatedAt: astroDiaryMediaAuthorities.updatedAt
      })
      .from(astroDiaryMediaAuthorities)
      .where(inArray(astroDiaryMediaAuthorities.mediaId, [...mediaIds])),
    draftAttachments: await runtime.database
      .select()
      .from(astroDiaryDraftAttachments)
      .where(inArray(astroDiaryDraftAttachments.mediaId, [...mediaIds])),
    entryAttachments: await runtime.database
      .select()
      .from(astroDiaryEntryAttachments)
      .where(inArray(astroDiaryEntryAttachments.mediaId, [...mediaIds])),
    revisionAttachments: await runtime.database
      .select()
      .from(astroDiaryTimelineRevisionAttachments)
      .where(inArray(astroDiaryTimelineRevisionAttachments.mediaId, [...mediaIds]))
  };
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function consumeAvailableCommand(value: unknown): Readonly<{
  operation: "consume_available";
  consumptionId: string;
  occurredAt: string;
}> {
  if (
    typeof value !== "object" ||
    value === null ||
    !("operation" in value) ||
    value.operation !== "consume_available" ||
    !("consumptionId" in value) ||
    typeof value.consumptionId !== "string" ||
    !("occurredAt" in value) ||
    typeof value.occurredAt !== "string"
  ) {
    throw new Error("Expected a consumed-available allowance command");
  }
  return {
    operation: value.operation,
    consumptionId: value.consumptionId,
    occurredAt: value.occurredAt
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDatabaseLock(
  runtime: PostgresRuntime,
  applicationName: string
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await runtime.pool.query<{ waiting: boolean }>(
      `select exists (
         select 1
           from pg_stat_activity
          where application_name = $1
            and wait_event_type = 'Lock'
       ) as waiting`,
      [applicationName]
    );
    if (result.rows[0]?.waiting) return;
    await delay(10);
  }
  throw new Error("Standalone allowance command did not block on the prelocked allowance row");
}
