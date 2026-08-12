import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyClientSubscriptionSourceEvent,
  applyInitialCapture,
  consumeReservedAllowance,
  createPendingClientSubscription,
  executeClientSubscriptionAllowanceCommand,
  executeClientSubscriptionCreation,
  reservePeriodAllowance,
  sealClientSubscriptionContract
} from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import {
  createClientSubscriptionIntegrationDatabase,
  seedClientSubscriptionPurchaseAuthority,
  sha256Fixture
} from "../../adapters/client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleClientSubscriptionAllowanceCommandUnitOfWork } from "../../adapters/client-subscriptions/drizzle-client-subscription-allowance-uow";
import { createDrizzleClientSubscriptionCreationUnitOfWork } from "../../adapters/client-subscriptions/drizzle-client-subscription-creation-uow";
import { createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork } from "../../adapters/client-subscriptions/drizzle-client-subscription-uow";

describe.sequential("AstroDiary PostgreSQL source schema", () => {
  let runtime: PostgresRuntime;
  let closeDatabase: () => Promise<void>;

  beforeAll(async () => {
    const integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
    closeDatabase = integration.close;
  }, 45_000);

  afterAll(async () => {
    await closeDatabase?.();
  }, 30_000);

  it("commits production subscription authority and the atomic diary graph without bypasses", async () => {
    const authority = await seedClientSubscriptionPurchaseAuthority(runtime);
    const subscriptionId = randomUUID();
    const contractId = randomUUID();
    const journalEpochId = randomUUID();
    const created = await executeClientSubscriptionCreation(
      createDrizzleClientSubscriptionCreationUnitOfWork(runtime.database),
      {
        subscriptionId,
        orderId: authority.orderId,
        productId: authority.productId,
        relationshipId: authority.relationshipId,
        expectedSlotVersion: 0,
        idempotencyKey: `create-${randomUUID()}`,
        request: { contractId, journalEpochId }
      },
      (locked) => {
        const sealed = sealClientSubscriptionContract({
          contractId,
          order: locked.order,
          product: locked.product,
          relationship: locked.relationship,
          createdAt: "2026-01-01T00:00:00.000Z"
        });
        if (sealed.outcome === "rejected") return sealed;
        return {
          outcome: "created",
          contract: sealed.contract,
          subscription: createPendingClientSubscription({
            subscriptionId,
            journalEpochId,
            contract: sealed.contract
          })
        };
      }
    );
    expect(created.outcome).toBe("created");

    const periodId = randomUUID();
    const sourceEventId = randomUUID();
    const evidenceId = randomUUID();
    const capture = await applyClientSubscriptionSourceEvent(
      createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(runtime.database),
      {
        subscriptionId,
        expectedVersion: 1,
        sourceEventId,
        sourceEventDigest: sha256Fixture("c"),
        evidenceId
      },
      (current) =>
        applyInitialCapture(current, {
          sourceEventId,
          evidenceId,
          capturedAt: "2026-01-31T07:30:00.000Z",
          periodId,
          eventIds: [randomUUID(), randomUUID()]
        })
    );
    expect(capture).toMatchObject({ outcome: "applied", subscription: { state: "active" } });

    const reservationId = randomUUID();
    const allowanceUow = createDrizzleClientSubscriptionAllowanceCommandUnitOfWork(
      runtime.database
    );
    const reserveKey = `reserve-${randomUUID()}`;
    const reserved = await executeClientSubscriptionAllowanceCommand(
      allowanceUow,
      {
        periodId,
        expectedVersion: 1,
        idempotencyKey: reserveKey,
        command: {
          operation: "reserve",
          reservationId,
          occurredAt: "2026-02-01T09:00:00.000Z"
        }
      },
      (current) =>
        reservePeriodAllowance(current, {
          expectedVersion: 1,
          idempotencyKey: reserveKey,
          reservationId,
          now: "2026-02-01T09:00:00.000Z"
        })
    );
    expect(reserved.outcome).toBe("applied");

    const journalId = randomUUID();
    const cycleId = randomUUID();
    const promptId = randomUUID();
    const commandKey = `publish-${randomUUID()}`;
    const cycleEventId = randomUUID();
    const itemEventId = randomUUID();
    const cycleRealtimeDeliveryId = randomUUID();
    const cycleNotificationDeliveryId = randomUUID();
    const itemRealtimeDeliveryId = randomUUID();
    const itemNotificationDeliveryId = randomUUID();

    await expect(
      executeTransaction(runtime, async (client) => {
        const missingFactJournalId = randomUUID();
        const missingFactCycleId = randomUUID();
        const missingFactPromptId = randomUUID();
        await client.query(
          `insert into astro_diary_journals
            (id,relationship_id,journal_epoch_id,astrologer_user_id,client_user_id,state,version,created_at)
           values ($1,$2,$3,$4,$5,'active',1,'2026-02-01T09:00:00Z')`,
          [
            missingFactJournalId,
            authority.relationshipId,
            journalEpochId,
            authority.astrologerUserId,
            authority.clientUserId
          ]
        );
        await client.query(
          `insert into astro_diary_cycles
            (id,journal_id,opening_period_id,opening_allowance_reservation_id,
             awaiting_client_prompt_item_id,client_response_due_at,
             client_response_window_calendar_days,client_response_timezone,state,version,opened_at)
           values ($1,$2,$3,$4,$5,'2026-02-06T09:00:00Z',5,'Europe/Moscow',
             'awaiting_client_entry',1,'2026-02-01T09:00:00Z')`,
          [missingFactCycleId, missingFactJournalId, periodId, reservationId, missingFactPromptId]
        );
        await insertPromptEvidence(client, {
          journalId: missingFactJournalId,
          cycleId: missingFactCycleId,
          promptId: missingFactPromptId,
          astrologerUserId: authority.astrologerUserId,
          digest: sha256Fixture("4")
        });
      })
    ).rejects.toThrow("AstroDiary cycle lacks its exact immutable opening allowance fact");

    await executeTransaction(runtime, async (client) => {
      await client.query(
        `insert into astro_diary_journals
         (id, relationship_id, journal_epoch_id, astrologer_user_id, client_user_id, state, version, created_at)
         values ($1,$2,$3,$4,$5,'active',1,'2026-02-01T09:00:00Z')`,
        [
          journalId,
          authority.relationshipId,
          journalEpochId,
          authority.astrologerUserId,
          authority.clientUserId
        ]
      );
      await client.query(
        `insert into astro_diary_cycles
         (id,journal_id,opening_period_id,opening_allowance_reservation_id,
          awaiting_client_prompt_item_id,client_response_due_at,
          client_response_window_calendar_days,client_response_timezone,state,version,opened_at)
         values ($1,$2,$3,$4,$5,'2026-02-06T09:00:00Z',5,'Europe/Moscow',
           'awaiting_client_entry',1,'2026-02-01T09:00:00Z')`,
        [cycleId, journalId, periodId, reservationId, promptId]
      );
      await client.query(
        `insert into astro_diary_cycle_opening_allowance_facts
          (cycle_id,journal_id,opening_period_id,opening_allowance_reservation_id,recorded_at)
         values ($1,$2,$3,$4,'2026-02-01T09:00:00Z')`,
        [cycleId, journalId, periodId, reservationId]
      );
      await insertPromptEvidence(client, {
        journalId,
        cycleId,
        promptId,
        astrologerUserId: authority.astrologerUserId,
        digest: sha256Fixture("d")
      });
      await client.query(
        `insert into astro_diary_events
          (event_id,event_type,schema_version,event_digest,journal_id,journal_epoch_id,
           cycle_id,period_id,occurred_at)
         values ($1,'astro_diary.cycle_opened.v1',1,$2,$3,$4,$5,$6,'2026-02-01T09:00:00Z')`,
        [cycleEventId, sha256Fixture("6"), journalId, journalEpochId, cycleId, periodId]
      );
      await client.query(
        `insert into astro_diary_events
          (event_id,event_type,schema_version,event_digest,journal_id,journal_epoch_id,
           cycle_id,item_id,occurred_at)
         values ($1,'astro_diary.timeline_item_published.v1',1,$2,$3,$4,$5,$6,
           '2026-02-01T09:00:00Z')`,
        [itemEventId, sha256Fixture("5"), journalId, journalEpochId, cycleId, promptId]
      );
      await client.query(
        `insert into astro_diary_event_deliveries
          (id,event_id,consumer,state,available_at,created_at,updated_at)
         values
          ($1,$2,'realtime_projection','pending','2026-02-01T09:00:00Z','2026-02-01T09:00:00Z','2026-02-01T09:00:00Z'),
          ($3,$2,'notification','pending','2026-02-01T09:00:00Z','2026-02-01T09:00:00Z','2026-02-01T09:00:00Z'),
          ($4,$5,'realtime_projection','pending','2026-02-01T09:00:00Z','2026-02-01T09:00:00Z','2026-02-01T09:00:00Z'),
          ($6,$5,'notification','pending','2026-02-01T09:00:00Z','2026-02-01T09:00:00Z','2026-02-01T09:00:00Z')`,
        [
          cycleRealtimeDeliveryId,
          cycleEventId,
          cycleNotificationDeliveryId,
          itemRealtimeDeliveryId,
          itemEventId,
          itemNotificationDeliveryId
        ]
      );
      for (const deliveryId of [
        cycleRealtimeDeliveryId,
        cycleNotificationDeliveryId,
        itemRealtimeDeliveryId,
        itemNotificationDeliveryId
      ]) {
        await client.query(
          `insert into outbox_events (event_type,aggregate_id,payload)
           values (
             'astro_diary.event_delivery.dispatch_requested.v1',$1::uuid,
             jsonb_build_object(
               'schemaVersion','astro-diary-event-delivery-dispatch-request.v1',
               'deliveryId',$1::uuid::text
             )
           )`,
          [deliveryId]
        );
      }
      await client.query(
        `insert into astro_diary_command_receipts
         (journal_id,idempotency_key,request_hash,outcome,created_at)
         values ($1,$2,$3,'applied','2026-02-01T09:00:00Z')`,
        [journalId, commandKey, sha256Fixture("e")]
      );
      await client.query(
        `insert into astro_diary_command_preconditions
         (journal_id,idempotency_key,aggregate,aggregate_id,expected_version)
         values ($1,$2,'journal',$1,1)`,
        [journalId, commandKey]
      );
      await client.query(
        `insert into astro_diary_command_event_receipts
         (journal_id,idempotency_key,ordinal,event_id)
         values ($1,$2,0,$3),($1,$2,1,$4)`,
        [journalId, commandKey, cycleEventId, itemEventId]
      );
    });

    await expect(
      executeTransaction(runtime, async (client) => {
        await client.query(
          `update astro_diary_cycles set opening_allowance_reservation_id=null, version=2
           where id=$1`,
          [cycleId]
        );
      })
    ).rejects.toThrow(
      "AstroDiary cycle allowance reservation may clear only when leaving client entry"
    );

    await expect(
      executeTransaction(runtime, async (client) => {
        await client.query(
          `update astro_diary_cycle_opening_allowance_facts
             set opening_allowance_reservation_id=$2 where cycle_id=$1`,
          [cycleId, randomUUID()]
        );
      })
    ).rejects.toThrow(
      "AstroDiary evidence in astro_diary_cycle_opening_allowance_facts is immutable"
    );

    const consumeKey = `consume-${randomUUID()}`;
    const consumed = await executeClientSubscriptionAllowanceCommand(
      allowanceUow,
      {
        periodId,
        expectedVersion: 2,
        idempotencyKey: consumeKey,
        command: {
          operation: "consume_reserved",
          reservationId,
          occurredAt: "2026-02-02T09:00:00.000Z"
        }
      },
      (current) =>
        consumeReservedAllowance(current, {
          expectedVersion: 2,
          idempotencyKey: consumeKey,
          reservationId,
          now: "2026-02-02T09:00:00.000Z"
        })
    );
    expect(consumed.outcome).toBe("applied");

    const entryId = randomUUID();
    const contextId = randomUUID();
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `update astro_diary_cycles set
         opening_allowance_reservation_id=null, awaiting_client_prompt_item_id=null,
         client_response_due_at=null, client_response_window_calendar_days=null,
         client_response_timezone=null, state='awaiting_astrologer_response', version=2
         where id=$1`,
        [cycleId]
      );
      await client.query(
        `insert into astro_diary_timeline_items
         (id,journal_id,cycle_id,current_revision,cursor,kind,author_role,author_user_id,
          body,mood_id,context_status,occurred_at)
         values ($1,$2,$3,1,2,'client_entry','client',$4,
           'Сегодня стало спокойнее','calm','pending','2026-02-02T09:00:00Z')`,
        [entryId, journalId, cycleId, authority.clientUserId]
      );
      await client.query(
        `insert into astro_diary_timeline_item_revisions
         (item_id,journal_id,cycle_id,revision,cursor,kind,author_role,author_user_id,
          body,mood_id,context_status,occurred_at,source_digest,recorded_at)
         values ($1,$2,$3,1,2,'client_entry','client',$4,
           'Сегодня стало спокойнее','calm','pending','2026-02-02T09:00:00Z',$5,
           '2026-02-02T09:00:00Z')`,
        [entryId, journalId, cycleId, authority.clientUserId, sha256Fixture("f")]
      );
      await client.query(
        `insert into astro_diary_context_snapshots
         (id,journal_id,item_id,source_item_revision,source_item_digest,event_at,
          event_timezone,version,status)
         values ($1,$2,$3,1,$4,'2026-02-02T09:00:00Z','Europe/Moscow',1,'pending')`,
        [contextId, journalId, entryId, sha256Fixture("f")]
      );
    });
    const openingFactCount = await runtime.pool.query<{ count: string }>(
      `select count(*) from astro_diary_cycle_opening_allowance_facts
        where cycle_id=$1 and opening_allowance_reservation_id=$2`,
      [cycleId, reservationId]
    );
    expect(openingFactCount.rows[0]?.count).toBe("1");

    const contextDigest = sha256Fixture("1");
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `update astro_diary_context_snapshots set
         version=2,status='global_only',engine_revision='chart-engine@task7',
         global_context_ref=$2,context_digest=$3,calculated_at='2026-02-02T09:01:00Z'
         where id=$1`,
        [contextId, randomUUID(), contextDigest]
      );
      await client.query(
        `insert into astro_diary_context_displays
         (context_id,context_version,journal_id,source_context_digest,
          lunar_phase_id,moon_sign,birth_profile_revision)
         values ($1,2,$2,$3,'waxing_gibbous','taurus',null)`,
        [contextId, journalId, contextDigest]
      );
      await client.query(
        `insert into astro_diary_context_display_transits
         (context_id,context_version,journal_id,ordinal,transit_point,natal_point,aspect,sign,applying)
         values ($1,2,$2,0,'jupiter',null,'trine','libra',true)`,
        [contextId, journalId]
      );
    });

    const aiCommandId = randomUUID();
    const aiRequestedEventId = randomUUID();
    const aiRequestedDeliveryId = randomUUID();
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `insert into astro_diary_ai_commands
          (id,journal_id,cycle_id,requested_by_user_id,operation,state,idempotency_key,
           source_item_id,source_item_revision,source_digest,prompt_version,requested_model,
           created_at)
         values ($1,$2,$3,$4,'reply_draft','pending',$5,$6,1,$7,
           'astro-diary-reply-draft.v1','gpt-test','2026-02-02T09:02:00Z')`,
        [
          aiCommandId,
          journalId,
          cycleId,
          authority.astrologerUserId,
          `ai-${randomUUID()}`,
          entryId,
          sha256Fixture("f")
        ]
      );
      await client.query(
        `insert into astro_diary_events
          (event_id,event_type,schema_version,event_digest,journal_id,journal_epoch_id,
           cycle_id,command_id,occurred_at)
         values ($1,'astro_diary.ai_generation_requested.v1',1,$2,$3,$4,$5,$6,
           '2026-02-02T09:02:00Z')`,
        [aiRequestedEventId, sha256Fixture("7"), journalId, journalEpochId, cycleId, aiCommandId]
      );
      await insertDeliveryOutbox(client, {
        deliveryId: aiRequestedDeliveryId,
        eventId: aiRequestedEventId,
        consumer: "ai_worker"
      });
    });

    await expect(
      executeTransaction(runtime, async (client) => {
        await client.query(
          `insert into astro_diary_realtime_events
            (source_event_id,type,journal_id,cycle_id,command_id,occurred_at)
           values ($1,'ai.updated',$2,$3,$4,'2026-02-02T09:02:00Z')`,
          [aiRequestedEventId, journalId, cycleId, aiCommandId]
        );
      })
    ).rejects.toThrow(
      "AstroDiary realtime projection type does not exactly map its canonical visible event"
    );

    const aiUpdatedEventId = randomUUID();
    const aiUpdatedDeliveryId = randomUUID();
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `update astro_diary_ai_commands set
           state='source_stale',failure_code='source_stale',completed_at='2026-02-02T09:03:00Z'
         where id=$1`,
        [aiCommandId]
      );
      await client.query(
        `insert into astro_diary_events
          (event_id,event_type,schema_version,event_digest,journal_id,journal_epoch_id,
           cycle_id,command_id,occurred_at)
         values ($1,'astro_diary.ai_updated.v1',1,$2,$3,$4,$5,$6,
           '2026-02-02T09:03:00Z')`,
        [aiUpdatedEventId, sha256Fixture("8"), journalId, journalEpochId, cycleId, aiCommandId]
      );
      await insertDeliveryOutbox(client, {
        deliveryId: aiUpdatedDeliveryId,
        eventId: aiUpdatedEventId,
        consumer: "realtime_projection"
      });
    });

    await executeTransaction(runtime, async (client) => {
      await client.query(
        `update astro_diary_event_deliveries set
           state='publishing',attempts=1,claim_fence=1,lease_owner='realtime-projector:test',
           lease_expires_at=statement_timestamp() + interval '5 minutes',updated_at=statement_timestamp()
         where id=$1`,
        [aiUpdatedDeliveryId]
      );
      await client.query(
        `insert into astro_diary_realtime_events
          (source_event_id,type,journal_id,cycle_id,command_id,occurred_at)
         values ($1,'ai.updated',$2,$3,$4,'2026-02-02T09:03:00Z')`,
        [aiUpdatedEventId, journalId, cycleId, aiCommandId]
      );
      await client.query(
        `insert into astro_diary_event_application_receipts
          (consumer,source_event_id,source_event_type,source_event_digest,journal_id,
           result_kind,result_code,applied_at)
         values ('realtime_projection',$1,'astro_diary.ai_updated.v1',$2,$3,
           'applied',null,statement_timestamp())`,
        [aiUpdatedEventId, sha256Fixture("8"), journalId]
      );
      await client.query(
        `update astro_diary_event_deliveries set
           state='published',lease_owner=null,lease_expires_at=null,
           published_at=statement_timestamp(),updated_at=statement_timestamp()
         where id=$1`,
        [aiUpdatedDeliveryId]
      );
    });

    await expect(
      executeTransaction(runtime, async (client) => {
        await client.query(
          `insert into media_assets
            (id,owner_user_id,purpose,status,visibility,storage_bucket,storage_key,
             original_file_name,mime_type,size_bytes,created_at,updated_at)
           values ($1,$2,'astro_diary_attachment','uploading','private','private',$3,
             'orphan.jpg','image/jpeg',0,'2026-02-02T09:04:00Z','2026-02-02T09:04:00Z')`,
          [randomUUID(), authority.clientUserId, `astro-diary/orphan-${randomUUID()}.jpg`]
        );
      })
    ).rejects.toThrow("AstroDiary generic Diary asset lacks its exact journal authority");

    const attachmentMediaId = randomUUID();
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `insert into media_assets
          (id,owner_user_id,purpose,status,visibility,storage_bucket,storage_key,
           original_file_name,mime_type,size_bytes,created_at,updated_at)
         values ($1,$2,'astro_diary_attachment','uploading','private','private',$3,
           'entry.jpg','image/jpeg',0,'2026-02-02T09:04:00Z','2026-02-02T09:04:00Z')`,
        [attachmentMediaId, authority.clientUserId, `astro-diary/${journalId}/entry.jpg`]
      );
      await client.query(
        `insert into astro_diary_media_authorities
          (media_id,journal_id,owner_user_id,purpose,visibility,state,created_at,updated_at)
         values ($1,$2,$3,'astro_diary_attachment','private','pending',
           '2026-02-02T09:04:00Z','2026-02-02T09:04:00Z')`,
        [attachmentMediaId, journalId, authority.clientUserId]
      );
    });
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `update media_assets set status='ready',size_bytes=100,
           checksum_sha256=$2,updated_at='2026-02-02T09:05:00Z' where id=$1`,
        [attachmentMediaId, "a".repeat(64)]
      );
      await client.query(
        `update astro_diary_media_authorities set state='ready',
           ready_at='2026-02-02T09:05:00Z',updated_at='2026-02-02T09:05:00Z'
         where media_id=$1`,
        [attachmentMediaId]
      );
    });

    const boundMediaId = randomUUID();
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `insert into media_assets
          (id,owner_user_id,purpose,status,visibility,storage_bucket,storage_key,
           original_file_name,mime_type,size_bytes,created_at,updated_at)
         values ($1,$2,'astro_diary_voice','uploading','private','private',$3,
           'entry.ogg','audio/ogg',0,'2026-02-02T09:04:00Z','2026-02-02T09:04:00Z')`,
        [boundMediaId, authority.clientUserId, `astro-diary/${journalId}/entry.ogg`]
      );
      await client.query(
        `insert into astro_diary_media_authorities
          (media_id,journal_id,owner_user_id,purpose,visibility,state,created_at,updated_at)
         values ($1,$2,$3,'astro_diary_voice','private','pending',
           '2026-02-02T09:04:00Z','2026-02-02T09:04:00Z')`,
        [boundMediaId, journalId, authority.clientUserId]
      );
    });
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `update media_assets set status='ready',size_bytes=100,checksum_sha256=$2,
           updated_at='2026-02-02T09:05:00Z' where id=$1`,
        [boundMediaId, "b".repeat(64)]
      );
      await client.query(
        `update astro_diary_media_authorities set state='ready',
           ready_at='2026-02-02T09:05:00Z',updated_at='2026-02-02T09:05:00Z'
         where media_id=$1`,
        [boundMediaId]
      );
    });
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `update astro_diary_media_authorities set state='bound',bound_item_id=$2,
           bound_at='2026-02-02T09:06:00Z',updated_at='2026-02-02T09:06:00Z'
         where media_id=$1`,
        [boundMediaId, entryId]
      );
      await client.query(
        `insert into astro_diary_timeline_revision_attachments
          (item_id,revision,journal_id,ordinal,media_id)
         values ($1,1,$2,0,$3)`,
        [entryId, journalId, boundMediaId]
      );
      await client.query(
        `insert into astro_diary_entry_attachments
          (media_id,journal_id,item_id,owner_user_id,purpose,state,bound_at)
         values ($1,$2,$3,$4,'astro_diary_voice','bound','2026-02-02T09:06:00Z')`,
        [boundMediaId, journalId, entryId, authority.clientUserId]
      );
    });

    const exportId = randomUUID();
    const exportMediaId = randomUUID();
    await runtime.pool.query(
      `insert into media_assets
         (id,owner_user_id,purpose,status,visibility,storage_bucket,storage_key,
          original_file_name,mime_type,size_bytes,created_at,updated_at)
       values ($1,$2,'astro_diary_export_pdf','ready','private','private',
         $3,'astro-diary.pdf','application/pdf',100,'2026-02-02T10:00:00Z','2026-02-02T10:00:00Z')`,
      [exportMediaId, authority.clientUserId, `astro-diary/${journalId}.pdf`]
    );
    await expect(
      runtime.pool.query(
        `insert into astro_diary_journal_media_access_revocations
          (media_id,journal_id,revoked_at)
         values ($1,$2,'2026-02-02T11:00:00Z')`,
        [exportMediaId, journalId]
      )
    ).rejects.toThrow("astro_diary_journal_media_access_revocations_authority_fk");
    await runtime.pool.query(
      `insert into astro_diary_export_commands
         (id,journal_id,requested_by_user_id,idempotency_key,status,source_journal_version,
          source_digest,locale,created_at,updated_at)
       values ($1,$2,$3,$4,'queued',1,$5,'ru','2026-02-02T10:00:00Z','2026-02-02T10:00:00Z')`,
      [exportId, journalId, authority.clientUserId, `export-${randomUUID()}`, sha256Fixture("2")]
    );

    await expect(
      executeTransaction(runtime, async (client) => {
        await client.query(
          `update astro_diary_export_commands set
             status='ready', artifact_media_id=$2, artifact_owner_user_id=$3,
             updated_at='2026-02-02T10:00:30Z'
           where id=$1`,
          [exportId, exportMediaId, authority.clientUserId]
        );
      })
    ).rejects.toThrow("AstroDiary worker terminal transition requires an active claim");

    await runtime.pool.query(
      `update astro_diary_export_commands set
         status='processing', attempts=1, claim_fence=1,
         lease_owner='export-worker:test', lease_expires_at=statement_timestamp() + interval '5 minutes',
         updated_at='2026-02-02T10:00:30Z'
       where id=$1`,
      [exportId]
    );
    await runtime.pool.query(
      `update astro_diary_export_commands set
         status='ready', lease_owner=null, lease_expires_at=null,
         artifact_media_id=$2, artifact_owner_user_id=$3,
         updated_at='2026-02-02T10:01:00Z'
       where id=$1`,
      [exportId, exportMediaId, authority.clientUserId]
    );

    const projectedCursor = await executeTransaction(runtime, async (client) => {
      await client.query(
        `select setval(
           pg_get_serial_sequence('astro_diary_realtime_events','event_id'),
           9007199254740991,
           true
         )`
      );
      await client.query(
        `update astro_diary_event_deliveries set
           state='publishing', attempts=1, claim_fence=1,
           lease_owner='realtime-projector:test',
           lease_expires_at=statement_timestamp() + interval '5 minutes',
           updated_at=statement_timestamp()
         where id=$1`,
        [itemRealtimeDeliveryId]
      );
      const projected = await client.query<{ event_id: string }>(
        `insert into astro_diary_realtime_events
           (source_event_id,type,journal_id,cycle_id,item_id,occurred_at)
         values ($1,'timeline.item.published',$2,$3,$4,'2026-02-01T09:00:00Z')
         returning event_id`,
        [itemEventId, journalId, cycleId, promptId]
      );
      await client.query(
        `insert into astro_diary_event_application_receipts
          (consumer,source_event_id,source_event_type,source_event_digest,journal_id,
           result_kind,result_code,applied_at)
         values (
           'realtime_projection',$1,'astro_diary.timeline_item_published.v1',$2,$3,
           'applied',null,statement_timestamp()
         )`,
        [itemEventId, sha256Fixture("5"), journalId]
      );
      await client.query(
        `update astro_diary_event_deliveries set
           state='published', lease_owner=null, lease_expires_at=null,
           published_at=statement_timestamp(), updated_at=statement_timestamp()
         where id=$1`,
        [itemRealtimeDeliveryId]
      );
      return projected.rows[0]?.event_id ?? null;
    });
    expect(projectedCursor).toBe("9007199254740992");

    const countResult = await runtime.pool.query<{ count: string }>(
      `select count(*) from astro_diary_timeline_items where journal_id=$1`,
      [journalId]
    );
    expect(Number(countResult.rows[0]?.count ?? -1)).toBe(2);

    await expect(
      executeTransaction(runtime, async (client) => {
        const gapItemId = randomUUID();
        await client.query(
          `insert into astro_diary_timeline_items
           (id,journal_id,cycle_id,current_revision,cursor,kind,author_role,author_user_id,
            body,occurred_at)
           values ($1,$2,$3,1,4,'astrologer_reply','astrologer',$4,'Gap',now())`,
          [gapItemId, journalId, cycleId, authority.astrologerUserId]
        );
        await client.query(
          `insert into astro_diary_timeline_item_revisions
           (item_id,journal_id,cycle_id,revision,cursor,kind,author_role,author_user_id,
            body,occurred_at,source_digest,recorded_at)
           values ($1,$2,$3,1,4,'astrologer_reply','astrologer',$4,'Gap',now(),$5,now())`,
          [gapItemId, journalId, cycleId, authority.astrologerUserId, sha256Fixture("3")]
        );
      })
    ).rejects.toThrow("AstroDiary timeline cursor is not the next server cursor");

    const cascadeRequestId = randomUUID();
    const journalErasureCommandId = randomUUID();
    const cascadeTargets = [
      "timeline_revision",
      "derivative",
      "transcript",
      "extraction",
      "embedding",
      "ai_draft",
      "export",
      "media"
    ].map((subsystem, index) => ({
      subsystem,
      targetId: randomUUID(),
      sourceVersion: index + 1,
      sourceDigest: sha256Fixture(String(index))
    }));
    await executeTransaction(runtime, async (client) => {
      await client.query(
        `insert into astro_diary_cascade_commands
          (cascade_request_id,journal_id,state,requested_at)
         values ($1,$2,'pending','2026-02-02T11:00:00Z')`,
        [cascadeRequestId, journalId]
      );
      await client.query(
        `insert into astro_diary_erasure_commands
          (id,journal_id,target_type,target_id,state,source_version,source_digest,
           derivative_command_id,cascade_request_id,requested_at)
         values ($1,$2,'journal',$2,'pending',1,null,null,$3,'2026-02-02T11:00:00Z')`,
        [journalErasureCommandId, journalId, cascadeRequestId]
      );
      for (const target of cascadeTargets) {
        await client.query(
          `insert into astro_diary_cascade_targets
            (cascade_request_id,journal_id,subsystem,target_id,source_version,source_digest)
           values ($1,$2,$3,$4,$5,$6)`,
          [
            cascadeRequestId,
            journalId,
            target.subsystem,
            target.targetId,
            target.sourceVersion,
            target.sourceDigest
          ]
        );
      }
      for (const target of cascadeTargets.slice(0, -1)) {
        await insertCascadeReceipt(client, cascadeRequestId, journalId, target);
      }
    });

    await expect(
      completeJournalErasure(runtime, {
        journalId,
        cascadeRequestId,
        journalErasureCommandId,
        mediaIds: [boundMediaId]
      })
    ).rejects.toThrow(
      "AstroDiary journal media revocation set is not exact for live journal authorities"
    );

    await expect(
      completeJournalErasure(runtime, {
        journalId,
        cascadeRequestId,
        journalErasureCommandId,
        mediaIds: [boundMediaId, attachmentMediaId]
      })
    ).rejects.toThrow(
      "AstroDiary completed journal erasure lacks its exact cascade target receipt set"
    );

    await expect(
      insertCascadeReceipt(runtime.pool, cascadeRequestId, journalId, {
        ...cascadeTargets.at(-1)!,
        sourceDigest: sha256Fixture("9")
      })
    ).rejects.toThrow("astro_diary_cascade_receipts_exact_target_fk");

    await insertCascadeReceipt(runtime.pool, cascadeRequestId, journalId, cascadeTargets.at(-1)!);
    await completeJournalErasure(runtime, {
      journalId,
      cascadeRequestId,
      journalErasureCommandId,
      mediaIds: [boundMediaId, attachmentMediaId]
    });
    const terminalJournal = await runtime.pool.query<{ state: string; version: number }>(
      `select state,version from astro_diary_journals where id=$1`,
      [journalId]
    );
    expect(terminalJournal.rows[0]).toEqual({ state: "erased", version: 3 });
  }, 45_000);
});

