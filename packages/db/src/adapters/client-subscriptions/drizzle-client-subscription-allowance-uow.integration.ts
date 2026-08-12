import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  consumeReservedAllowance,
  executeClientSubscriptionAllowanceCommand,
  expirePeriodAllowance,
  hashClientSubscriptionAllowanceCommand,
  reservePeriodAllowance
} from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import {
  clientSubscriptionAllowanceCommandEffects,
  clientSubscriptionAllowanceCommandReceipts,
  clientSubscriptionAllowanceReservations
} from "../../schema/client-subscriptions";
import {
  createActiveClientSubscriptionFixture,
  createClientSubscriptionIntegrationDatabase
} from "./client-subscription-integration-fixture";
import {
  createDrizzleClientSubscriptionAllowanceCommandUnitOfWork,
  executeClientSubscriptionAllowanceCommandInTransaction
} from "./drizzle-client-subscription-allowance-uow";

describe.sequential("Drizzle client subscription allowance UOW", () => {
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

  it("serializes reservation retries and replays the exact historical allowance result", async () => {
    const active = await createActiveClientSubscriptionFixture(runtime);
    const unitOfWork = createDrizzleClientSubscriptionAllowanceCommandUnitOfWork(runtime.database);
    const reservationId = randomUUID();
    const idempotencyKey = `reserve-${randomUUID()}`;
    const command = {
      operation: "reserve" as const,
      reservationId,
      occurredAt: "2026-02-01T00:00:00.000Z"
    };
    const reserve = () =>
      executeClientSubscriptionAllowanceCommand(
        unitOfWork,
        { periodId: active.periodId, expectedVersion: 1, idempotencyKey, command },
        (current) =>
          reservePeriodAllowance(current, {
            expectedVersion: 1,
            idempotencyKey,
            reservationId,
            now: command.occurredAt
          })
      );

    const [left, right] = await Promise.all([reserve(), reserve()]);
    expect([left.outcome, right.outcome].sort()).toEqual(["applied", "replayed"]);
    const applied = left.outcome === "applied" ? left : right;
    if (applied.outcome !== "applied") throw new Error("Expected one applied allowance command");

    const consumeKey = `consume-${randomUUID()}`;
    const consumed = await executeClientSubscriptionAllowanceCommand(
      unitOfWork,
      {
        periodId: active.periodId,
        expectedVersion: 2,
        idempotencyKey: consumeKey,
        command: {
          operation: "consume_reserved",
          reservationId,
          occurredAt: "2026-03-01T00:00:00.000Z"
        }
      },
      (current) =>
        consumeReservedAllowance(current, {
          expectedVersion: 2,
          idempotencyKey: consumeKey,
          reservationId,
          now: "2026-03-01T00:00:00.000Z"
        })
    );
    expect(consumed).toMatchObject({
      outcome: "applied",
      allowance: { version: 3, reserved: 0, consumed: 1 }
    });
    await expect(reserve()).resolves.toEqual({ outcome: "replayed", result: applied });
  });

  it("preserves a reserved cycle across period expiry and permits its late consumption", async () => {
    const active = await createActiveClientSubscriptionFixture(runtime);
    const unitOfWork = createDrizzleClientSubscriptionAllowanceCommandUnitOfWork(runtime.database);
    const reservationId = randomUUID();
    const reserveKey = `reserve-${randomUUID()}`;
    const reserved = await executeClientSubscriptionAllowanceCommand(
      unitOfWork,
      {
        periodId: active.periodId,
        expectedVersion: 1,
        idempotencyKey: reserveKey,
        command: {
          operation: "reserve",
          reservationId,
          occurredAt: "2026-02-01T00:00:00.000Z"
        }
      },
      (current) =>
        reservePeriodAllowance(current, {
          expectedVersion: 1,
          idempotencyKey: reserveKey,
          reservationId,
          now: "2026-02-01T00:00:00.000Z"
        })
    );
    expect(reserved).toMatchObject({ outcome: "applied", allowance: { reserved: 1 } });

    const expireKey = `expire-${randomUUID()}`;
    const expired = await executeClientSubscriptionAllowanceCommand(
      unitOfWork,
      {
        periodId: active.periodId,
        expectedVersion: 2,
        idempotencyKey: expireKey,
        command: { operation: "expire_available", occurredAt: "2026-02-28T07:30:00.000Z" }
      },
      (current) =>
        expirePeriodAllowance(current, {
          expectedVersion: 2,
          idempotencyKey: expireKey,
          now: "2026-02-28T07:30:00.000Z"
        })
    );
    expect(expired).toMatchObject({
      outcome: "applied",
      allowance: { available: 0, reserved: 1, consumed: 0, released: 3, version: 3 }
    });

    const consumeKey = `consume-${randomUUID()}`;
    const consumed = await executeClientSubscriptionAllowanceCommand(
      unitOfWork,
      {
        periodId: active.periodId,
        expectedVersion: 3,
        idempotencyKey: consumeKey,
        command: {
          operation: "consume_reserved",
          reservationId,
          occurredAt: "2026-03-02T00:00:00.000Z"
        }
      },
      (current) =>
        consumeReservedAllowance(current, {
          expectedVersion: 3,
          idempotencyKey: consumeKey,
          reservationId,
          now: "2026-03-02T00:00:00.000Z"
        })
    );
    expect(consumed).toMatchObject({
      outcome: "applied",
      allowance: { available: 0, reserved: 0, consumed: 1, released: 3, version: 4 }
    });
  });

  it("persists deterministic rejection and leaves transient CAS conflicts without receipts", async () => {
    const active = await createActiveClientSubscriptionFixture(runtime);
    const unitOfWork = createDrizzleClientSubscriptionAllowanceCommandUnitOfWork(runtime.database);
    const missingReservationId = randomUUID();
    const rejectedKey = `missing-${randomUUID()}`;
    const command = {
      operation: "consume_reserved" as const,
      reservationId: missingReservationId,
      occurredAt: "2026-02-01T00:00:00.000Z"
    };
    const rejected = await executeClientSubscriptionAllowanceCommand(
      unitOfWork,
      { periodId: active.periodId, expectedVersion: 1, idempotencyKey: rejectedKey, command },
      (current) =>
        consumeReservedAllowance(current, {
          expectedVersion: 1,
          idempotencyKey: rejectedKey,
          reservationId: missingReservationId,
          now: command.occurredAt
        })
    );
    expect(rejected).toMatchObject({
      outcome: "rejected",
      decision: { outcome: "reservation_not_found" }
    });
    await expect(
      executeClientSubscriptionAllowanceCommand(
        unitOfWork,
        { periodId: active.periodId, expectedVersion: 1, idempotencyKey: rejectedKey, command },
        () => {
          throw new Error("Rejected replay must not execute the decision");
        }
      )
    ).resolves.toEqual({ outcome: "replayed", result: rejected });

    const before = await runtime.database.select().from(clientSubscriptionAllowanceCommandReceipts);
    await expect(
      executeClientSubscriptionAllowanceCommand(
        unitOfWork,
        {
          periodId: active.periodId,
          expectedVersion: 99,
          idempotencyKey: `stale-${randomUUID()}`,
          command: { operation: "expire_available", occurredAt: "2026-03-01T00:00:00.000Z" }
        },
        () => {
          throw new Error("CAS conflict must precede the decision");
        }
      )
    ).resolves.toEqual({ outcome: "version_conflict", expectedVersion: 99, currentVersion: 1 });
    const after = await runtime.database.select().from(clientSubscriptionAllowanceCommandReceipts);
    expect(after).toHaveLength(before.length);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandEffects)
        .where(eq(clientSubscriptionAllowanceCommandEffects.periodId, active.periodId))
    ).resolves.toHaveLength(0);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceReservations)
        .where(eq(clientSubscriptionAllowanceReservations.periodId, active.periodId))
    ).resolves.toHaveLength(0);
  });

  it("participates in its caller transaction without committing allowance facts independently", async () => {
    const active = await createActiveClientSubscriptionFixture(runtime);
    const idempotencyKey = `outer-${randomUUID()}`;
    const reservationId = randomUUID();
    const command = {
      operation: "reserve" as const,
      reservationId,
      occurredAt: "2026-02-01T00:00:00Z"
    };
    const request = {
      periodId: active.periodId,
      expectedVersion: 1,
      idempotencyKey,
      command,
      requestHash: hashClientSubscriptionAllowanceCommand({
        periodId: active.periodId,
        expectedVersion: 1,
        command
      }),
      decide: (current: Parameters<typeof reservePeriodAllowance>[0]) =>
        reservePeriodAllowance(current, {
          expectedVersion: 1,
          idempotencyKey,
          reservationId,
          now: command.occurredAt
        })
    };

    await expect(
      runtime.database.transaction(async (transaction) => {
        await executeClientSubscriptionAllowanceCommandInTransaction(transaction, request);
        throw new Error("rollback outer transaction");
      })
    ).rejects.toThrow("rollback outer transaction");

    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceCommandReceipts)
        .where(eq(clientSubscriptionAllowanceCommandReceipts.periodId, active.periodId))
    ).resolves.toHaveLength(0);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionAllowanceReservations)
        .where(eq(clientSubscriptionAllowanceReservations.periodId, active.periodId))
    ).resolves.toHaveLength(0);
  });
});
