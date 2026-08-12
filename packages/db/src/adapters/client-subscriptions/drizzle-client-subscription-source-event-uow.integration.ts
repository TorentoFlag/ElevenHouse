import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyClientSubscriptionSourceEvent,
  applyInitialCapture,
  applyRenewalCapture,
  createPendingClientSubscription,
  endSubscriptionAtPaidBoundary,
  executeClientSubscriptionCommand,
  executeClientSubscriptionCreation,
  requestRenewalCharge,
  scheduleCancellation,
  sealClientSubscriptionContract
} from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import {
  clientEntitlementGrants,
  clientSubscriptionEventApplicationReceipts,
  clientSubscriptionLifecycleEvents,
  clientSubscriptionPeriodAllowances,
  clientSubscriptionPeriods,
  clientSubscriptionSlots,
  clientSubscriptions
} from "../../schema/client-subscriptions";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";
import {
  createClientSubscriptionIntegrationDatabase,
  createActiveClientSubscriptionFixture,
  createPendingClientSubscriptionFixture,
  seedClientSubscriptionPurchaseAuthority,
  sha256Fixture
} from "./client-subscription-integration-fixture";
import { createDrizzleClientSubscriptionCreationUnitOfWork } from "./drizzle-client-subscription-creation-uow";
import { findClientSubscriptionById } from "./drizzle-client-subscription-reader";
import {
  createDrizzleClientSubscriptionCommandUnitOfWork,
  createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork
} from "./drizzle-client-subscription-uow";

