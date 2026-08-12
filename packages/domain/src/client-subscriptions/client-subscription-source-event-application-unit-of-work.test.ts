import { describe, expect, it } from "vitest";
import {
  createPendingClientSubscription,
  endPendingInitialPayment,
  scheduleCancellation
} from "./client-subscription-lifecycle";
import { activeSubscription, runtimeId } from "./client-subscription-test-fixtures";
import type { ClientSubscription } from "./client-subscription-types";
import {
  applyClientSubscriptionSourceEvent,
  type ClientSubscriptionSourceEventApplicationExecution,
  type ClientSubscriptionSourceEventApplicationUnitOfWork
} from "./ports/client-subscription-source-event-application-unit-of-work";

describe("ClientSubscriptionSourceEventApplicationUnitOfWork boundary", () => {
  it("applies once, replays exact identity, and rejects a mismatched source identity", async () => {
    const port = new AtomicSourceEventMemoryUnitOfWork(activeSubscription());
    const input = {
      subscriptionId: runtimeId(1),
      expectedVersion: 2,
      sourceEventId: runtimeId(60),
      sourceEventDigest: `sha256:${"b".repeat(64)}` as const,
      evidenceId: runtimeId(61)
    };
    const first = await applyClientSubscriptionSourceEvent(port, input, (current) =>
      scheduleCancellation(current, { now: "2026-02-10T00:00:00Z", eventId: runtimeId(62) })
    );
    expect(first).toMatchObject({
      outcome: "applied",
      subscription: { version: 3 },
      applicationReceipt: {
        subscriptionId: runtimeId(1),
        sourceEventId: runtimeId(60),
        sourceEventDigest: `sha256:${"b".repeat(64)}`,
        evidenceId: runtimeId(61),
        result: { outcome: "applied", subscriptionVersion: 3, slotEffect: "retain" }
      }
    });
    expect(
      await applyClientSubscriptionSourceEvent(port, input, () => ({
        outcome: "rejected",
        code: "subscription_revoked"
      }))
    ).toEqual({ outcome: "replayed", result: first });
    expect(
      await applyClientSubscriptionSourceEvent(
        port,
        { ...input, sourceEventDigest: `sha256:${"c".repeat(64)}` },
        () => ({ outcome: "rejected", code: "subscription_revoked" })
      )
    ).toEqual({ outcome: "source_event_conflict" });

    const rejectionPort = new AtomicSourceEventMemoryUnitOfWork(activeSubscription());
    const rejectedInput = { ...input, sourceEventId: runtimeId(63) };
    const rejected = await applyClientSubscriptionSourceEvent(rejectionPort, rejectedInput, () => ({
      outcome: "rejected",
      code: "renewal_request_mismatch"
    }));
    expect(
      await applyClientSubscriptionSourceEvent(rejectionPort, rejectedInput, () => ({
        outcome: "rejected",
        code: "subscription_revoked"
      }))
    ).toEqual({ outcome: "replayed", result: rejected });
  });

  it("serializes source events and leaves not-found/version-conflict unsealed", async () => {
    const port = new AtomicSourceEventMemoryUnitOfWork(activeSubscription());
    const execute = (sourceEventId: string) =>
      applyClientSubscriptionSourceEvent(
        port,
        {
          subscriptionId: runtimeId(1),
          expectedVersion: 2,
          sourceEventId,
          sourceEventDigest: `sha256:${"f".repeat(64)}`,
          evidenceId: sourceEventId
        },
        (current) =>
          scheduleCancellation(current, {
            now: "2026-02-10T00:00:00Z",
            eventId: runtimeId(65)
          })
      );
    const outcomes = await Promise.all([execute(runtimeId(66)), execute(runtimeId(67))]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["applied", "version_conflict"]);

    const transientPort = new AtomicSourceEventMemoryUnitOfWork(activeSubscription());
    const transient = {
      subscriptionId: runtimeId(99),
      expectedVersion: 2,
      sourceEventId: runtimeId(68),
      sourceEventDigest: `sha256:${"1".repeat(64)}` as const,
      evidenceId: runtimeId(69)
    };
    expect(
      await applyClientSubscriptionSourceEvent(transientPort, transient, () => ({
        outcome: "rejected",
        code: "subscription_revoked"
      }))
    ).toEqual({ outcome: "not_found" });
    expect(
      await applyClientSubscriptionSourceEvent(
        transientPort,
        { ...transient, subscriptionId: runtimeId(1), expectedVersion: 1 },
        () => ({ outcome: "rejected", code: "subscription_revoked" })
      )
    ).toEqual({ outcome: "version_conflict", expectedVersion: 1, currentVersion: 2 });
  });

  it("persists slot release and quarantines an evidence ID claimed by another source", async () => {
    const port = new AtomicSourceEventMemoryUnitOfWork(
      createPendingClientSubscription({
        subscriptionId: runtimeId(75),
        journalEpochId: runtimeId(2),
        contract: activeSubscription().contract
      })
    );
    const evidenceId = runtimeId(76);
    const input = {
      subscriptionId: runtimeId(75),
      expectedVersion: 1,
      sourceEventId: runtimeId(77),
      sourceEventDigest: `sha256:${"2".repeat(64)}` as const,
      evidenceId
    };
    const ended = await applyClientSubscriptionSourceEvent(port, input, (current) =>
      endPendingInitialPayment(current, {
        sourceEventId: input.sourceEventId,
        evidenceId,
        reason: "checkout_expired",
        observedAt: "2026-01-02T00:00:00Z",
        eventId: runtimeId(78)
      })
    );
    expect(ended).toMatchObject({
      outcome: "applied",
      receipt: { entitlementScope: "none", slotEffect: "release" },
      applicationReceipt: { result: { slotEffect: "release" } }
    });
    expect(
      await applyClientSubscriptionSourceEvent(
        port,
        {
          ...input,
          expectedVersion: 2,
          sourceEventId: runtimeId(79),
          sourceEventDigest: `sha256:${"3".repeat(64)}`
        },
        (current) =>
          endPendingInitialPayment(current, {
            sourceEventId: runtimeId(79),
            evidenceId,
            reason: "payment_failed",
            observedAt: "2026-01-02T00:00:00Z",
            eventId: runtimeId(80)
          })
      )
    ).toEqual({ outcome: "evidence_conflict" });
  });

  it("persists an idempotent decision as a successful application receipt", async () => {
    const cancelled = scheduleCancellation(activeSubscription(), {
      now: "2026-02-10T00:00:00Z",
      eventId: runtimeId(81)
    });
    if (cancelled.outcome !== "applied") throw new Error("cancellation must apply");
    const port = new AtomicSourceEventMemoryUnitOfWork(cancelled.subscription);
    const result = await applyClientSubscriptionSourceEvent(
      port,
      {
        subscriptionId: runtimeId(1),
        expectedVersion: 3,
        sourceEventId: runtimeId(83),
        sourceEventDigest: `sha256:${"4".repeat(64)}`,
        evidenceId: runtimeId(85)
      },
      (current) =>
        scheduleCancellation(current, {
          now: "2026-02-11T00:00:00Z",
          eventId: runtimeId(84)
        })
    );
    expect(result).toMatchObject({
      outcome: "idempotent",
      subscription: { version: 3 },
      events: [],
      applicationReceipt: { result: { outcome: "idempotent", subscriptionVersion: 3 } }
    });
  });
});

