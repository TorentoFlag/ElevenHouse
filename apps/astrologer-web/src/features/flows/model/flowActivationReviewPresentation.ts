import type {
  FlowActivationReviewResponse,
  FlowEnrollmentActivationBlockerCode
} from "@elevenhouse/contracts";

export type FlowActivationReviewPresentation = {
  readonly status: "ready" | "blocked";
  readonly title: string;
  readonly description: string;
  readonly canConfirm: boolean;
  readonly blockers: readonly {
    readonly code: FlowEnrollmentActivationBlockerCode;
    readonly label: string;
    readonly capabilityKey: string | null;
  }[];
};

export function buildFlowActivationReviewPresentation(
  review: FlowActivationReviewResponse,
  locale: "ru" | "en"
): FlowActivationReviewPresentation {
  const copy = reviewCopy[locale];
  if (review.decision === "ready") {
    return {
      status: "ready",
      title: copy.readyTitle,
      description: copy.readyDescription,
      canConfirm: true,
      blockers: []
    };
  }

  return {
    status: "blocked",
    title: copy.blockedTitle,
    description: copy.blockedDescription,
    canConfirm: false,
    blockers: review.blockers.map((blocker) => ({
      code: blocker.code,
      label: blockerCopy[locale][blocker.code],
      capabilityKey: blocker.capabilityKey
    }))
  };
}

const reviewCopy = {
  ru: {
    readyTitle: "Готова к запуску",
    readyDescription:
      "Проверка пройдена. После подтверждения новые события начнут запускать эту версию.",
    blockedTitle: "Запуск пока невозможен",
    blockedDescription: "Устраните блокирующие условия и повторите проверку."
  },
  en: {
    readyTitle: "Ready to activate",
    readyDescription:
      "The review passed. After confirmation, new events will start this version.",
    blockedTitle: "Activation is blocked",
    blockedDescription: "Resolve the blocking conditions and run the review again."
  }
} as const;

const blockerCopy = {
  ru: {
    FLOW_DEFINITION_ARCHIVED: "Воронка находится в архиве.",
    FLOW_ACTIVATION_ALREADY_ACTIVE: "Эта версия уже активна.",
    FLOW_LEGACY_ACTIVE_REQUIRES_PAUSE:
      "Сначала остановите действующее legacy-исполнение воронки.",
    FLOW_RUNTIME_ROLLOUT_DISABLED: "Запуск автоматизаций отключён политикой развёртывания.",
    FLOW_RUNTIME_OWNER_NOT_IN_CANARY:
      "Аккаунт ещё не включён в текущую группу запуска автоматизаций.",
    FLOW_RUNTIME_KILL_SWITCH_ENGAGED:
      "Исполнение автоматизаций временно остановлено аварийным переключателем.",
    FLOW_ACTIVATION_REVIEW_STALE: "Данные проверки устарели. Выполните проверку повторно.",
    FLOW_GRAPH_MANIFEST_INVALID:
      "Опубликованная схема и её манифест возможностей не прошли проверку целостности.",
    FLOW_VERSION_SCHEMA_UNSUPPORTED: "Формат опубликованной версии не поддерживается исполнителем.",
    FLOW_TRIGGER_MATCHER_NOT_READY: "Обработчик стартового события ещё не готов к работе.",
    FLOW_EXECUTION_WORKER_NOT_READY: "Исполнитель воронок сейчас не подтверждает готовность.",
    FLOW_NODE_EXECUTOR_NOT_READY: "Один или несколько шагов схемы пока нельзя выполнить.",
    FLOW_REQUIRED_CAPABILITY_NOT_READY: "Требуемая интеграция или возможность ещё не готова.",
    FLOW_PRODUCT_UNAVAILABLE: "Модуль воронок недоступен в текущей конфигурации продукта.",
    FLOW_ENTITLEMENT_UNAVAILABLE: "Текущий тариф не разрешает запуск этой автоматизации.",
    FLOW_AUTOMATION_QUOTA_EXCEEDED: "Достигнут лимит одновременно активных автоматизаций.",
    FLOW_AUTOMATION_QUOTA_NOT_READY: "Лимит активных автоматизаций пока не удалось подтвердить.",
    FLOW_LOCALE_CONTENT_MISSING: "Для выбранного языка не хватает обязательного содержимого."
  },
  en: {
    FLOW_DEFINITION_ARCHIVED: "The flow is archived.",
    FLOW_ACTIVATION_ALREADY_ACTIVE: "This version is already active.",
    FLOW_LEGACY_ACTIVE_REQUIRES_PAUSE: "Pause the current legacy execution first.",
    FLOW_RUNTIME_ROLLOUT_DISABLED: "Automation activation is disabled by rollout policy.",
    FLOW_RUNTIME_OWNER_NOT_IN_CANARY: "The account is not included in the current rollout group.",
    FLOW_RUNTIME_KILL_SWITCH_ENGAGED:
      "Automation execution is temporarily stopped by the emergency switch.",
    FLOW_ACTIVATION_REVIEW_STALE: "The review evidence is stale. Run the review again.",
    FLOW_GRAPH_MANIFEST_INVALID:
      "The published graph and capability manifest failed integrity verification.",
    FLOW_VERSION_SCHEMA_UNSUPPORTED: "The published version format is not supported.",
    FLOW_TRIGGER_MATCHER_NOT_READY: "The starting-event matcher is not ready.",
    FLOW_EXECUTION_WORKER_NOT_READY: "The flow worker is not reporting readiness.",
    FLOW_NODE_EXECUTOR_NOT_READY: "One or more graph steps cannot be executed yet.",
    FLOW_REQUIRED_CAPABILITY_NOT_READY: "A required integration or capability is not ready.",
    FLOW_PRODUCT_UNAVAILABLE: "The Flows module is unavailable in the current product setup.",
    FLOW_ENTITLEMENT_UNAVAILABLE: "The current plan does not allow this automation to run.",
    FLOW_AUTOMATION_QUOTA_EXCEEDED: "The active automation limit has been reached.",
    FLOW_AUTOMATION_QUOTA_NOT_READY: "The active automation limit could not be verified.",
    FLOW_LOCALE_CONTENT_MISSING: "Required content is missing for the selected language."
  }
} satisfies Record<
  "ru" | "en",
  Record<FlowEnrollmentActivationBlockerCode, string>
>;