async function executeTransaction<Result>(
  runtime: PostgresRuntime,
  execute: (client: PoolClient) => Promise<Result>
): Promise<Result> {
  const client = await runtime.pool.connect();
  try {
    await client.query("begin");
    const result = await execute(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function insertPromptEvidence(
  client: PoolClient,
  input: Readonly<{
    journalId: string;
    cycleId: string;
    promptId: string;
    astrologerUserId: string;
    digest: string;
  }>
): Promise<void> {
  await client.query(
    `insert into astro_diary_timeline_items
       (id,journal_id,cycle_id,current_revision,cursor,kind,author_role,author_user_id,
        body,occurred_at)
     values ($1,$2,$3,1,1,'reflection_prompt','astrologer',$4,
       'Что сейчас особенно важно заметить?','2026-02-01T09:00:00Z')`,
    [input.promptId, input.journalId, input.cycleId, input.astrologerUserId]
  );
  await client.query(
    `insert into astro_diary_timeline_item_revisions
       (item_id,journal_id,cycle_id,revision,cursor,kind,author_role,author_user_id,
        body,occurred_at,source_digest,recorded_at)
     values ($1,$2,$3,1,1,'reflection_prompt','astrologer',$4,
       'Что сейчас особенно важно заметить?','2026-02-01T09:00:00Z',$5,
       '2026-02-01T09:00:00Z')`,
    [input.promptId, input.journalId, input.cycleId, input.astrologerUserId, input.digest]
  );
}

async function insertDeliveryOutbox(
  client: PoolClient,
  input: Readonly<{ deliveryId: string; eventId: string; consumer: string }>
): Promise<void> {
  await client.query(
    `insert into astro_diary_event_deliveries
      (id,event_id,consumer,state,available_at,created_at,updated_at)
     values ($1,$2,$3,'pending',statement_timestamp(),statement_timestamp(),statement_timestamp())`,
    [input.deliveryId, input.eventId, input.consumer]
  );
  await client.query(
    `insert into outbox_events (event_type,aggregate_id,payload)
     values (
       'astro_diary.event_delivery.dispatch_requested.v1',$1::uuid,
       jsonb_build_object(
         'schemaVersion','astro-diary-event-delivery-dispatch-request.v1',
         'deliveryId',$1::uuid::text
       )
     )`,
    [input.deliveryId]
  );
}

type CascadeTargetFixture = Readonly<{
  subsystem: string;
  targetId: string;
  sourceVersion: number;
  sourceDigest: string;
}>;

async function insertCascadeReceipt(
  executor: Pick<PoolClient, "query">,
  cascadeRequestId: string,
  journalId: string,
  target: CascadeTargetFixture
): Promise<void> {
  await executor.query(
    `insert into astro_diary_cascade_receipts
      (receipt_id,cascade_request_id,journal_id,subsystem,target_id,source_version,
       source_digest,completed_at)
     values ($1,$2,$3,$4,$5,$6,$7,'2026-02-02T11:01:00Z')`,
    [
      randomUUID(),
      cascadeRequestId,
      journalId,
      target.subsystem,
      target.targetId,
      target.sourceVersion,
      target.sourceDigest
    ]
  );
}

async function completeJournalErasure(
  runtime: PostgresRuntime,
  input: Readonly<{
    journalId: string;
    cascadeRequestId: string;
    journalErasureCommandId: string;
    mediaIds: readonly string[];
  }>
): Promise<void> {
  await executeTransaction(runtime, async (client) => {
    for (const mediaId of input.mediaIds) {
      await client.query(
        `insert into astro_diary_journal_media_access_revocations
          (media_id,journal_id,revoked_at)
         values ($1,$2,'2026-02-02T11:00:00Z')`,
        [mediaId, input.journalId]
      );
    }
    await client.query(`update astro_diary_journals set state='erasing',version=2 where id=$1`, [
      input.journalId
    ]);
    await client.query(
      `update astro_diary_cascade_commands set
         state='processing',attempts=1,claim_fence=1,lease_owner='erasure-worker:test',
         lease_expires_at=statement_timestamp() + interval '5 minutes'
       where cascade_request_id=$1`,
      [input.cascadeRequestId]
    );
    await client.query(
      `update astro_diary_cascade_commands set
         state='completed',lease_owner=null,lease_expires_at=null,
         completed_at='2026-02-02T11:02:00Z'
       where cascade_request_id=$1`,
      [input.cascadeRequestId]
    );
    await client.query(
      `update astro_diary_erasure_commands set
         state='processing',attempts=1,claim_fence=1,lease_owner='erasure-worker:test',
         lease_expires_at=statement_timestamp() + interval '5 minutes'
       where id=$1`,
      [input.journalErasureCommandId]
    );
    await client.query(
      `update astro_diary_erasure_commands set
         state='completed',lease_owner=null,lease_expires_at=null,
         completed_at='2026-02-02T11:02:00Z'
       where id=$1`,
      [input.journalErasureCommandId]
    );
    await client.query(`update astro_diary_journals set state='erased',version=3 where id=$1`, [
      input.journalId
    ]);
  });
}
