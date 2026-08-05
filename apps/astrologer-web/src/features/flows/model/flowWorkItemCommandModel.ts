import {
  flowWorkItemCommandRejectionSchema,
  type FlowWorkItemCommandRejection
} from "@elevenhouse/contracts";

import { HttpError } from "../../../common/http/HttpError";

export type FlowWorkItemCommandOperation = "start" | "snooze" | "complete";

export type FlowWorkItemCommandState =
  | {
      readonly status: "pending";
      readonly operation: FlowWorkItemCommandOperation;
    }
  | {
      readonly status: "error";
      readonly operation: FlowWorkItemCommandOperation;
      readonly userMessage: string;
      readonly refetchRequired: boolean;
    };

export type FlowWorkItemCommandErrorClassification =
  | {
      readonly kind: "refetch_required";
      readonly rejection: FlowWorkItemCommandRejection | null;
    }
  | {
      readonly kind: "retry_same_attempt";
    }
  | {
      readonly kind: "rejected";
      readonly rejection: FlowWorkItemCommandRejection | null;
    };

export function classifyFlowWorkItemCommandError(
  error: unknown
): FlowWorkItemCommandErrorClassification {
  if (error instanceof HttpError) {
    const rejection = flowWorkItemCommandRejectionSchema.safeParse(error.body);
    const parsedRejection = rejection.success ? rejection.data : null;

    if (error.status === 404) {
      return { kind: "refetch_required", rejection: parsedRejection };
    }
    if (error.status === 409) {
      if (
        parsedRejection?.code === "FLOW_WORK_ITEM_SNOOZE_NOT_FUTURE" ||
        parsedRejection?.code === "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED"
      ) {
        return { kind: "rejected", rejection: parsedRejection };
      }
      return { kind: "refetch_required", rejection: parsedRejection };
    }
    if (error.status === 429 || error.status >= 500) {
      return { kind: "retry_same_attempt" };
    }
    return { kind: "rejected", rejection: parsedRejection };
  }

  return error instanceof TypeError
    ? { kind: "retry_same_attempt" }
    : { kind: "rejected", rejection: null };
}

export function describeFlowWorkItemCommandError(
  classification: FlowWorkItemCommandErrorClassification,
  locale: "ru" | "en"
): string {
  const copy = flowWorkItemCommandErrorCopy[locale];
  if (classification.kind === "retry_same_attempt") return copy.temporary;
  if (classification.kind === "refetch_required") return copy.stale;
  if (classification.rejection?.code === "FLOW_WORK_ITEM_SNOOZE_NOT_FUTURE") {
    return copy.snoozeNotFuture;
  }
  if (classification.rejection?.code === "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED") {
    return copy.resultSummaryRequired;
  }
  return copy.rejected;
}

export function createFlowWorkItemCommandAttemptRegistry(
  createRequestId: () => string = () => crypto.randomUUID()
) {
  const scopes = new Map<
    string,
    {
      readonly attempts: Map<string, string>;
      refetchRequired: boolean;
    }
  >();

  return {
    acquire(operation: FlowWorkItemCommandOperation, workItemId: string, payload: unknown): string {
      const scopeKey = buildScopeKey(operation, workItemId);
      const scope = scopes.get(scopeKey) ?? {
        attempts: new Map<string, string>(),
        refetchRequired: false
      };
      if (scope.refetchRequired) throw new Error("FLOW_WORK_ITEM_REFETCH_REQUIRED");

      const signature = stableJson(payload);
      const current = scope.attempts.get(signature);
      if (current) return current;

      const idempotencyKey = `flows:work-item:${operation}:${createRequestId()}`;
      scope.attempts.set(signature, idempotencyKey);
      scopes.set(scopeKey, scope);
      return idempotencyKey;
    },
    acknowledge(
      operation: FlowWorkItemCommandOperation,
      workItemId: string,
      idempotencyKey: string
    ): void {
      const scopeKey = buildScopeKey(operation, workItemId);
      const scope = scopes.get(scopeKey);
      if (!scope) return;

      deleteAttempt(scope.attempts, idempotencyKey);
      if (scope.attempts.size === 0 && !scope.refetchRequired) scopes.delete(scopeKey);
    },
    markConflict(
      operation: FlowWorkItemCommandOperation,
      workItemId: string,
      idempotencyKey: string
    ): void {
      const scopeKey = buildScopeKey(operation, workItemId);
      const scope = scopes.get(scopeKey) ?? {
        attempts: new Map<string, string>(),
        refetchRequired: false
      };
      deleteAttempt(scope.attempts, idempotencyKey);
      scope.refetchRequired = true;
      scopes.set(scopeKey, scope);
    },
    resetAfterRefetch(operation: FlowWorkItemCommandOperation, workItemId: string): void {
      scopes.delete(buildScopeKey(operation, workItemId));
    },
    resetAllAfterRefetch(): void {
      scopes.clear();
    }
  };
}

const flowWorkItemCommandErrorCopy = {
  ru: {
    temporary: "Не удалось выполнить действие. Повторите попытку.",
    stale: "Состояние задачи изменилось. Обновите очередь.",
    snoozeNotFuture: "Выберите время в будущем.",
    resultSummaryRequired: "Добавьте результат выполнения задачи.",
    rejected: "Действие недоступно. Проверьте задачу и повторите попытку."
  },
  en: {
    temporary: "The action could not be completed. Try again.",
    stale: "The task has changed. Refresh the queue.",
    snoozeNotFuture: "Choose a time in the future.",
    resultSummaryRequired: "Add the task completion result.",
    rejected: "The action is unavailable. Check the task and try again."
  }
} as const;

function buildScopeKey(operation: FlowWorkItemCommandOperation, workItemId: string): string {
  return `${operation}:${workItemId}`;
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
      .map(([key, entry]) => [key, canonicalize(entry)])
  );
}