describe.sequential("Drizzle client subscription source-event UOW", () => {
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

  it("commits a verified initial capture with its period, allowance, grant, lifecycle and outbox graph", async () => {
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

    const sourceEventId = randomUUID();
    const evidenceId = randomUUID();
    const periodId = randomUUID();
    const eventIds = [randomUUID(), randomUUID()] as const;
    const applied = await applyClientSubscriptionSourceEvent(
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
          eventIds
        })
    );

    expect(applied).toMatchObject({
      outcome: "applied",
      subscription: { id: subscriptionId, state: "active", version: 2 }
    });
    await expect(runtime.database.select().from(clientSubscriptionPeriods)).resolves.toHaveLength(1);
    await expect(
      runtime.database.select().from(clientSubscriptionPeriodAllowances)
    ).resolves.toHaveLength(1);
    await expect(runtime.database.select().from(clientEntitlementGrants)).resolves.toHaveLength(1);
    await expect(
      runtime.database.select().from(clientSubscriptionLifecycleEvents)
    ).resolves.toHaveLength(2);
    await expect(runtime.database.select().from(outboxEvents)).resolves.toHaveLength(2);
    await expect(
      runtime.database.select().from(clientSubscriptionEventApplicationReceipts)
    ).resolves.toHaveLength(1);
  });

  it("serializes a concurrent redelivery, replays the exact historical snapshot, and quarantines identity conflicts", async () => {
    const pending = await createPendingClientSubscriptionFixture(runtime);
    const subscriptionId = pending.subscription.id;
    const sourceEventId = randomUUID();
    const evidenceId = randomUUID();
    const sourceEventDigest = sha256Fixture("f");
    const periodId = randomUUID();
    const eventIds = [randomUUID(), randomUUID()] as const;
    const unitOfWork = createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(
      runtime.database
    );
    const apply = () =>
      applyClientSubscriptionSourceEvent(
        unitOfWork,
        {
          subscriptionId,
          expectedVersion: 1,
          sourceEventId,
          sourceEventDigest,
          evidenceId
        },
        (current) =>
          applyInitialCapture(current, {
            sourceEventId,
            evidenceId,
            capturedAt: "2026-01-31T07:30:00.000Z",
            periodId,
            eventIds
          })
      );

    const [left, right] = await Promise.all([apply(), apply()]);
    expect([left.outcome, right.outcome].sort()).toEqual(["applied", "replayed"]);
    const applied = left.outcome === "applied" ? left : right;
    if (applied.outcome !== "applied") throw new Error("Expected one applied source event");

    const cancellation = await executeClientSubscriptionCommand(
      createDrizzleClientSubscriptionCommandUnitOfWork(runtime.database),
      {
        subscriptionId,
        expectedVersion: 2,
        idempotencyKey: `cancel-${randomUUID()}`,
        request: { operation: "schedule_cancellation", now: "2026-02-01T00:00:00.000Z" }
      },
      (current) =>
        scheduleCancellation(current, {
          now: "2026-02-01T00:00:00.000Z",
          eventId: randomUUID()
        })
    );
    expect(cancellation).toMatchObject({ outcome: "applied", subscription: { version: 3 } });

    const replay = await apply();
    expect(replay).toEqual({ outcome: "replayed", result: applied });
    await expect(
      applyClientSubscriptionSourceEvent(
        unitOfWork,
        {
          subscriptionId,
          expectedVersion: 3,
          sourceEventId,
          sourceEventDigest: sha256Fixture("0"),
          evidenceId
        },
        () => {
          throw new Error("Conflicted source identity must not execute the decision");
        }
      )
    ).resolves.toEqual({ outcome: "source_event_conflict" });
    await expect(
      applyClientSubscriptionSourceEvent(
        unitOfWork,
        {
          subscriptionId,
          expectedVersion: 3,
          sourceEventId: randomUUID(),
          sourceEventDigest: sha256Fixture("1"),
          evidenceId
        },
        () => {
          throw new Error("Conflicted finance evidence must not execute the decision");
        }
      )
    ).resolves.toEqual({ outcome: "evidence_conflict" });
  });

  it.each([
    { cancellationRequested: false, expectedState: "active" as const },
    { cancellationRequested: true, expectedState: "cancel_at_period_end" as const }
  ])(
    "reloads an ended subscription with its open renewal and applies a late capture as $expectedState",
    async ({ cancellationRequested, expectedState }) => {
      const active = await createActiveClientSubscriptionFixture(runtime);
      const subscriptionId = active.subscription.id;
      const renewalRequestId = randomUUID();
      const intendedPeriodId = randomUUID();
      const commandUnitOfWork = createDrizzleClientSubscriptionCommandUnitOfWork(runtime.database);
      const requested = await executeClientSubscriptionCommand(
        commandUnitOfWork,
        {
          subscriptionId,
          expectedVersion: 2,
          idempotencyKey: `renew-${randomUUID()}`,
          request: { operation: "request_renewal" }
        },
        (current) =>
          requestRenewalCharge(current, {
            renewalRequestId,
            sourcePeriodId: active.periodId,
            intendedPeriodId,
            requestedAt: "2026-02-20T08:00:00.000Z",
            eventId: randomUUID()
          })
      );
      expect(requested).toMatchObject({ outcome: "applied", subscription: { version: 3 } });
      if (requested.outcome !== "applied") throw new Error("renewal request must persist");

      const beforeEnd = cancellationRequested
        ? await executeClientSubscriptionCommand(
            commandUnitOfWork,
            {
              subscriptionId,
              expectedVersion: 3,
              idempotencyKey: `cancel-${randomUUID()}`,
              request: { operation: "schedule_cancellation" }
            },
            (current) =>
              scheduleCancellation(current, {
                now: "2026-02-21T08:00:00.000Z",
                eventId: randomUUID()
              })
          )
        : requested;
      expect(beforeEnd).toMatchObject({ outcome: "applied" });
      if (beforeEnd.outcome !== "applied") throw new Error("pre-end transition must persist");

      const ended = await executeClientSubscriptionCommand(
        commandUnitOfWork,
        {
          subscriptionId,
          expectedVersion: beforeEnd.subscription.version,
          idempotencyKey: `end-${randomUUID()}`,
          request: { operation: "end_at_paid_boundary" }
        },
        (current) =>
          endSubscriptionAtPaidBoundary(current, {
            now: "2026-02-28T07:30:00.000Z",
            eventIds: [randomUUID(), randomUUID()]
          })
      );
      expect(ended).toMatchObject({
        outcome: "applied",
        subscription: { state: "ended", renewalRequest: { id: renewalRequestId } },
        receipt: { slotEffect: "retain" }
      });

      const reloaded = await findClientSubscriptionById(runtime.database, subscriptionId);
      expect(reloaded).toMatchObject({
        state: "ended",
        renewalRequest: { id: renewalRequestId, intendedPeriodId },
        endedPeriodIds: [active.periodId]
      });
      const [endedHead] = await runtime.database
        .select({
          currentPeriodId: clientSubscriptions.currentPeriodId,
          futurePeriodId: clientSubscriptions.futurePeriodId,
          renewalRequestId: clientSubscriptions.renewalRequestId
        })
        .from(clientSubscriptions)
        .where(eq(clientSubscriptions.id, subscriptionId));
      expect(endedHead).toEqual({
        currentPeriodId: null,
        futurePeriodId: null,
        renewalRequestId
      });
      const [retainedSlot] = await runtime.database
        .select({ currentSubscriptionId: clientSubscriptionSlots.currentSubscriptionId })
        .from(clientSubscriptionSlots)
        .where(
          and(
            eq(clientSubscriptionSlots.relationshipId, active.authority.relationshipId),
            eq(clientSubscriptionSlots.productId, active.authority.productId)
          )
        );
      expect(retainedSlot).toEqual({ currentSubscriptionId: subscriptionId });

      const sourceEventId = randomUUID();
      const evidenceId = randomUUID();
      const lateCapture = await applyClientSubscriptionSourceEvent(
        createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(runtime.database),
        {
          subscriptionId,
          expectedVersion: beforeEnd.subscription.version + 1,
          sourceEventId,
          sourceEventDigest: sha256Fixture("d"),
          evidenceId
        },
        (current) =>
          applyRenewalCapture(current, {
            sourceEventId,
            evidenceId,
            renewalRequestId,
            intendedPeriodId,
            capturedAt: "2026-03-02T08:00:00.000Z",
            periodId: intendedPeriodId,
            eventIds: [randomUUID(), randomUUID()]
          })
      );
      expect(lateCapture).toMatchObject({
        outcome: "applied",
        subscription: {
          state: expectedState,
          renewalRequest: null,
          paidPeriods: [{ id: active.periodId }, { id: intendedPeriodId, sequence: 2 }]
        }
      });
      if (lateCapture.outcome !== "applied") throw new Error("late renewal capture must apply");
      if (cancellationRequested) {
        expect(lateCapture.subscription).toMatchObject({
          cancellationEffectiveAt: "2026-04-02T08:00:00Z",
          renewalStoppedAt: "2026-02-21T08:00:00.000Z"
        });
      } else {
        expect(lateCapture.subscription).toMatchObject({
          cancellationEffectiveAt: null,
          renewalStoppedAt: null
        });
      }

      const [reopenedHead] = await runtime.database
        .select({
          state: clientSubscriptions.state,
          currentPeriodId: clientSubscriptions.currentPeriodId,
          futurePeriodId: clientSubscriptions.futurePeriodId,
          renewalRequestId: clientSubscriptions.renewalRequestId
        })
        .from(clientSubscriptions)
        .where(eq(clientSubscriptions.id, subscriptionId));
      expect(reopenedHead).toEqual({
        state: expectedState,
        currentPeriodId: intendedPeriodId,
        futurePeriodId: null,
        renewalRequestId: null
      });
      const [reopenedSlot] = await runtime.database
        .select({ currentSubscriptionId: clientSubscriptionSlots.currentSubscriptionId })
        .from(clientSubscriptionSlots)
        .where(
          and(
            eq(clientSubscriptionSlots.relationshipId, active.authority.relationshipId),
            eq(clientSubscriptionSlots.productId, active.authority.productId)
          )
        );
      expect(reopenedSlot).toEqual({ currentSubscriptionId: subscriptionId });
    }
  );
});
