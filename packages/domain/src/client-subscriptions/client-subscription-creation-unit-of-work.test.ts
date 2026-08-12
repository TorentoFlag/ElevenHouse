import { describe, expect, it } from "vitest";
import {
  creationAuthority,
  creationDecision,
  runtimeId
} from "./client-subscription-test-fixtures";
import {
  executeClientSubscriptionCreation,
  type ClientSubscriptionCreationAuthority,
  type ClientSubscriptionCreationExecution,
  type ClientSubscriptionCreationUnitOfWork
} from "./ports/client-subscription-creation-unit-of-work";

describe("ClientSubscriptionCreationUnitOfWork boundary", () => {
  it("atomically creates contract and pending head once and replays a deterministic rejection", async () => {
    const port = new AtomicCreationMemoryUnitOfWork();
    const input = {
      subscriptionId: runtimeId(50),
      orderId: runtimeId(5),
      productId: runtimeId(6),
      relationshipId: runtimeId(7),
      expectedSlotVersion: 0,
      idempotencyKey: "create-once",
      request: { orderId: runtimeId(5) }
    } as const;
    const created = await executeClientSubscriptionCreation(port, input, (authority) =>
      creationDecision(authority, runtimeId(50))
    );
    expect(created).toMatchObject({
      outcome: "created",
      subscription: { id: runtimeId(50) },
      persistenceReceipt: {
        orderId: runtimeId(5),
        idempotencyKey: "create-once",
        slot: {
          relationshipId: runtimeId(7),
          productId: runtimeId(6),
          expectedVersion: 0,
          resultVersion: 1,
          effect: "assign"
        },
        result: { outcome: "created", subscriptionId: runtimeId(50) }
      }
    });
    expect(
      await executeClientSubscriptionCreation(port, input, () => ({
        outcome: "rejected",
        code: "inactive_product"
      }))
    ).toEqual({ outcome: "replayed", result: created });

    const rejectionPort = new AtomicCreationMemoryUnitOfWork(
      creationAuthority({ product: { status: "draft" } })
    );
    const rejectedInput = {
      subscriptionId: runtimeId(51),
      orderId: runtimeId(5),
      productId: runtimeId(6),
      relationshipId: runtimeId(7),
      expectedSlotVersion: 0,
      idempotencyKey: "reject-once",
      request: { orderId: runtimeId(6) }
    } as const;
    const rejected = await executeClientSubscriptionCreation(
      rejectionPort,
      rejectedInput,
      (authority) => creationDecision(authority, runtimeId(51))
    );
    rejectionPort.setSlotVersion(runtimeId(7), runtimeId(6), 7);
    expect(
      await executeClientSubscriptionCreation(rejectionPort, rejectedInput, () => ({
        outcome: "rejected",
        code: "inactive_relationship"
      }))
    ).toEqual({ outcome: "replayed", result: rejected });
  });

  it("rehydrates and locks current creation authorities before sealing", async () => {
    const port = new AtomicCreationMemoryUnitOfWork();
    port.beforeLockedDecision = () => {
      port.authority = creationAuthority({ product: { status: "draft" } });
    };
    const outcome = await executeClientSubscriptionCreation(
      port,
      {
        subscriptionId: runtimeId(54),
        orderId: runtimeId(5),
        productId: runtimeId(6),
        relationshipId: runtimeId(7),
        expectedSlotVersion: 0,
        idempotencyKey: "current-authority",
        request: { operation: "create_subscription" }
      },
      (authority) => creationDecision(authority, runtimeId(54))
    );
    expect(outcome).toMatchObject({ outcome: "rejected", code: "inactive_product" });
  });

  it("scopes creation idempotency to order identity without resetting slot versions", async () => {
    const port = new AtomicCreationMemoryUnitOfWork();
    const first = await executeClientSubscriptionCreation(
      port,
      {
        subscriptionId: runtimeId(55),
        orderId: runtimeId(5),
        productId: runtimeId(6),
        relationshipId: runtimeId(7),
        expectedSlotVersion: 0,
        idempotencyKey: "shared-key",
        request: { operation: "create_subscription" }
      },
      (authority) => creationDecision(authority, runtimeId(55))
    );
    port.authority = creationAuthority({
      order: { orderId: runtimeId(56), relationshipId: runtimeId(58) },
      relationship: { relationshipId: runtimeId(58) }
    });
    const second = await executeClientSubscriptionCreation(
      port,
      {
        subscriptionId: runtimeId(57),
        orderId: runtimeId(56),
        productId: runtimeId(6),
        relationshipId: runtimeId(58),
        expectedSlotVersion: 0,
        idempotencyKey: "shared-key",
        request: { operation: "create_subscription" }
      },
      (authority) => creationDecision(authority, runtimeId(57))
    );
    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("created");
  });

  it("allows only one concurrent subscription creation for one slot version", async () => {
    const port = new AtomicCreationMemoryUnitOfWork();
    const create = (idempotencyKey: string, subscriptionId: string) =>
      executeClientSubscriptionCreation(
        port,
        {
          subscriptionId,
          orderId: runtimeId(5),
          productId: runtimeId(6),
          relationshipId: runtimeId(7),
          expectedSlotVersion: 0,
          idempotencyKey,
          request: { orderId: runtimeId(5), subscriptionId }
        },
        (authority) => creationDecision(authority, subscriptionId)
      );
    const outcomes = await Promise.all([
      create("create-a", runtimeId(52)),
      create("create-b", runtimeId(53))
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["created", "version_conflict"]);
  });

  it("binds an idempotency key to the requested slot CAS version", async () => {
    const port = new AtomicCreationMemoryUnitOfWork();
    const input = {
      subscriptionId: runtimeId(59),
      orderId: runtimeId(5),
      productId: runtimeId(6),
      relationshipId: runtimeId(7),
      expectedSlotVersion: 0,
      idempotencyKey: "slot-version-bound",
      request: { operation: "create_subscription" }
    } as const;
    await executeClientSubscriptionCreation(port, input, (authority) =>
      creationDecision(authority, runtimeId(59))
    );

    await expect(
      executeClientSubscriptionCreation(port, { ...input, expectedSlotVersion: 1 }, (authority) =>
        creationDecision(authority, runtimeId(59))
      )
    ).resolves.toEqual({ outcome: "idempotency_conflict" });
  });
});

class AtomicCreationMemoryUnitOfWork implements ClientSubscriptionCreationUnitOfWork {
  authority: ClientSubscriptionCreationAuthority;
  beforeLockedDecision?: () => void;
  private serial: Promise<void> = Promise.resolve();
  private readonly slotVersions = new Map<string, number>();
  private readonly receipts = new Map<
    string,
    {
      requestHash: `sha256:${string}`;
      result: Extract<ClientSubscriptionCreationExecution, { outcome: "created" | "rejected" }>;
    }
  >();

  constructor(authority: ClientSubscriptionCreationAuthority = creationAuthority()) {
    this.authority = authority;
  }

  setSlotVersion(relationshipId: string, productId: string, version: number): void {
    this.slotVersions.set(`${relationshipId}:${productId}`, version);
  }

  execute(
    input: Parameters<ClientSubscriptionCreationUnitOfWork["execute"]>[0]
  ): Promise<ClientSubscriptionCreationExecution> {
    const run = this.serial.then(() => {
      const receiptKey = `${input.orderId}:${input.idempotencyKey}`;
      const prior = this.receipts.get(receiptKey);
      if (prior) {
        return prior.requestHash === input.requestHash
          ? { outcome: "replayed" as const, result: prior.result }
          : { outcome: "idempotency_conflict" as const };
      }
      const slotKey = `${input.relationshipId}:${input.productId}`;
      const currentSlotVersion = this.slotVersions.get(slotKey) ?? 0;
      if (input.expectedSlotVersion !== currentSlotVersion) {
        return {
          outcome: "version_conflict" as const,
          expectedVersion: input.expectedSlotVersion,
          currentVersion: currentSlotVersion
        };
      }
      this.beforeLockedDecision?.();
      if (
        this.authority.order.orderId !== input.orderId ||
        this.authority.product.productId !== input.productId ||
        this.authority.relationship.relationshipId !== input.relationshipId
      )
        return { outcome: "not_found" as const };

      const decision = input.decide(this.authority);
      const resultVersion =
        decision.outcome === "created" ? currentSlotVersion + 1 : currentSlotVersion;
      const persistenceReceipt: Extract<
        ClientSubscriptionCreationExecution,
        { outcome: "created" | "rejected" }
      >["persistenceReceipt"] = {
        orderId: input.orderId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        slot: {
          relationshipId: input.relationshipId,
          productId: input.productId,
          expectedVersion: input.expectedSlotVersion,
          resultVersion,
          effect: decision.outcome === "created" ? "assign" : "retain"
        },
        result:
          decision.outcome === "created"
            ? {
                outcome: "created",
                subscriptionId: decision.subscription.id,
                contractId: decision.contract.id,
                contractDigest: decision.contract.canonicalDigest as `sha256:${string}`
              }
            : { outcome: "rejected", code: decision.code }
      };
      const result = { ...decision, persistenceReceipt };
      this.receipts.set(receiptKey, { requestHash: input.requestHash, result });
      if (decision.outcome === "created") this.slotVersions.set(slotKey, resultVersion);
      return result;
    });
    this.serial = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}
