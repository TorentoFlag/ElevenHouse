import type {
  FlowDefinitionValidationIssue,
  FlowDefinitionValidationIssueCode
} from "@elevenhouse/contracts";

export type FlowValidationIssuePresentation = {
  readonly code: FlowDefinitionValidationIssueCode;
  readonly path: string;
  readonly message: string;
  readonly nodeId: string | null;
};

export function buildFlowValidationIssuePresentation(
  issues: readonly FlowDefinitionValidationIssue[],
  locale: "ru" | "en"
): readonly FlowValidationIssuePresentation[] {
  return issues.map((issue) => ({
    code: issue.code,
    path: issue.path,
    message: locale === "ru" ? issueMessagesRu[issue.code] : issue.message,
    nodeId: nodeIdFromPath(issue.path)
  }));
}

const issueMessagesRu = {
  duplicate_node_id: "Узлы воронки должны иметь уникальные идентификаторы.",
  duplicate_edge_id: "Связи воронки должны иметь уникальные идентификаторы.",
  node_limit_exceeded: "В схеме превышен допустимый лимит узлов.",
  edge_limit_exceeded: "В схеме превышен допустимый лимит связей.",
  invalid_trigger_count: "В воронке должен быть ровно один стартовый узел.",
  missing_edge_endpoint: "Связь должна соединять существующие узлы.",
  invalid_source_handle: "Связь выходит из недопустимой ветки узла.",
  duplicate_source_handle: "Из каждой ветки узла может выходить только одна связь.",
  missing_required_source_handle: "Добавьте обязательное продолжение из этого узла.",
  implicit_fan_out: "Неявное разветвление не поддерживается; используйте условный узел.",
  implicit_fan_in: "Объединение нескольких веток в один узел пока не поддерживается.",
  trigger_has_incoming_edge: "Стартовый узел не может иметь входящую связь.",
  terminal_has_outgoing_edge: "Завершающий узел не может иметь исходящую связь.",
  cycle_detected: "Воронка не может содержать циклический маршрут.",
  unreachable_node: "Этот узел недостижим из стартового узла.",
  unterminated_path: "Каждая ветка должна завершаться итоговым узлом.",
  work_item_due_policy_requires_booking_trigger:
    "Срок относительно записи доступен только в воронке, которая начинается с подтверждения записи."
} satisfies Record<FlowDefinitionValidationIssueCode, string>;

function nodeIdFromPath(path: string): string | null {
  const [collection, nodeId] = path.split(".");
  return collection === "nodes" && nodeId ? nodeId : null;
}
