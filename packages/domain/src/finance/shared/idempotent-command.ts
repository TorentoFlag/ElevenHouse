export type FinanceRequestHash = `sha256:${string}`;

export type FinanceIdempotentCommand = {
  readonly scope: string;
  readonly idempotencyKey: string;
  readonly actorUserId: string | null;
  readonly requestHash: FinanceRequestHash;
  readonly now: string;
  readonly expiresAt: string;
};

export type FinanceIdempotentCommandResult<T> = {
  readonly kind: "created" | "replayed";
  readonly value: T;
};

export class FinanceIdempotencyConflictError extends Error {
  readonly code = "finance_idempotency_key_reused_with_different_request";

  constructor() {
    super("Finance idempotency key was already used for another request");
    this.name = "FinanceIdempotencyConflictError";
  }
}

export class FinanceIdempotencyInProgressError extends Error {
  readonly code = "finance_idempotency_command_in_progress";

  constructor() {
    super("Finance idempotency command is still being processed");
    this.name = "FinanceIdempotencyInProgressError";
  }
}

export class FinanceIdempotencyFailedError extends Error {
  readonly code = "finance_idempotency_command_failed";

  constructor(readonly errorCode: string) {
    super("Finance idempotency command previously failed");
    this.name = "FinanceIdempotencyFailedError";
  }
}
