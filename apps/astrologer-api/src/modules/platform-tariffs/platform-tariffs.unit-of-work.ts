import type {
  PlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork,
  SavedCardSetupExecutionUnitOfWork,
  SavedCardSetupInitiationUnitOfWork,
  SavedCardSetupThreeDsMethodCompletionUnitOfWork
} from "@elevenhouse/domain/finance-core";
import type {
  AuditLogStore,
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult,
  PlatformTariffAuthorityStore
} from "@elevenhouse/domain";

export type AstrologerTariffUnitOfWorkContext = Readonly<{
  store: PlatformTariffAuthorityStore;
  auditLogStore: AuditLogStore;
  savedCardSetupInitiation: SavedCardSetupInitiationUnitOfWork;
  savedCardSetupExecution: SavedCardSetupExecutionUnitOfWork;
  savedCardSetupThreeDsMethodCompletion: SavedCardSetupThreeDsMethodCompletionUnitOfWork;
  tariffInvoiceThreeDsMethodCompletion: PlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork;
}>;

export type AstrologerTariffUnitOfWork = Readonly<{
  executeIdempotent: <T>(input: Readonly<{
    command: FinanceIdempotentCommand;
    create: (context: AstrologerTariffUnitOfWorkContext) => Promise<{
      readonly result: Record<string, unknown>;
      readonly value: T;
    }>;
    replay: (result: Record<string, unknown>) => Promise<T>;
  }>) => Promise<FinanceIdempotentCommandResult<T>>;
}>;
