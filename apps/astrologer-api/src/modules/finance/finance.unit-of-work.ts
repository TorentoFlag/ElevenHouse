import type {
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult,
  LedgerStore,
  PayoutStore
} from "@elevenhouse/domain";

export type AstrologerFinanceUnitOfWorkContext = {
  readonly payoutStore: PayoutStore;
  readonly ledgerStore: Pick<LedgerStore, "createTransaction" | "findWalletBalance" | "listOperations">;
};

export type AstrologerFinanceUnitOfWork = {
  readonly execute: <T>(
    operation: (context: AstrologerFinanceUnitOfWorkContext) => Promise<T>
  ) => Promise<T>;
  readonly executeIdempotent: <T>(input: {
    readonly command: FinanceIdempotentCommand;
    readonly create: (
      context: AstrologerFinanceUnitOfWorkContext
    ) => Promise<{ readonly result: Record<string, unknown>; readonly value: T }>;
    readonly replay: (
      context: AstrologerFinanceUnitOfWorkContext,
      result: Record<string, unknown>
    ) => Promise<T | null>;
  }) => Promise<FinanceIdempotentCommandResult<T>>;
};

export type AstrologerFinanceOptions = {
  readonly minimumPayoutAmountMinor: number;
};
