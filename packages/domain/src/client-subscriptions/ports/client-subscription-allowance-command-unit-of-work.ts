import type {
  ClientSubscriptionAllowanceCommand,
  ClientSubscriptionAllowanceCommandOutcome,
  ClientSubscriptionPeriodAllowance
} from "../client-subscription-allowance";
import {
  hashClientSubscriptionAllowanceCommand,
  normalizeClientSubscriptionAllowanceCommand
} from "../client-subscription-allowance";

type AllowanceRejected = Exclude<
  ClientSubscriptionAllowanceCommandOutcome,
  | { readonly allowance: unknown }
  | { readonly outcome: "version_conflict" | "idempotency_conflict" }
>;

export type ClientSubscriptionAllowancePersistenceReceipt = Readonly<{
  periodId: string;
  expectedVersion: number;
  idempotencyKey: string;
  requestHash: `sha256:${string}`;
  command: ClientSubscriptionAllowanceCommand;
  resultVersion: number;
  result:
    | Readonly<{ outcome: "applied" }>
    | Readonly<{ outcome: "rejected"; decision: AllowanceRejected }>;
}>;

export type ClientSubscriptionAllowancePersistedResult =
  | {
      readonly outcome: "applied";
      readonly allowance: ClientSubscriptionPeriodAllowance;
      readonly receipt: ClientSubscriptionAllowancePersistenceReceipt;
    }
  | {
      readonly outcome: "rejected";
      readonly decision: AllowanceRejected;
      readonly receipt: ClientSubscriptionAllowancePersistenceReceipt;
    };

export type ClientSubscriptionAllowanceCommandExecution =
  | ClientSubscriptionAllowancePersistedResult
  | { readonly outcome: "replayed"; readonly result: ClientSubscriptionAllowancePersistedResult }
  | {
      readonly outcome: "version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | { readonly outcome: "idempotency_conflict" }
  | { readonly outcome: "not_found" };

export type ClientSubscriptionAllowanceCommandUnitOfWork = Readonly<{
  /** Locks the period allowance, checks the persistence receipt before CAS, and commits both. */
  execute(
    input: Readonly<{
      periodId: string;
      expectedVersion: number;
      idempotencyKey: string;
      requestHash: `sha256:${string}`;
      command: ClientSubscriptionAllowanceCommand;
      decide: (
        current: ClientSubscriptionPeriodAllowance
      ) => ClientSubscriptionAllowanceCommandOutcome;
    }>
  ): Promise<ClientSubscriptionAllowanceCommandExecution>;
}>;

export function executeClientSubscriptionAllowanceCommand(
  unitOfWork: ClientSubscriptionAllowanceCommandUnitOfWork,
  input: Readonly<{
    periodId: string;
    expectedVersion: number;
    idempotencyKey: string;
    command: ClientSubscriptionAllowanceCommand;
  }>,
  decide: (current: ClientSubscriptionPeriodAllowance) => ClientSubscriptionAllowanceCommandOutcome
): Promise<ClientSubscriptionAllowanceCommandExecution> {
  const command = normalizeClientSubscriptionAllowanceCommand(input.command);
  return unitOfWork.execute({
    periodId: input.periodId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    command,
    requestHash: hashClientSubscriptionAllowanceCommand({
      periodId: input.periodId,
      expectedVersion: input.expectedVersion,
      command
    }),
    decide
  });
}

export function validateClientSubscriptionAllowanceDecision(
  input: Readonly<{
    periodId: string;
    expectedVersion: number;
    idempotencyKey: string;
    requestHash: `sha256:${string}`;
    command: ClientSubscriptionAllowanceCommand;
  }>,
  decision: ClientSubscriptionAllowanceCommandOutcome
): void {
  if (decision.outcome !== "applied") return;
  if (
    decision.allowance.periodId !== input.periodId ||
    decision.allowance.version !== input.expectedVersion + 1 ||
    !decision.receipt ||
    decision.receipt.idempotencyKey !== input.idempotencyKey ||
    decision.receipt.requestHash !== input.requestHash ||
    decision.receipt.operation !== input.command.operation ||
    decision.receipt.resultVersion !== decision.allowance.version
  ) {
    throw new Error("Allowance decision receipt does not match the persistence command");
  }
}
