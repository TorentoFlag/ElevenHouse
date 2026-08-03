import {
  flowDefinitionCommandRejectionSchema,
  type CreateFlowDefinitionV2Request,
  type FlowDefinitionMigrationIssue,
  type FlowDefinitionValidationIssue,
  type FlowDefinitionTemplateDescriptorV2
} from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";

export type FlowsPageLocale = "ru" | "en";
export type FlowDefinitionRevisionConflict = {
  readonly expectedRevision: number;
  readonly currentRevision: number;
};
export type FlowDefinitionCommandScope = "create" | "update" | "publish" | "next-draft" | "migrate";

export function buildCreateFlowDefinitionRequest(input: {
  readonly locale: FlowsPageLocale;
  readonly template: FlowDefinitionTemplateDescriptorV2 | null;
}): CreateFlowDefinitionV2Request {
  if (!input.template) {
    return {
      schemaVersion: "flow-definition-create.v2",
      name: input.locale === "ru" ? "Новая воронка" : "New flow",
      locale: input.locale,
      approvalMode: "manual_approve",
      source: { type: "blank" }
    };
  }

  return {
    schemaVersion: "flow-definition-create.v2",
    name: input.template.name,
    locale: input.locale,
    approvalMode: input.template.recommendedApprovalMode,
    source: {
      type: "template",
      templateKey: input.template.key,
      templateVersion: input.template.version,
      parameters: {}
    }
  };
}

export function createFlowDefinitionIdempotencyKey(
  scope: FlowDefinitionCommandScope,
  createRequestId: () => string = () => crypto.randomUUID()
): string {
  return `flows:${scope}:${createRequestId()}`;
}

export function createFlowCommandAttemptRegistry(
  createRequestId: () => string = () => crypto.randomUUID()
) {
  const attempts = new Map<FlowDefinitionCommandScope, Map<string, string>>();

  return {
    acquire(scope: FlowDefinitionCommandScope, payload: unknown): string {
      const signature = stableJson(payload);
      const scopedAttempts = attempts.get(scope) ?? new Map<string, string>();
      const current = scopedAttempts.get(signature);
      if (current) return current;

      const idempotencyKey = createFlowDefinitionIdempotencyKey(scope, createRequestId);
      scopedAttempts.set(signature, idempotencyKey);
      attempts.set(scope, scopedAttempts);
      return idempotencyKey;
    },
    acknowledge(scope: FlowDefinitionCommandScope, idempotencyKey: string): void {
      const scopedAttempts = attempts.get(scope);
      if (!scopedAttempts) return;

      for (const [signature, currentKey] of scopedAttempts) {
        if (currentKey !== idempotencyKey) continue;
        scopedAttempts.delete(signature);
        break;
      }
      if (scopedAttempts.size === 0) attempts.delete(scope);
    }
  };
}

export type AstroCalendarFlowHandoff = {
  readonly source: "astro_calendar";
  readonly eventId: string;
  readonly suggestedTemplateKey: string;
  readonly clientId?: string;
};

export function parseAstroCalendarFlowHandoff(search: string): AstroCalendarFlowHandoff | null {
  const params = new URLSearchParams(search);
  if (params.get("source") !== "astro_calendar") return null;

  const eventId = params.get("eventId")?.trim();
  const suggestedTemplateKey = params.get("suggestedTemplateKey")?.trim();
  if (!eventId || !suggestedTemplateKey) return null;

  const clientId = params.get("clientId")?.trim();
  return {
    source: "astro_calendar",
    eventId,
    suggestedTemplateKey,
    ...(clientId ? { clientId } : {})
  };
}

