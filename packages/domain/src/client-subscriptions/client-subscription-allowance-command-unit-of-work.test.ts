import { describe, expect, it } from "vitest";
import { createPeriodAllowance, reservePeriodAllowance } from "./client-subscription-allowance";
import { runtimeId } from "./client-subscription-test-fixtures";
import {
  executeClientSubscriptionAllowanceCommand,
  validateClientSubscriptionAllowanceDecision,
  type ClientSubscriptionAllowanceCommandExecution,
  type ClientSubscriptionAllowanceCommandUnitOfWork
} from "./ports/client-subscription-allowance-command-unit-of-work";

describe("ClientSubscriptionAllowanceCommandUnitOfWork boundary", () => {
  it("persists one canonical receipt and serializes concurrent commands", async () => {
    const port = new AtomicAllowanceMemoryUnitOfWork(
      createPeriodAllowance({
        periodId: runtimeId(70),
        total: 1,
        endsAt: "2026-03-01T00:00:00Z"
      })
    );
    const execute = (idempotencyKey: string, reservationId: string) =>
      executeClientSubscriptionAllowanceCommand(
        port,
        {
          periodId: runtimeId(70),
          expectedVersion: 1,
          idempotencyKey,
          command: {
            operation: "reserve",
            reservationId,
            occurredAt: "2026-02-01T00:00:00Z"
          }
        },
        (current) =>
          reservePeriodAllowance(current, {
            expectedVersion: 1,
            idempotencyKey,
            reservationId,
            now: "2026-02-01T00:00:00Z"
          })
      );
    const outcomes = await Promise.all([
      execute("reserve-a", runtimeId(71)),
      execute("reserve-b", runtimeId(72))
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["applied", "version_conflict"]);
    const winner = outcomes.find(({ outcome }) => outcome === "applied")!;
    if (winner.outcome !== "applied") throw new Error("one reservation must win");
    const winnerReservation =
      winner.receipt.idempotencyKey === "reserve-a" ? runtimeId(71) : runtimeId(72);
    expect(await execute(winner.receipt.idempotencyKey, winnerReservation)).toEqual({
      outcome: "replayed",
      result: winner
    });
    expect(winner).toMatchObject({
      receipt: {
        periodId: runtimeId(70),
        idempotencyKey: winner.receipt.idempotencyKey,
        resultVersion: 2,
        result: { outcome: "applied" }
      }
    });
  });

  it("replays deterministic rejection after the allowance head changes", async () => {
    const port = new AtomicAllowanceMemoryUnitOfWork(
      createPeriodAllowance({
        periodId: runtimeId(70),
        total: 0,
        endsAt: "2026-03-01T00:00:00Z"
      })
    );
    const input = {
      periodId: runtimeId(70),
      expectedVersion: 1,
      idempotencyKey: "exhausted",
      command: {
        operation: "reserve",
        reservationId: runtimeId(73),
        occurredAt: "2026-02-01T00:00:00Z"
      }
    } as const;
    const first = await executeClientSubscriptionAllowanceCommand(port, input, (current) =>
      reservePeriodAllowance(current, {
        expectedVersion: 1,
        idempotencyKey: "exhausted",
        reservationId: runtimeId(73),
        now: "2026-02-01T00:00:00Z"
      })
    );
    expect(first).toMatchObject({
      outcome: "rejected",
      decision: { outcome: "allowance_exhausted" },
      receipt: { result: { outcome: "rejected" } }
    });
    port.replaceState(
      createPeriodAllowance({
        periodId: runtimeId(70),
        total: 1,
        endsAt: "2026-03-01T00:00:00Z"
      })
    );
    expect(
      await executeClientSubscriptionAllowanceCommand(port, input, () => ({
        outcome: "reservation_not_found"
      }))
    ).toEqual({ outcome: "replayed", result: first });
  });

  it("rejects an inner aggregate receipt that does not match the persistence command", () => {
    const allowance = createPeriodAllowance({
      periodId: runtimeId(70),
      total: 1,
      endsAt: "2026-03-01T00:00:00Z"
    });
    const decision = reservePeriodAllowance(allowance, {
      expectedVersion: 1,
      idempotencyKey: "inner-key",
      reservationId: runtimeId(71),
      now: "2026-02-01T00:00:00Z"
    });
    expect(() =>
      validateClientSubscriptionAllowanceDecision(
        {
          periodId: runtimeId(70),
          expectedVersion: 1,
          idempotencyKey: "outer-key",
          requestHash: `sha256:${"f".repeat(64)}`,
          command: {
            operation: "reserve",
            reservationId: runtimeId(71),
            occurredAt: "2026-02-01T00:00:00Z"
          }
        },
        decision
      )
    ).toThrow("Allowance decision receipt does not match the persistence command");
  });

  it("binds an idempotency key to the requested allowance CAS version", async () => {
    const port = new AtomicAllowanceMemoryUnitOfWork(
      createPeriodAllowance({
        periodId: runtimeId(70),
        total: 1,
        endsAt: "2026-03-01T00:00:00Z"
      })
    );
    const input = {
      periodId: runtimeId(70),
      expectedVersion: 1,
      idempotencyKey: "allowance-version-bound",
      command: {
        operation: "reserve",
        reservationId: runtimeId(75),
        occurredAt: "2026-02-01T00:00:00Z"
      }
    } as const;
    await executeClientSubscriptionAllowanceCommand(port, input, (current) =>
      reservePeriodAllowance(current, {
        expectedVersion: 1,
        idempotencyKey: input.idempotencyKey,
        reservationId: runtimeId(75),
        now: "2026-02-01T00:00:00Z"
      })
    );

    await expect(
      executeClientSubscriptionAllowanceCommand(port, { ...input, expectedVersion: 2 }, () => ({
        outcome: "reservation_not_found"
      }))
    ).resolves.toEqual({ outcome: "idempotency_conflict" });
  });
});

class AtomicAllowanceMemoryUnitOfWork implements ClientSubscriptionAllowanceCommandUnitOfWork {
  private serial: Promise<void> = Promise.resolve();
  private readonly receipts = new Map<
    string,
    {
      requestHash: `sha256:${string}`;
      result: Extract<
        ClientSubscriptionAllowanceCommandExecution,
        { outcome: "applied" | "rejected" }
      >;
    }
  >();

  constructor(private state: ReturnType<typeof createPeriodAllowance>) {}

  replaceState(state: ReturnType<typeof createPeriodAllowance>): void {
    this.state = state;
  }

  execute(
    input: Parameters<ClientSubscriptionAllowanceCommandUnitOfWork["execute"]>[0]
  ): Promise<ClientSubscriptionAllowanceCommandExecution> {
    const run = this.serial.then(() => {
      const prior = this.receipts.get(input.idempotencyKey);
      if (prior) {
        return prior.requestHash === input.requestHash
          ? { outcome: "replayed" as const, result: prior.result }
          : { outcome: "idempotency_conflict" as const };
      }
      if (input.periodId !== this.state.periodId) return { outcome: "not_found" as const };
      if (input.expectedVersion !== this.state.version) {
        return {
          outcome: "version_conflict" as const,
          expectedVersion: input.expectedVersion,
          currentVersion: this.state.version
        };
      }
      const decision = input.decide(this.state);
      if (decision.outcome === "applied") {
        if (!decision.receipt) throw new Error("Applied allowance decision requires receipt");
        validateClientSubscriptionAllowanceDecision(input, decision);
        const receipt = {
          periodId: input.periodId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          command: input.command,
          resultVersion: decision.allowance.version,
          result: { outcome: "applied" as const }
        };
        const result = { outcome: "applied" as const, allowance: decision.allowance, receipt };
        this.state = decision.allowance;
        this.receipts.set(input.idempotencyKey, { requestHash: input.requestHash, result });
        return result;
      }
      if ("allowance" in decision) throw new Error("Port owns replay outcomes");
      if (decision.outcome === "version_conflict" || decision.outcome === "idempotency_conflict") {
        throw new Error("Port owns transient and replay outcomes");
      }
      const rejectedDecision = decision;
      const receipt = {
        periodId: input.periodId,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        command: input.command,
        resultVersion: this.state.version,
        result: { outcome: "rejected" as const, decision: rejectedDecision }
      };
      const result = { outcome: "rejected" as const, decision: rejectedDecision, receipt };
      this.receipts.set(input.idempotencyKey, { requestHash: input.requestHash, result });
      return result;
    });
    this.serial = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}
