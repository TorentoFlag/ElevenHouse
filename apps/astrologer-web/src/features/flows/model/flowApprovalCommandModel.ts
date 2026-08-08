import type { FlowApproval } from "@elevenhouse/contracts";

import { HttpError } from "../../../common/http/HttpError";

export type FlowApprovalCommandOperation = "approve" | "reject" | "snooze";

export type FlowApprovalCommandState =
  | { readonly status: "pending"; readonly operation: FlowApprovalCommandOperation }
  | {
      readonly status: "error";
      readonly operation: FlowApprovalCommandOperation;
      readonly userMessage: string;
      readonly refetchRequired: boolean;
    };

export type FlowApprovalCommandErrorClassification =
  | { readonly kind: "refetch_required" }
  | { readonly kind: "retry_same_attempt" }
  | { readonly kind: "runtime_unavailable" }
  | { readonly kind: "snooze_not_future" }
  | { readonly kind: "rejected" };

export function classifyFlowApprovalCommandError(
  error: unknown
): FlowApprovalCommandErrorClassification {
  if (error instanceof HttpError) {
    const code = readErrorCode(error.body);
    if (code === "FLOW_RUNTIME_EXECUTION_UNAVAILABLE") return { kind: "runtime_unavailable" };
    if (code === "FLOW_APPROVAL_SNOOZE_NOT_FUTURE") return { kind: "snooze_not_future" };
    if (error.status === 404 || error.status === 409) return { kind: "refetch_required" };
    if (error.status === 429 || error.status >= 500) return { kind: "retry_same_attempt" };
    return { kind: "rejected" };
  }
  return error instanceof TypeError ? { kind: "retry_same_attempt" } : { kind: "rejected" };
}

export function describeFlowApprovalCommandError(
  classification: FlowApprovalCommandErrorClassification,
  locale: "ru" | "en"
): string {
  return approvalErrorCopy[locale][classification.kind];
}

export function createFlowApprovalCommandAttemptRegistry(
  createRequestId: () => string = () => crypto.randomUUID()
) {
  const scopes = new Map<
    string,
    { readonly attempts: Map<string, string>; refetchRequired: boolean }
  >();

  return {
    acquire(operation: FlowApprovalCommandOperation, approval: FlowApproval, payload: unknown): string {
      const scopeKey = `${operation}:${approval.id}`;
      const scope = scopes.get(scopeKey) ?? { attempts: new Map<string, string>(), refetchRequired: false };
      if (scope.refetchRequired) throw new Error("FLOW_APPROVAL_REFETCH_REQUIRED");
      const signature = stableJson(payload);
      const previous = scope.attempts.get(signature);
      if (previous) return previous;
      const idempotencyKey = `flows:approval:${operation}:${createRequestId()}`;
      scope.attempts.set(signature, idempotencyKey);
      scopes.set(scopeKey, scope);
      return idempotencyKey;
    },
    acknowledge(operation: FlowApprovalCommandOperation, approvalId: string, idempotencyKey: string): void {
      const scopeKey = `${operation}:${approvalId}`;
      const scope = scopes.get(scopeKey);
      if (!scope) return;
      deleteAttempt(scope.attempts, idempotencyKey);
      if (scope.attempts.size === 0 && !scope.refetchRequired) scopes.delete(scopeKey);
    },
    markConflict(operation: FlowApprovalCommandOperation, approvalId: string, idempotencyKey: string): void {
      const scopeKey = `${operation}:${approvalId}`;
      const scope = scopes.get(scopeKey) ?? { attempts: new Map<string, string>(), refetchRequired: false };
      deleteAttempt(scope.attempts, idempotencyKey);
      scope.refetchRequired = true;
      scopes.set(scopeKey, scope);
    },
    resetAllAfterRefetch(): void {
      scopes.clear();
    }
  };
}

const approvalErrorCopy = {
  ru: {
    refetch_required: "Подтверждение уже изменилось. Обновите очередь.",
    retry_same_attempt: "Не удалось выполнить действие. Повторите попытку.",
    runtime_unavailable: "Исполнение воронки пока недоступно. Сценарий можно редактировать и публиковать.",
    snooze_not_future: "Выберите время в будущем.",
    rejected: "Действие недоступно. Обновите очередь и повторите попытку."
  },
  en: {
    refetch_required: "The approval has changed. Refresh the queue.",
    retry_same_attempt: "The action could not be completed. Try again.",
    runtime_unavailable: "Flow execution is not available yet. You can edit and publish the definition.",
    snooze_not_future: "Choose a time in the future.",
    rejected: "The action is unavailable. Refresh the queue and try again."
  }
} as const;

function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("code" in body)) return null;
  return typeof body.code === "string" ? body.code : null;
}

function deleteAttempt(attempts: Map<string, string>, idempotencyKey: string): void {
  for (const [signature, current] of attempts) {
    if (current !== idempotencyKey) continue;
    attempts.delete(signature);
    return;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)])
  );
}
