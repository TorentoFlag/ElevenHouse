import type {
  AuditLogStore,
  FinanceIdempotentCommand,
  FinanceIdempotentCommandResult,
  PlatformTariffAuthorityStore
} from "@elevenhouse/domain";

export type AdminTariffUnitOfWorkContext = Readonly<{
  store: PlatformTariffAuthorityStore;
  auditLogStore: AuditLogStore;
}>;

export type AdminTariffUnitOfWork = Readonly<{
  execute: <T>(
    operation: (context: AdminTariffUnitOfWorkContext) => Promise<T>
  ) => Promise<T>;
  readonly executeIdempotent: <T>(input: {
    readonly command: FinanceIdempotentCommand;
    readonly create: (
      context: AdminTariffUnitOfWorkContext
    ) => Promise<{ readonly result: Record<string, unknown>; readonly value: T }>;
    readonly replay: (
      context: AdminTariffUnitOfWorkContext,
      result: Record<string, unknown>
    ) => Promise<T | null>;
  }) => Promise<FinanceIdempotentCommandResult<T>>;
}>;
