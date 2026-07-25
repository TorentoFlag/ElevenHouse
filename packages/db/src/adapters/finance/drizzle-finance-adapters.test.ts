import { describe, expect, it } from "vitest";
import {
  FinanceIdempotencyConflictError,
  FinanceProviderContextMismatchError,
  FinanceProviderPaymentMismatchError,
  LedgerAccountShapeError,
  LedgerUnbalancedTransactionError,
  PayoutStatusEvidenceError,
  type FinanceIdempotentCommand
} from "@elevenhouse/domain";
import { financeIdempotencyCommands } from "../../schema";
import {
  executeIdempotentFinanceCommand,
  isFinanceIdempotencyUniqueViolation
} from "./drizzle-finance-command-store";
import {
  assertFinanceLedgerBalanced,
  assertLedgerAccountShape
} from "./drizzle-ledger-store";
import {
  assertProviderEventPaymentMatchesAttempt,
  resolveFinanceRefundProviderContext
} from "./drizzle-payment-store";
import { assertPayoutStatusEvidence } from "./drizzle-payout-store";

const now = "2026-07-24T10:00:00.000Z";
const command: FinanceIdempotentCommand = {
  scope: "finance.test",
  idempotencyKey: "idem-1",
  actorUserId: "00000000-0000-4000-8000-000000000001",
  requestHash: `sha256:${"a".repeat(64)}`,
  now,
  expiresAt: "2026-07-25T10:00:00.000Z"
};

describe("executeIdempotentFinanceCommand", () => {
  it("inserts command, business writes and completed result in one transaction", async () => {
    const fake = createFakeIdempotencyDatabase({ mode: "created" });

    const result = await executeIdempotentFinanceCommand({
      database: fake.database as never,
      command,
      create: async () => ({ result: { orderId: "order-1" }, value: "created-value" }),
      replay: async () => null
    });

    expect(result).toEqual({ kind: "created", value: "created-value" });
    expect(fake.inserts).toEqual([
      {
        table: financeIdempotencyCommands,
        value: expect.objectContaining({
          scope: "finance.test",
          idempotencyKey: "idem-1",
          requestHash: command.requestHash
        })
      }
    ]);
    expect(fake.updates).toEqual([
      {
        table: financeIdempotencyCommands,
        value: expect.objectContaining({
          state: "completed",
          result: { orderId: "order-1" }
        })
      }
    ]);
  });

  it("replays completed result for the same key and request hash", async () => {
    const fake = createFakeIdempotencyDatabase({
      mode: "duplicate",
      existing: {
        requestHash: command.requestHash,
        state: "completed",
        result: { orderId: "order-1" },
        errorCode: null
      }
    });

    const result = await executeIdempotentFinanceCommand({
      database: fake.database as never,
      command,
      create: async () => {
        throw new Error("create should not run on replay");
      },
      replay: async (persistedResult) =>
        persistedResult.orderId === "order-1" ? "replayed-value" : null
    });

    expect(result).toEqual({ kind: "replayed", value: "replayed-value" });
  });

  it("rejects the same key with a different request hash", async () => {
    const fake = createFakeIdempotencyDatabase({
      mode: "duplicate",
      existing: {
        requestHash: `sha256:${"b".repeat(64)}`,
        state: "completed",
        result: { orderId: "order-1" },
        errorCode: null
      }
    });

    await expect(
      executeIdempotentFinanceCommand({
        database: fake.database as never,
        command,
        create: async () => ({ result: { orderId: "new-order" }, value: "created" }),
        replay: async () => "replayed"
      })
    ).rejects.toBeInstanceOf(FinanceIdempotencyConflictError);
  });
});

describe("finance adapter guardrails", () => {
  it("rejects unbalanced ledger input before DB writes", () => {
    expect(() =>
      assertFinanceLedgerBalanced([
        ledgerEntry("debit", 5_000, "platform_clearing", null),
        ledgerEntry("credit", 4_999, "astrologer_pending", command.actorUserId)
      ])
    ).toThrow(LedgerUnbalancedTransactionError);
  });

  it("validates platform and astrologer ledger account shapes", () => {
    expect(() =>
      assertLedgerAccountShape({
        accountType: "platform_revenue",
        astrologerUserId: command.actorUserId,
        currency: "RUB"
      })
    ).toThrow(LedgerAccountShapeError);

    expect(() =>
      assertLedgerAccountShape({
        accountType: "astrologer_available",
        astrologerUserId: null,
        currency: "RUB"
      })
    ).toThrow(LedgerAccountShapeError);
  });

  it("copies refund provider context from the linked attempt and rejects mismatches", () => {
    const attempt = { provider: "arc_pay" as const, environment: "live" as const };
    expect(resolveFinanceRefundProviderContext({}, attempt)).toEqual(attempt);
    expect(() =>
      resolveFinanceRefundProviderContext({ environment: "sandbox" }, attempt)
    ).toThrow(FinanceProviderContextMismatchError);
  });

  it("rejects provider events linked to a different provider payment id", () => {
    expect(() =>
      assertProviderEventPaymentMatchesAttempt(
        { providerPaymentId: "arc-payment-other" },
        { providerPaymentId: "arc-payment-1" }
      )
    ).toThrow(FinanceProviderPaymentMismatchError);
    expect(() =>
      assertProviderEventPaymentMatchesAttempt(
        { providerPaymentId: "arc-payment-1" },
        { providerPaymentId: "arc-payment-1" }
      )
    ).not.toThrow();
  });

  it("enforces payout status evidence before DB update", () => {
    expect(() => assertPayoutStatusEvidence({ status: "paid" })).toThrow(
      PayoutStatusEvidenceError
    );
    expect(() => assertPayoutStatusEvidence({ status: "failed" })).toThrow(
      PayoutStatusEvidenceError
    );
    expect(() =>
      assertPayoutStatusEvidence({
        status: "paid",
        externalReference: "manual-transfer-42",
        transferredAt: now
      })
    ).not.toThrow();
  });
});

function ledgerEntry(
  side: "debit" | "credit",
  amountMinor: number,
  accountType: "platform_clearing" | "astrologer_pending",
  astrologerUserId: string | null
) {
  return {
    account: { accountType, astrologerUserId, currency: "RUB" as const },
    side,
    amount: { amountMinor, currency: "RUB" as const },
    metadata: {}
  };
}

function createFakeIdempotencyDatabase(input: {
  readonly mode: "created" | "duplicate";
  readonly existing?: Record<string, unknown>;
}) {
  const inserts: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const updates: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const duplicateError = {
    code: "23505",
    constraint: "finance_idempotency_commands_scope_key_unique"
  };

  const transaction = async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> =>
    callback({
      insert: (table: unknown) => ({
        values: (value: Record<string, unknown>) => ({
          returning: async () => {
            if (input.mode === "duplicate") throw duplicateError;
            inserts.push({ table, value });
            return [{ id: "finance-command-1" }];
          }
        })
      }),
      update: (table: unknown) => ({
        set: (value: Record<string, unknown>) => ({
          where: async () => {
            updates.push({ table, value });
            return [];
          }
        })
      })
    });

  return {
    inserts,
    updates,
    database: {
      transaction,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (input.existing ? [input.existing] : [])
          })
        })
      })
    }
  };
}

describe("isFinanceIdempotencyUniqueViolation", () => {
  it("detects nested Postgres constraint errors", () => {
    expect(
      isFinanceIdempotencyUniqueViolation({
        cause: {
          code: "23505",
          constraint: "finance_idempotency_commands_scope_key_unique"
        }
      })
    ).toBe(true);
  });
});
