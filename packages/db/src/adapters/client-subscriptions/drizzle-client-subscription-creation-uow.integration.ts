import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyClientSubscriptionSourceEvent,
  applyInitialCapture,
  applyPermanentRevocation,
  createPendingClientSubscription,
  executeClientSubscriptionCreation,
  sealClientSubscriptionContract,
  OrderProductRevisionConflictError,
  type ClientSubscriptionCreationAuthority,
  type ClientSubscriptionCreationDecision
} from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import { orders } from "../../schema/finance/orders.schema";
import { products } from "../../schema/products/products.schema";
import {
  clientSubscriptionContracts,
  clientSubscriptionCreationReceipts,
  clientSubscriptionPurchaseAuthorities,
  clientSubscriptions
} from "../../schema/client-subscriptions";
import {
  createClientSubscriptionIntegrationDatabase,
  seedClientSubscriptionOrderPrerequisites,
  seedClientSubscriptionPurchaseAuthority,
  sha256Fixture
} from "./client-subscription-integration-fixture";
import { createDrizzleOrderStore } from "../finance/drizzle-order-store";
import { createDrizzleClientSubscriptionCreationUnitOfWork } from "./drizzle-client-subscription-creation-uow";
import { createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork } from "./drizzle-client-subscription-uow";

describe.sequential("Drizzle client subscription creation UOW", () => {
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

  it("seals the immutable purchase authority in the order transaction and converges concurrent creation retries", async () => {
    const authority = await seedClientSubscriptionPurchaseAuthority(runtime);
    const subscriptionId = randomUUID();
    const contractId = randomUUID();
    const journalEpochId = randomUUID();
    const idempotencyKey = `create-${randomUUID()}`;
    const input = {
      subscriptionId,
      orderId: authority.orderId,
      productId: authority.productId,
      relationshipId: authority.relationshipId,
      expectedSlotVersion: 0,
      idempotencyKey,
      request: { contractId, journalEpochId }
    } as const;
    const unitOfWork = createDrizzleClientSubscriptionCreationUnitOfWork(runtime.database);

    const [left, right] = await Promise.all([
      executeClientSubscriptionCreation(unitOfWork, input, (locked) =>
        decideCreation(locked, { subscriptionId, contractId, journalEpochId })
      ),
      executeClientSubscriptionCreation(unitOfWork, input, (locked) =>
        decideCreation(locked, { subscriptionId, contractId, journalEpochId })
      )
    ]);

    expect([left.outcome, right.outcome].sort()).toEqual(["created", "replayed"]);
    const created = left.outcome === "created" ? left : right.outcome === "created" ? right : null;
    if (!created) throw new Error("Expected one created result");
    const sourceEventId = randomUUID();
    const evidenceId = randomUUID();
    const activated = await applyClientSubscriptionSourceEvent(
      createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(runtime.database),
      {
        subscriptionId,
        expectedVersion: 1,
        sourceEventId,
        sourceEventDigest: sha256Fixture("f"),
        evidenceId
      },
      (current) =>
        applyInitialCapture(current, {
          sourceEventId,
          evidenceId,
          capturedAt: "2026-01-31T07:30:00.000Z",
          periodId: randomUUID(),
          eventIds: [randomUUID(), randomUUID()]
        })
    );
    const replayAfterActivation = await executeClientSubscriptionCreation(unitOfWork, input, () => {
      throw new Error("Creation replay must not re-run the decision");
    });
    expect(replayAfterActivation).toEqual({ outcome: "replayed", result: created });
    if (activated.outcome !== "applied") throw new Error("Expected initial capture to apply");
    const revocationSourceEventId = randomUUID();
    const revocationEvidenceId = randomUUID();
    await applyClientSubscriptionSourceEvent(
      createDrizzleClientSubscriptionSourceEventApplicationUnitOfWork(runtime.database),
      {
        subscriptionId,
        expectedVersion: 2,
        sourceEventId: revocationSourceEventId,
        sourceEventDigest: sha256Fixture("e"),
        evidenceId: revocationEvidenceId
      },
      (current) =>
        applyPermanentRevocation(current, {
          evidenceId: revocationEvidenceId,
          reason: "full_refund_succeeded",
          observedAt: "2026-02-01T07:30:00.000Z",
          eventIds: [randomUUID(), randomUUID()]
        })
    );
    const replayAfterTerminal = await executeClientSubscriptionCreation(unitOfWork, input, () => {
      throw new Error("Terminal creation replay must not re-run the decision");
    });
    expect(replayAfterTerminal).toEqual({ outcome: "replayed", result: created });
    await expect(
      runtime.database.select().from(clientSubscriptionPurchaseAuthorities)
    ).resolves.toHaveLength(1);
    await expect(runtime.database.select().from(clientSubscriptionContracts)).resolves.toHaveLength(
      1
    );
    await expect(runtime.database.select().from(clientSubscriptions)).resolves.toHaveLength(1);
    await expect(
      runtime.database.select().from(clientSubscriptionCreationReceipts)
    ).resolves.toHaveLength(1);
  });

  it("replays a deterministic rejection after the authority changes and scopes keys by order", async () => {
    const first = await seedClientSubscriptionPurchaseAuthority(runtime);
    const second = await seedClientSubscriptionPurchaseAuthority(runtime);
    const idempotencyKey = `shared-${randomUUID()}`;
    const unitOfWork = createDrizzleClientSubscriptionCreationUnitOfWork(runtime.database);
    const reject = () => ({ outcome: "rejected", code: "policy_denied" }) as const;

    const firstResult = await unitOfWork.execute({
      subscriptionId: randomUUID(),
      orderId: first.orderId,
      productId: first.productId,
      relationshipId: first.relationshipId,
      expectedSlotVersion: 0,
      idempotencyKey,
      requestHash: `sha256:${"d".repeat(64)}`,
      decide: reject
    });
    const secondResult = await unitOfWork.execute({
      subscriptionId: randomUUID(),
      orderId: second.orderId,
      productId: second.productId,
      relationshipId: second.relationshipId,
      expectedSlotVersion: 0,
      idempotencyKey,
      requestHash: `sha256:${"e".repeat(64)}`,
      decide: reject
    });
    const replay = await unitOfWork.execute({
      subscriptionId: randomUUID(),
      orderId: first.orderId,
      productId: first.productId,
      relationshipId: first.relationshipId,
      expectedSlotVersion: 0,
      idempotencyKey,
      requestHash: `sha256:${"d".repeat(64)}`,
      decide: () => {
        throw new Error("A replay must not re-run the decision");
      }
    });

    expect(firstResult).toMatchObject({ outcome: "rejected", code: "policy_denied" });
    expect(secondResult).toMatchObject({ outcome: "rejected", code: "policy_denied" });
    expect(replay).toMatchObject({
      outcome: "replayed",
      result: { outcome: "rejected", code: "policy_denied" }
    });
  });

  it("rejects a same-price stale Diary revision without committing an order or authority", async () => {
    const prerequisite = await seedClientSubscriptionOrderPrerequisites(runtime, "astro_diary");
    await runtime.database
      .update(products)
      .set({
        revision: 2,
        astroDiaryReflectionCyclesPerPeriod: 9,
        updatedAt: new Date("2026-01-02T00:00:00.000Z")
      })
      .where(eq(products.id, prerequisite.authority.productId));

    await expect(
      createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput)
    ).rejects.toBeInstanceOf(OrderProductRevisionConflictError);
    await expect(
      runtime.database.select().from(orders).where(eq(orders.id, prerequisite.authority.orderId))
    ).resolves.toHaveLength(0);
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionPurchaseAuthorities)
        .where(eq(clientSubscriptionPurchaseAuthorities.orderId, prerequisite.authority.orderId))
    ).resolves.toHaveLength(0);
  });

  it("rejects a Diary product mislabeled as standard and an inactive relationship", async () => {
    const mislabeled = await seedClientSubscriptionOrderPrerequisites(runtime, "astro_diary");
    await expect(
      createDrizzleOrderStore(runtime.database).create({
        ...mislabeled.orderInput,
        purchasePurpose: { kind: "standard", expectedProductRevision: 1 }
      })
    ).rejects.toThrow();

    const inactive = await seedClientSubscriptionOrderPrerequisites(runtime, "astro_diary");
    await runtime.database
      .update(clientAstrologerRelationships)
      .set({ status: "blocked", blockedAt: new Date("2026-01-02T00:00:00.000Z") })
      .where(eq(clientAstrologerRelationships.id, inactive.authority.relationshipId));
    await expect(
      createDrizzleOrderStore(runtime.database).create(inactive.orderInput)
    ).rejects.toThrow();
  });

  it("commits a standard order without creating subscription purchase authority", async () => {
    const prerequisite = await seedClientSubscriptionOrderPrerequisites(runtime, "standard");
    await expect(
      createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput)
    ).resolves.toMatchObject({ id: prerequisite.authority.orderId });
    await expect(
      runtime.database
        .select()
        .from(clientSubscriptionPurchaseAuthorities)
        .where(eq(clientSubscriptionPurchaseAuthorities.orderId, prerequisite.authority.orderId))
    ).resolves.toHaveLength(0);
  });

  it("serializes two distinct orders contending for the same natural subscription slot", async () => {
    const prerequisite = await seedClientSubscriptionOrderPrerequisites(runtime, "astro_diary");
    const secondOrderId = randomUUID();
    await createDrizzleOrderStore(runtime.database).create(prerequisite.orderInput);
    await createDrizzleOrderStore(runtime.database).create({
      ...prerequisite.orderInput,
      id: secondOrderId
    });
    const unitOfWork = createDrizzleClientSubscriptionCreationUnitOfWork(runtime.database);
    const firstIds = {
      subscriptionId: randomUUID(),
      contractId: randomUUID(),
      journalEpochId: randomUUID()
    };
    const secondIds = {
      subscriptionId: randomUUID(),
      contractId: randomUUID(),
      journalEpochId: randomUUID()
    };
    const execute = (orderId: string, ids: typeof firstIds, idempotencyKey: string) =>
      executeClientSubscriptionCreation(
        unitOfWork,
        {
          ...ids,
          orderId,
          productId: prerequisite.authority.productId,
          relationshipId: prerequisite.authority.relationshipId,
          expectedSlotVersion: 0,
          idempotencyKey,
          request: { contractId: ids.contractId, journalEpochId: ids.journalEpochId }
        },
        (locked) => decideCreation(locked, ids)
      );

    const [first, second] = await Promise.all([
      execute(prerequisite.authority.orderId, firstIds, `first-${randomUUID()}`),
      execute(secondOrderId, secondIds, `second-${randomUUID()}`)
    ]);
    expect([first.outcome, second.outcome].sort()).toEqual(["created", "version_conflict"]);
  });
});

function decideCreation(
  authority: ClientSubscriptionCreationAuthority,
  ids: Readonly<{ subscriptionId: string; contractId: string; journalEpochId: string }>
): ClientSubscriptionCreationDecision {
  const sealed = sealClientSubscriptionContract({
    contractId: ids.contractId,
    order: authority.order,
    product: authority.product,
    relationship: authority.relationship,
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  if (sealed.outcome === "rejected") return sealed;
  return {
    outcome: "created",
    contract: sealed.contract,
    subscription: createPendingClientSubscription({
      subscriptionId: ids.subscriptionId,
      journalEpochId: ids.journalEpochId,
      contract: sealed.contract
    })
  };
}
