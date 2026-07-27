import type { AdminFinancePolicyAuditSink } from "./finance-policies.audit";
import type {
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult,
  AdminPaymentReversalCaseStore,
  FinanceOrderStore,
  FinancePolicyStore,
  LedgerStore,
  PayoutStore,
  ReconciliationStore
} from "@elevenhouse/domain";

export type AdminFinancePolicyUnitOfWorkContext = {
  readonly store: FinancePolicyStore;
  readonly orderStore: Pick<FinanceOrderStore, "applyFinancePolicy" | "findById">;
  readonly payoutStore: Pick<
    PayoutStore,
    "findRequestById" | "listRequests" | "updateRequestStatus"
  >;
  readonly ledgerStore: Pick<LedgerStore, "createTransaction" | "findWalletBalance">;
  readonly reversalCaseStore: AdminPaymentReversalCaseStore;
  readonly reconciliationStore: Pick<ReconciliationStore, "listOpenExceptions" | "resolveException">;
  readonly auditSink: AdminFinancePolicyAuditSink;
};

export type AdminFinancePolicyUnitOfWork = {
  readonly execute: <T>(
    operation: (context: AdminFinancePolicyUnitOfWorkContext) => Promise<T>
  ) => Promise<T>;
  readonly executeIdempotent: <T>(input: {
    readonly command: FinanceIdempotentCommand;
    readonly create: (
      context: AdminFinancePolicyUnitOfWorkContext
    ) => Promise<{ readonly result: Record<string, unknown>; readonly value: T }>;
    readonly replay: (
      context: AdminFinancePolicyUnitOfWorkContext,
      result: Record<string, unknown>
    ) => Promise<T | null>;
  }) => Promise<FinanceIdempotentCommandResult<T>>;
};
