import type { AdminFinancePolicyAuditSink } from "./finance-policies.audit";
import type { FinanceOrderStore, FinancePolicyStore } from "@elevenhouse/domain";

export type AdminFinancePolicyUnitOfWorkContext = {
  readonly store: FinancePolicyStore;
  readonly orderStore: Pick<FinanceOrderStore, "applyFinancePolicy" | "findById">;
  readonly auditSink: AdminFinancePolicyAuditSink;
};

export type AdminFinancePolicyUnitOfWork = {
  readonly execute: <T>(
    operation: (context: AdminFinancePolicyUnitOfWorkContext) => Promise<T>
  ) => Promise<T>;
};
