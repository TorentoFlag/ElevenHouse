import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyClientSubscriptionSourceEvent,
  applyInitialCapture,
  type ClientSubscriptionSourceEventApplicationExecution
} from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import { astroDiaryJournals } from "../../schema/astro-diary";
import { clientEntitlementGrants } from "../../schema/client-subscriptions";
import {
  createClientSubscriptionIntegrationDatabase,
  createPendingClientSubscriptionFixture,
  sha256Fixture
} from "./client-subscription-integration-fixture";
import { createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork } from "./drizzle-client-subscription-uow";

describe.sequential("AstroDiary source-event activation gap", () => {
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

  it("characterizes that an applied initial capture persists entitlement but no AstroDiary journal, including replay and concurrent redelivery", async () => {
    const pending = await createPendingClientSubscriptionFixture(runtime);
    const sourceEventId = randomUUID();
    const evidenceId = randomUUID();
    const sourceEventDigest = sha256Fixture("a");
    const periodId = randomUUID();
    const eventIds = [randomUUID(), randomUUID()] as const;
    const unitOfWork = createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(
      runtime.database
    );
    const apply = (): Promise<ClientSubscriptionSourceEventApplicationExecution> =>
      applyClientSubscriptionSourceEvent(
        unitOfWork,
        {
          subscriptionId: pending.subscription.id,
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
    if (applied.outcome !== "applied") throw new Error("one capture must apply");

    const replay = await apply();
    expect(replay).toEqual({ outcome: "replayed", result: applied });
    await expect(runtime.database.select().from(clientEntitlementGrants)).resolves.toHaveLength(1);
    await expect(runtime.database.select().from(astroDiaryJournals)).resolves.toHaveLength(0);
  });
});