export function describeFlowDefinitionError(error: unknown, locale: FlowsPageLocale): Error {
  if (!(error instanceof HttpError)) {
    return error instanceof Error
      ? error
      : new Error(locale === "ru" ? "Неизвестная ошибка воронки" : "Unknown flow error");
  }

  const rejection = flowDefinitionCommandRejectionSchema.safeParse(error.body);
  if (!rejection.success) {
    return new Error(
      locale === "ru"
        ? `Команда воронки завершилась ошибкой ${error.status}.`
        : `The flow command failed with status ${error.status}.`
    );
  }

  const body = rejection.data;
  if (body.code === "FLOW_DRAFT_REVISION_CONFLICT") {
    return new Error(
      locale === "ru"
        ? `Черновик изменился в другой вкладке: текущая редакция ${body.currentRevision}. Обновите данные и повторите правку.`
        : `The draft changed in another tab. Current revision: ${body.currentRevision}. Reload it before editing again.`
    );
  }
  if (body.code === "FLOW_GRAPH_NOT_PUBLISHABLE") {
    const count = body.issues.length;
    return new Error(
      locale === "ru"
        ? `Воронку нельзя опубликовать: блокирующих проблем ${count}.`
        : `The flow cannot be published: ${count} blocking ${count === 1 ? "issue" : "issues"}.`
    );
  }
  if (body.code === "FLOW_GRAPH_MIGRATION_BLOCKED") {
    return new Error(
      locale === "ru"
        ? `Автоматическая миграция остановлена: несовместимых элементов ${body.issues.length}.`
        : `Migration is blocked by ${body.issues.length} incompatible elements.`
    );
  }
  if (body.code === "FLOW_DRAFT_NOT_EDITABLE") {
    return new Error(
      locale === "ru"
        ? "Эта версия уже опубликована. Создайте новый черновик версии."
        : "This version is published. Create a new version draft."
    );
  }
  if (body.code === "FLOW_TEMPLATE_NOT_AVAILABLE") {
    return new Error(
      locale === "ru"
        ? "Выбранный сценарий пока недоступен для создания."
        : "The selected template is not available for creation yet."
    );
  }
  if (body.code === "FLOW_GRAPH_MIGRATION_REQUIRED") {
    return new Error(
      locale === "ru"
        ? "Сначала выполните явную миграцию legacy-графа."
        : "Migrate the legacy graph explicitly first."
    );
  }
  if (body.code === "FLOW_IDEMPOTENCY_KEY_INVALID") {
    return new Error(
      locale === "ru"
        ? "Не удалось подтвердить команду. Обновите страницу и повторите команду."
        : "The command could not be verified. Reload the page and retry the command."
    );
  }
  if (body.code === "FLOW_IDEMPOTENCY_KEY_REUSED") {
    return new Error(
      locale === "ru"
        ? "Эта попытка уже относится к другой команде. Обновите страницу перед повтором."
        : "This attempt already belongs to a different command. Reload before retrying."
    );
  }

  return new Error(
    locale === "ru"
      ? `Команда воронки отклонена: ${body.code}.`
      : `The flow command was rejected: ${body.code}.`
  );
}

export function getFlowDefinitionRevisionConflict(
  error: unknown
): FlowDefinitionRevisionConflict | null {
  if (!(error instanceof HttpError)) return null;
  const rejection = flowDefinitionCommandRejectionSchema.safeParse(error.body);
  if (!rejection.success || rejection.data.code !== "FLOW_DRAFT_REVISION_CONFLICT") {
    return null;
  }
  return {
    expectedRevision: rejection.data.expectedRevision,
    currentRevision: rejection.data.currentRevision
  };
}

export function getFlowDefinitionValidationIssues(
  error: unknown
): readonly FlowDefinitionValidationIssue[] {
  if (!(error instanceof HttpError)) return [];
  const rejection = flowDefinitionCommandRejectionSchema.safeParse(error.body);
  if (!rejection.success || rejection.data.code !== "FLOW_GRAPH_NOT_PUBLISHABLE") return [];
  return rejection.data.issues;
}

export function getFlowDefinitionMigrationIssues(
  error: unknown
): readonly FlowDefinitionMigrationIssue[] {
  if (!(error instanceof HttpError)) return [];
  const rejection = flowDefinitionCommandRejectionSchema.safeParse(error.body);
  if (!rejection.success || rejection.data.code !== "FLOW_GRAPH_MIGRATION_BLOCKED") return [];
  return rejection.data.issues;
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
