import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  executeClientSubscriptionCommand,
  revokeCancellation,
  scheduleCancellation
} from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import { clientSubscriptionCommandReceipts } from "../../schema/client-subscriptions";
import {
  createActiveClientSubscriptionFixture,
  createClientSubscriptionIntegrationDatabase
} from "./client-subscription-integration-fixture";
import { createDrizzleClientSubscriptionCommandUnitOfWork } from "./drizzle-client-subscription-uow";

describe.sequential("Drizzle client subscription command UOW", () => {
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

  it("serializes concurrent commands, seals an exact result snapshot, and detects key drift", async () => {
    const active = await createActiveClientSubscriptionFixture(runtime);
    const unitOfWork = createDrizzleClientSubscriptionCommandUnitOfWork(runtime.database);
    const idempotencyKey = `cancel-${randomUUID()}`;
    const eventId = randomUUID();
    const execute = () =>
      executeClientSubscriptionCommand(
        unitOfWork,
        {
          subscriptionId: active.subscription.id,
          expectedVersion: 2,
          idempotencyKey,
          request: { operation: "schedule_cancellation", now: "2026-02-01T00:00:00.000Z" }
        },
        (current) =>
          scheduleCancellation(current, { now: "2026-02-01T00:00:00.000Z", eventId })
      );

    const [left, right] = await Promise.all([execute(), execute()]);
    expect([left.outcome, right.outcome].sort()).toEqual(["applied", "replayed"]);
    const applied = left.outcome === "applied" ? left : right;
    if (applied.outcome !== "applied") throw new Error("Expected one applied command");
    await expect(execute()).resolves.toEqual({ outcome: "replayed", result: applied });
    await expect(
      executeClientSubscriptionCommand(
        unitOfWork,
        {
          subscriptionId: active.subscription.id,
          expectedVersion: 2,
          idempotencyKey,
          request: { operation: "different" }
        },
        () => {
          throw new Error("Idempotency conflict must not execute the decision");
        }
      )
    ).resolves.toEqual({ outcome: "idempotency_conflict" });
  });

  it("replays deterministic rejection after the head advances and leaves transient conflicts unsealed", async () => {
    const active = await createActiveClientSubscriptionFixture(runtime);
    const unitOfWork = createDrizzleClientSubscriptionCommandUnitOfWork(runtime.database);
    const rejectedKey = `reject-${randomUUID()}`;
    const rejected = await executeClientSubscriptionCommand(
      unitOfWork,
      {
        subscriptionId: active.subscription.id,
        expectedVersion: 2,
        idempotencyKey: rejectedKey,
        request: { operation: "revoke_cancellation" }
      },
      (current) =>
        revokeCancellation(current, {
          now: "2026-02-01T00:00:00.000Z",
          eventId: randomUUID()
        })
    );
    expect(rejected).toMatchObject({
      outcome: "rejected",
      decision: { outcome: "rejected", code: "cancellation_not_scheduled" }
    });

    const applied = await executeClientSubscriptionCommand(
      unitOfWork,
      {
        subscriptionId: active.subscription.id,
        expectedVersion: 2,
        idempotencyKey: `advance-${randomUUID()}`,
        request: { operation: "schedule_cancellation" }
      },
      (current) =>
        scheduleCancellation(current, {
          now: "2026-02-01T00:00:00.000Z",
          eventId: randomUUID()
        })
    );
    expect(applied).toMatchObject({ outcome: "applied", subscription: { version: 3 } });

    const replay = await executeClientSubscriptionCommand(
      unitOfWork,
      {
        subscriptionId: active.subscription.id,
        expectedVersion: 2,
        idempotencyKey: rejectedKey,
        request: { operation: "revoke_cancellation" }
      },
      () => {
        throw new Error("Rejected replay must not execute the decision");
      }
    );
    expect(replay).toEqual({ outcome: "replayed", result: rejected });

    const beforeTransient = await runtime.database.select().from(clientSubscriptionCommandReceipts);
    await expect(
      executeClientSubscriptionCommand(
        unitOfWork,
        {
          subscriptionId: active.subscription.id,
          expectedVersion: 2,
          idempotencyKey: `stale-${randomUUID()}`,
          request: { operation: "stale" }
        },
        () => {
          throw new Error("Version conflict must precede the decision");
        }
      )
    ).resolves.toEqual({ outcome: "version_conflict", expectedVersion: 2, currentVersion: 3 });
    const afterTransient = await runtime.database.select().from(clientSubscriptionCommandReceipts);
    expect(afterTransient).toHaveLength(beforeTransient.length);
  });

  it("persists and replays semantic idempotency as a body-free success", async () => {
    const active = await createActiveClientSubscriptionFixture(runtime);
    const unitOfWork = createDrizzleClientSubscriptionCommandUnitOfWork(runtime.database);
    const scheduled = await executeClientSubscriptionCommand(
      unitOfWork,
      {
        subscriptionId: active.subscription.id,
        expectedVersion: 2,
        idempotencyKey: `schedule-${randomUUID()}`,
        request: { operation: "schedule_cancellation" }
      },
      (current) =>
        scheduleCancellation(current, {
          now: "2026-02-01T00:00:00.000Z",
          eventId: randomUUID()
        })
    );
    if (scheduled.outcome !== "applied") throw new Error("Expected cancellation to apply");
    const idempotencyKey = `semantic-${randomUUID()}`;
    const input = {
      subscriptionId: active.subscription.id,
      expectedVersion: 3,
      idempotencyKey,
      request: { operation: "schedule_cancellation" }
    } as const;
    const semantic = await executeClientSubscriptionCommand(unitOfWork, input, (current) =>
      scheduleCancellation(current, { now: "2026-02-02T00:00:00.000Z", eventId: randomUUID() })
    );
    expect(semantic).toMatchObject({
      outcome: "idempotent",
      subscription: { version: 3 },
      events: []
    });
    await expect(
      executeClientSubscriptionCommand(unitOfWork, input, () => {
        throw new Error("Semantic idempotency replay must not execute the decision");
      })
    ).resolves.toEqual({ outcome: "replayed", result: semantic });
  });
});
