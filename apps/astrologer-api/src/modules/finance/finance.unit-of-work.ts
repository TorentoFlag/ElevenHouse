import type {
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult,
  LedgerStore,
  PlatformTariffAuthorityStore,
  PayoutStore
} from "@elevenhouse/domain";
import type {
  OnlineWalletPayoutRequestReader,
  OnlineWalletPayoutRequestUnitOfWork
} from "@elevenhouse/domain/finance-core";

export type AstrologerFinanceUnitOfWorkContext = {
  readonly payoutStore: PayoutStore;
  readonly ledgerStore: Pick<
    LedgerStore,
    "createTransaction" | "findWalletBalance" | "summarizePeriod" | "listOperations"
  >;
  readonly tariffStore: Pick<
    PlatformTariffAuthorityStore,
    "findActiveOrPendingSubscription" | "findTariffVersion"
  >;
  readonly onlineWalletPayoutRequests: OnlineWalletPayoutRequestUnitOfWork;
  readonly onlineWalletPayoutRequestReader: OnlineWalletPayoutRequestReader;
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
