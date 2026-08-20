import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CreateFinanceOrderRecordInput } from "@elevenhouse/domain";

import type { PostgresRuntime } from "../../runtime";
import { reviewableInstances } from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  seedClientSubscriptionOrderPrerequisites,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleOrderStore } from "../finance/drizzle-order-store";
import { createDrizzleReviewableInstanceReceiptStore } from "./drizzle-reviewable-instance-receipt-store";

describe.sequential("Drizzle reviewable instance receipt store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("creates an idempotent reviewable instance from a server-owned delivery receipt", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);
    const sourceResourceKey = `async_delivery:${randomUUID()}`;

    const created = await store.upsertFromReceipt({
      nextReviewableInstanceId: randomUUID(),
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.astrologerUserId,
      kind: "async_delivery",
      sourceResourceKey,
      productId: fixture.productId,
      orderId: fixture.orderId,
      bookingId: null,
      titleSnapshot: "Письменный разбор",
      contextLabelSnapshot: "Материал выдан клиенту",
      receivedAt: "2026-08-20T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      now: "2026-08-20T10:01:00.000Z"
    });

    expect(created).toMatchObject({
      kind: "created",
      instance: {
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        relationshipId: fixture.relationshipId,
        kind: "async_delivery",
        status: "reviewable",
        sourceResourceKey,
        reviewWindowClosesAt: "2026-09-03T10:00:00.000Z"
      }
    });

    const repeated = await store.upsertFromReceipt({
      nextReviewableInstanceId: randomUUID(),
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.astrologerUserId,
      kind: "async_delivery",
      sourceResourceKey,
      productId: fixture.productId,
      orderId: fixture.orderId,
      bookingId: null,
      titleSnapshot: "Письменный разбор",
      contextLabelSnapshot: "Материал выдан клиенту",
      receivedAt: "2026-08-20T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      now: "2026-08-20T10:02:00.000Z"
    });

    expect(repeated).toMatchObject({
      kind: "existing",
      instance: { id: created.kind === "created" ? created.instance.id : "" }
    });
    const [rowCount] = await runtime.database
      .select({ value: count() })
      .from(reviewableInstances)
      .where(eq(reviewableInstances.sourceResourceKey, sourceResourceKey));
    expect(Number(rowCount?.value ?? 0)).toBe(1);
  });

  it("allows several received products within the same client relationship", async () => {
    const fixture = await seedPaidOrderFixture(runtime);
    const secondOrderInput = {
      ...fixture.orderInput,
      id: randomUUID(),
      now: "2026-08-20T11:00:00.000Z"
    } satisfies CreateFinanceOrderRecordInput;
    const secondOrder = await createDrizzleOrderStore(runtime.database).create(secondOrderInput);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    const first = await store.upsertFromReceipt({
      nextReviewableInstanceId: randomUUID(),
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.astrologerUserId,
      kind: "async_delivery",
      sourceResourceKey: `async_delivery:${randomUUID()}`,
      productId: fixture.productId,
      orderId: fixture.orderId,
      bookingId: null,
      titleSnapshot: "Письменный разбор",
      contextLabelSnapshot: "Материал 1",
      receivedAt: "2026-08-20T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      now: "2026-08-20T10:01:00.000Z"
    });
    const second = await store.upsertFromReceipt({
      nextReviewableInstanceId: randomUUID(),
      clientUserId: fixture.clientUserId,
      astrologerUserId: fixture.astrologerUserId,
      kind: "instant_delivery",
      sourceResourceKey: `instant_delivery:${randomUUID()}`,
      productId: fixture.productId,
      orderId: secondOrder.id,
      bookingId: null,
      titleSnapshot: "Моментальный материал",
      contextLabelSnapshot: "Материал 2",
      receivedAt: "2026-08-21T10:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      now: "2026-08-21T10:01:00.000Z"
    });

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");
    const rows = await runtime.database
      .select({ id: reviewableInstances.id })
      .from(reviewableInstances)
      .where(eq(reviewableInstances.relationshipId, fixture.relationshipId));
    expect(rows).toHaveLength(2);
  });

  it("does not open a review window from a pending payment order context", async () => {
    const fixture = await seedPendingOrderFixture(runtime);
    const store = createDrizzleReviewableInstanceReceiptStore(runtime.database);

    await expect(
      store.upsertFromReceipt({
        nextReviewableInstanceId: randomUUID(),
        clientUserId: fixture.clientUserId,
        astrologerUserId: fixture.astrologerUserId,
        kind: "async_delivery",
        sourceResourceKey: `async_delivery:${randomUUID()}`,
        productId: fixture.productId,
        orderId: fixture.orderId,
        bookingId: null,
        titleSnapshot: "Письменный разбор",
        contextLabelSnapshot: "Материал выдан клиенту",
        receivedAt: "2026-08-20T10:00:00.000Z",
        windowPolicy: "standard_14_days_after_receipt",
        now: "2026-08-20T10:01:00.000Z"
      })
    ).resolves.toEqual({ kind: "rejected", reason: "order_not_reviewable" });
  });
});

type OrderFixture = {
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly productId: string;
  readonly relationshipId: string;
  readonly orderId: string;
  readonly orderInput: CreateFinanceOrderRecordInput;
};

async function seedPaidOrderFixture(runtime: PostgresRuntime): Promise<OrderFixture> {
  return seedOrderFixture(runtime, "paid");
}

async function seedPendingOrderFixture(runtime: PostgresRuntime): Promise<OrderFixture> {
  return seedOrderFixture(runtime, "pending_payment");
}

async function seedOrderFixture(
  runtime: PostgresRuntime,
  status: "paid" | "pending_payment"
): Promise<OrderFixture> {
  const prerequisite = await seedClientSubscriptionOrderPrerequisites(runtime, "standard");
  const orderInput = {
    ...prerequisite.orderInput,
    status
  } satisfies CreateFinanceOrderRecordInput;
  const order = await createDrizzleOrderStore(runtime.database).create(orderInput);
  return {
    clientUserId: prerequisite.authority.clientUserId,
    astrologerUserId: prerequisite.authority.astrologerUserId,
    productId: prerequisite.authority.productId,
    relationshipId: prerequisite.authority.relationshipId,
    orderId: order.id,
    orderInput
  };
}
