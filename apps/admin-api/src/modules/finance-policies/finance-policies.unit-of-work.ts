import type { AdminFinancePolicyAuditSink } from "./finance-policies.audit";
import type {
  FinanceAuthorizationCanonicalPayload,
  FinanceSensitiveActionKind
} from "@elevenhouse/contracts";
import type {
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult,
  AdminPaymentReversalCaseStore,
  FinanceOrderStore,
  FinancePolicyStore,
  ReconciliationStore
} from "@elevenhouse/domain";
import type { FinanceTransactionAuthorizationProof } from "@elevenhouse/domain";
import type {
  BankLiquiditySnapshotAttestationUnitOfWork,
  CurrentEligibleBankLiquiditySnapshotReader,
  FinanceOperationResourcePolicyReader,
  OnlineWalletPayoutApprovalPreparationReader,
  OnlineWalletPayoutExecutionPreparationReader,
  OnlineWalletPayoutExecutionUnitOfWork,
  OnlineWalletPayoutReleaseUnitOfWork,
  OnlineWalletPayoutReviewUnitOfWork,
  OnlineWalletPayoutRequestReader
} from "@elevenhouse/domain/finance-core";

export type AdminFinancePolicyUnitOfWorkContext = {
  readonly store: FinancePolicyStore;
  readonly orderStore: Pick<FinanceOrderStore, "applyFinancePolicy" | "findById">;
  readonly reversalCaseStore: AdminPaymentReversalCaseStore;
  readonly reconciliationStore: Pick<ReconciliationStore, "listOpenExceptions" | "resolveException">;
  readonly onlineWalletPayoutRequestReader: OnlineWalletPayoutRequestReader;
  readonly onlineWalletPayoutApprovalPreparationReader: OnlineWalletPayoutApprovalPreparationReader;
  readonly currentEligibleBankLiquiditySnapshotReader: CurrentEligibleBankLiquiditySnapshotReader;
  readonly financeOperationResourcePolicyReader: FinanceOperationResourcePolicyReader;
  readonly bankLiquiditySnapshotAttestation: BankLiquiditySnapshotAttestationUnitOfWork;
  readonly onlineWalletPayoutRelease: OnlineWalletPayoutReleaseUnitOfWork;
  readonly onlineWalletPayoutReview: OnlineWalletPayoutReviewUnitOfWork;
  readonly onlineWalletPayoutExecutionPreparationReader: OnlineWalletPayoutExecutionPreparationReader;
  readonly onlineWalletPayoutExecution: OnlineWalletPayoutExecutionUnitOfWork;
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
  /**
   * Executes a protected finance transition in the exact transaction that
   * consumes its one-time WebAuthn authorization grant.
   */
  readonly executeAuthorized: <T>(input: {
    readonly authorization: {
      readonly actorUserId: string;
      readonly sessionId: string;
      readonly actionKind: FinanceSensitiveActionKind;
      readonly aggregateId: string;
      readonly expectedVersion: number;
      readonly payload: FinanceAuthorizationCanonicalPayload;
      readonly authorizationId: string;
      readonly occurredAt: string;
    };
    readonly operation: (
      context: AdminFinancePolicyUnitOfWorkContext,
      proof: FinanceTransactionAuthorizationProof
    ) => Promise<T>;
  }) => Promise<T>;
};
