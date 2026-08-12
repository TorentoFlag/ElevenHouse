import { describe, expect, it } from "vitest";
import type { CanonicalJson } from "../calculations/canonical-json";
import { requestRenewalCharge, scheduleCancellation } from "./client-subscription-lifecycle";
import { activeSubscription, runtimeId } from "./client-subscription-test-fixtures";
import type { ClientSubscription } from "./client-subscription-types";
import {
  executeClientSubscriptionCommand,
  type ClientSubscriptionCommandApplied,
  type ClientSubscriptionCommandExecution,
  type ClientSubscriptionCommandPersistenceReceipt,
  type ClientSubscriptionCommandPersistedResult,
  type ClientSubscriptionCommandUnitOfWork
} from "./ports/client-subscription-command-unit-of-work";

describe("ClientSubscriptionCommandUnitOfWork boundary", () => {
  it("replays an identical command receipt without a second state/event write", async () => {
    const port = new AtomicCommandMemoryUnitOfWork(activeSubscription());
    const input = {
      subscriptionId: runtimeId(1),
      expectedVersion: 2,
      idempotencyKey: "cancel-once",
      request: { operation: "schedule_cancellation", now: "2026-02-10T00:00:00Z" }
    } as const;
    const decide = (current: ClientSubscription) =>
      scheduleCancellation(current, { now: input.request.now, eventId: runtimeId(20) });

    const first = await executeClientSubscriptionCommand(port, input, decide);
    const replay = await executeClientSubscriptionCommand(port, input, decide);

    expect(first).toMatchObject({ outcome: "applied", subscription: { version: 3 } });
    expect(replay).toEqual({ outcome: "replayed", result: first });
    expect(port.state.version).toBe(3);
    expect(port.persistedEventIds).toEqual([runtimeId(20)]);
  });

  it("allows only one concurrent command at the same expected version", async () => {
    const port = new AtomicCommandMemoryUnitOfWork(activeSubscription());
    const execute = (idempotencyKey: string, eventId: string) =>
      executeClientSubscriptionCommand(
        port,
        {
          subscriptionId: runtimeId(1),
          expectedVersion: 2,
          idempotencyKey,
          request: { operation: "schedule_cancellation", eventId }
        },
        (current) => scheduleCancellation(current, { now: "2026-02-10T00:00:00Z", eventId })
      );

    const outcomes = await Promise.all([
      execute("cancel-concurrent-a", runtimeId(21)),
      execute("cancel-concurrent-b", runtimeId(22))
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["applied", "version_conflict"]);
    expect(port.state.version).toBe(3);
    expect(port.persistedEventIds).toHaveLength(1);
  });

  it("rejects idempotency-key reuse with a different canonical request", async () => {
    const port = new AtomicCommandMemoryUnitOfWork(activeSubscription());
    const execute = (request: CanonicalJson) =>
      executeClientSubscriptionCommand(
        port,
        {
          subscriptionId: runtimeId(1),
          expectedVersion: 2,
          idempotencyKey: "same-key",
          request
        },
        (current) =>
          scheduleCancellation(current, {
            now: "2026-02-10T00:00:00Z",
            eventId: runtimeId(23)
          })
      );

    await execute({ operation: "schedule_cancellation" });
    await expect(execute({ operation: "revoke_cancellation" })).resolves.toEqual({
      outcome: "idempotency_conflict"
    });
  });

  it("binds an idempotency key to the requested CAS version", async () => {
    const port = new AtomicCommandMemoryUnitOfWork(activeSubscription());
    const input = {
      subscriptionId: runtimeId(1),
      expectedVersion: 2,
      idempotencyKey: "version-bound-key",
      request: { operation: "schedule_cancellation" }
    } as const;
    await executeClientSubscriptionCommand(port, input, (current) =>
      scheduleCancellation(current, {
        now: "2026-02-10T00:00:00Z",
        eventId: runtimeId(24)
      })
    );

    await expect(
      executeClientSubscriptionCommand(port, { ...input, expectedVersion: 3 }, (current) =>
        scheduleCancellation(current, {
          now: "2026-02-10T00:00:00Z",
          eventId: runtimeId(25)
        })
      )
    ).resolves.toEqual({ outcome: "idempotency_conflict" });
  });

  it("persists and replays deterministic rejection after the head changes", async () => {
    const port = new AtomicCommandMemoryUnitOfWork(activeSubscription());
    const rejectedInput = {
      subscriptionId: runtimeId(1),
      expectedVersion: 2,
      idempotencyKey: "rejected-once",
      request: { operation: "revoke_cancellation" }
    } as const;
    const reject = (current: ClientSubscription) =>
      requestRenewalCharge(current, {
        renewalRequestId: runtimeId(40),
        sourcePeriodId: runtimeId(99),
        intendedPeriodId: runtimeId(41),
        requestedAt: "2026-02-10T00:00:00Z",
        eventId: runtimeId(42)
      });
    const first = await executeClientSubscriptionCommand(port, rejectedInput, reject);
    expect(first).toMatchObject({
      outcome: "rejected",
      decision: { outcome: "rejected", code: "renewal_period_mismatch" }
    });

    await executeClientSubscriptionCommand(
      port,
      {
        subscriptionId: runtimeId(1),
        expectedVersion: 2,
        idempotencyKey: "advance-head",
        request: { operation: "schedule_cancellation" }
      },
      (current) =>
        scheduleCancellation(current, {
          now: "2026-02-10T00:00:00Z",
          eventId: runtimeId(43)
        })
    );
    expect(port.state.version).toBe(3);
    await expect(executeClientSubscriptionCommand(port, rejectedInput, reject)).resolves.toEqual({
      outcome: "replayed",
      result: first
    });
  });

  it("does not persist transient not-found or version-conflict outcomes", async () => {
    const port = new AtomicCommandMemoryUnitOfWork(activeSubscription());
    const decide = (current: ClientSubscription) =>
      scheduleCancellation(current, { now: "2026-02-10T00:00:00Z", eventId: runtimeId(44) });
    const missing = {
      subscriptionId: runtimeId(99),
      expectedVersion: 2,
      idempotencyKey: "transient",
      request: { operation: "schedule_cancellation" }
    } as const;
    expect(await executeClientSubscriptionCommand(port, missing, decide)).toEqual({
      outcome: "not_found"
    });
    expect(
      await executeClientSubscriptionCommand(
        port,
        { ...missing, subscriptionId: runtimeId(1), expectedVersion: 1 },
        decide
      )
    ).toEqual({ outcome: "version_conflict", expectedVersion: 1, currentVersion: 2 });
  });

  it("serializes renewal request against cancellation and rejects cancellation-first renewal", async () => {
    const port = new AtomicCommandMemoryUnitOfWork(activeSubscription());
    const requestRenewal = () =>
      executeClientSubscriptionCommand(
        port,
        {
          subscriptionId: runtimeId(1),
          expectedVersion: 2,
          idempotencyKey: "renewal-race",
          request: { operation: "request_renewal_charge" }
        },
        (current) =>
          requestRenewalCharge(current, {
            renewalRequestId: runtimeId(30),
            sourcePeriodId: runtimeId(10),
            intendedPeriodId: runtimeId(11),
            requestedAt: "2026-02-10T00:00:00Z",
            eventId: runtimeId(31)
          })
      );
    const cancel = () =>
      executeClientSubscriptionCommand(
        port,
        {
          subscriptionId: runtimeId(1),
          expectedVersion: 2,
          idempotencyKey: "cancel-race",
          request: { operation: "schedule_cancellation" }
        },
        (current) =>
          scheduleCancellation(current, {
            now: "2026-02-10T00:00:00Z",
            eventId: runtimeId(32)
          })
      );
    const outcomes = await Promise.all([requestRenewal(), cancel()]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["applied", "version_conflict"]);

    const cancellationFirst = new AtomicCommandMemoryUnitOfWork(activeSubscription());
    await executeClientSubscriptionCommand(
      cancellationFirst,
      {
        subscriptionId: runtimeId(1),
        expectedVersion: 2,
        idempotencyKey: "cancel-first",
        request: { operation: "schedule_cancellation" }
      },
      (current) =>
        scheduleCancellation(current, {
          now: "2026-02-10T00:00:00Z",
          eventId: runtimeId(33)
        })
    );
    const rejected = await executeClientSubscriptionCommand(
      cancellationFirst,
      {
        subscriptionId: runtimeId(1),
        expectedVersion: 3,
        idempotencyKey: "renew-after-cancel",
        request: { operation: "request_renewal_charge" }
      },
      (current) =>
        requestRenewalCharge(current, {
          renewalRequestId: runtimeId(34),
          sourcePeriodId: runtimeId(10),
          intendedPeriodId: runtimeId(11),
          requestedAt: "2026-02-11T00:00:00Z",
          eventId: runtimeId(35)
        })
    );
    expect(rejected).toMatchObject({ outcome: "rejected", decision: { code: "renewal_disabled" } });
  });

  it("persists an idempotent domain decision as success rather than rejection", async () => {
    const cancelled = scheduleCancellation(activeSubscription(), {
      now: "2026-02-10T00:00:00Z",
      eventId: runtimeId(81)
    });
    if (cancelled.outcome !== "applied") throw new Error("cancellation must apply");
    const port = new AtomicCommandMemoryUnitOfWork(cancelled.subscription);
    const result = await executeClientSubscriptionCommand(
      port,
      {
        subscriptionId: runtimeId(1),
        expectedVersion: 3,
        idempotencyKey: "already-cancelled",
        request: { operation: "schedule_cancellation" }
      },
      (current) =>
        scheduleCancellation(current, {
          now: "2026-02-11T00:00:00Z",
          eventId: runtimeId(82)
        })
    );
    expect(result).toMatchObject({
      outcome: "idempotent",
      subscription: { version: 3 },
      events: [],
      commandReceipt: { result: { outcome: "idempotent", subscriptionVersion: 3 } }
    });
  });
});

class AtomicCommandMemoryUnitOfWork implements ClientSubscriptionCommandUnitOfWork {
  readonly persistedEventIds: string[] = [];
  private readonly receipts = new Map<
    string,
    {
      readonly requestHash: `sha256:${string}`;
      readonly result: ClientSubscriptionCommandPersistedResult;
    }
  >();
  private serial: Promise<void> = Promise.resolve();

  constructor(public state: ClientSubscription) {}

  execute(
    input: Parameters<ClientSubscriptionCommandUnitOfWork["execute"]>[0]
  ): Promise<ClientSubscriptionCommandExecution> {
    const run = this.serial.then(() => this.executeSerial(input));
    this.serial = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private executeSerial(
    input: Parameters<ClientSubscriptionCommandUnitOfWork["execute"]>[0]
  ): ClientSubscriptionCommandExecution {
    if (input.subscriptionId !== this.state.id) return { outcome: "not_found" };
    const prior = this.receipts.get(input.idempotencyKey);
    if (prior) {
      return prior.requestHash === input.requestHash
        ? { outcome: "replayed", result: prior.result }
        : { outcome: "idempotency_conflict" };
    }
    if (input.expectedVersion !== this.state.version) {
      return {
        outcome: "version_conflict",
        expectedVersion: input.expectedVersion,
        currentVersion: this.state.version
      };
    }
    const decision = input.decide(this.state);
    if (decision.outcome !== "applied") {
      const commandReceipt: ClientSubscriptionCommandPersistenceReceipt = {
        subscriptionId: input.subscriptionId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        result:
          decision.outcome === "idempotent"
            ? { outcome: "idempotent", subscriptionVersion: decision.subscription.version }
            : { outcome: "rejected", code: decision.code }
      };
      const result =
        decision.outcome === "idempotent"
          ? {
              outcome: "idempotent" as const,
              subscription: decision.subscription,
              events: [] as const,
              commandReceipt
            }
          : { outcome: "rejected" as const, decision, commandReceipt };
      this.receipts.set(input.idempotencyKey, { requestHash: input.requestHash, result });
      return result;
    }
    if (decision.subscription.version !== this.state.version + 1) {
      throw new Error("Applied transition must advance subscription version exactly once");
    }
    this.state = decision.subscription;
    this.persistedEventIds.push(...decision.events.map(({ eventId }) => eventId));
    const result: ClientSubscriptionCommandApplied = {
      outcome: "applied",
      subscription: decision.subscription,
      events: decision.events,
      receipt: decision.receipt,
      commandReceipt: {
        subscriptionId: input.subscriptionId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        result: {
          outcome: "applied",
          subscriptionVersion: decision.subscription.version,
          transitionId: decision.receipt.transitionId,
          slotEffect: decision.receipt.slotEffect
        }
      }
    };
    this.receipts.set(input.idempotencyKey, { requestHash: input.requestHash, result });
    return result;
  }
}
