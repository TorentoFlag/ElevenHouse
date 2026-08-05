import type {
  FiscalProfileAuthorityStore
} from "@elevenhouse/domain/finance-core";
import type {
  AuditLogStore,
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult,
  FinanceReadinessEvidenceReader
} from "@elevenhouse/domain";

export type AdminFiscalProfileUnitOfWorkContext = Readonly<{
  store: FiscalProfileAuthorityStore;
  auditLogStore: AuditLogStore;
  readinessReader: FinanceReadinessEvidenceReader;
}>;

export type AdminFiscalProfileUnitOfWork = Readonly<{
  execute: <T>(
    operation: (context: AdminFiscalProfileUnitOfWorkContext) => Promise<T>
  ) => Promise<T>;
  readonly executeIdempotent: <T>(input: {
    readonly command: FinanceIdempotentCommand;
    readonly create: (
      context: AdminFiscalProfileUnitOfWorkContext
    ) => Promise<{ readonly result: Record<string, unknown>; readonly value: T }>;
    readonly replay: (
      context: AdminFiscalProfileUnitOfWorkContext,
      result: Record<string, unknown>
    ) => Promise<T | null>;
  }) => Promise<FinanceIdempotentCommandResult<T>>;
}>;