class AtomicSourceEventMemoryUnitOfWork implements ClientSubscriptionSourceEventApplicationUnitOfWork {
  private serial: Promise<void> = Promise.resolve();
  private readonly evidenceSources = new Map<string, string>();
  private readonly receipts = new Map<
    string,
    {
      digest: `sha256:${string}`;
      evidenceId: string;
      result: Extract<
        ClientSubscriptionSourceEventApplicationExecution,
        { outcome: "applied" | "idempotent" | "rejected" }
      >;
    }
  >();

  constructor(private state: ClientSubscription) {
    for (const evidenceId of state.appliedFinanceEvidenceIds) {
      this.evidenceSources.set(evidenceId, "already_applied");
    }
  }

  apply(
    input: Parameters<ClientSubscriptionSourceEventApplicationUnitOfWork["apply"]>[0]
  ): Promise<ClientSubscriptionSourceEventApplicationExecution> {
    const run = this.serial.then(() => {
      const prior = this.receipts.get(input.sourceEventId);
      if (prior) {
        return prior.digest === input.sourceEventDigest && prior.evidenceId === input.evidenceId
          ? { outcome: "replayed" as const, result: prior.result }
          : { outcome: "source_event_conflict" as const };
      }
      const evidenceSource = this.evidenceSources.get(input.evidenceId);
      if (evidenceSource && evidenceSource !== input.sourceEventId) {
        return { outcome: "evidence_conflict" as const };
      }
      if (input.subscriptionId !== this.state.id) return { outcome: "not_found" as const };
      if (input.expectedVersion !== this.state.version) {
        return {
          outcome: "version_conflict" as const,
          expectedVersion: input.expectedVersion,
          currentVersion: this.state.version
        };
      }
      const decision = input.decide(this.state);
      const applicationReceipt = {
        subscriptionId: input.subscriptionId,
        sourceEventId: input.sourceEventId,
        sourceEventDigest: input.sourceEventDigest,
        evidenceId: input.evidenceId,
        result:
          decision.outcome === "applied"
            ? {
                outcome: "applied" as const,
                subscriptionVersion: decision.subscription.version,
                transitionId: decision.receipt.transitionId,
                slotEffect: decision.receipt.slotEffect
              }
            : decision.outcome === "idempotent"
              ? {
                  outcome: "idempotent" as const,
                  subscriptionVersion: decision.subscription.version
                }
              : { outcome: "rejected" as const, code: decision.code }
      };
      const result =
        decision.outcome === "applied"
          ? {
              outcome: "applied" as const,
              subscription: decision.subscription,
              events: decision.events,
              receipt: decision.receipt,
              applicationReceipt
            }
          : decision.outcome === "idempotent"
            ? {
                outcome: "idempotent" as const,
                subscription: decision.subscription,
                events: [] as const,
                applicationReceipt
              }
            : { outcome: "rejected" as const, decision, applicationReceipt };
      if (decision.outcome === "applied") this.state = decision.subscription;
      this.receipts.set(input.sourceEventId, {
        digest: input.sourceEventDigest,
        evidenceId: input.evidenceId,
        result
      });
      this.evidenceSources.set(input.evidenceId, input.sourceEventId);
      return result;
    });
    this.serial = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}
