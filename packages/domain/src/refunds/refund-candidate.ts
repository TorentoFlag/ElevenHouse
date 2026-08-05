export type RefundCandidateStatus = "submitted" | "under_review" | "rejected" | "resolved";

export type RefundCandidate = Readonly<{
  id: string;
  orderId: string;
  clientUserId: string;
  statement: string;
  status: RefundCandidateStatus;
  version: number;
  submittedAt: string;
  resolvedRefundCaseId: string | null;
  resolvedAt: string | null;
  updatedAt: string;
}>;

export type ClientRefundCandidate = RefundCandidate & Readonly<{ status: "submitted"; version: 1 }>;

export class RefundCandidateError extends Error {
  readonly code = "refund_candidate_invalid" as const;

  constructor(
    readonly reason:
      | "invalid_input"
      | "order_not_owned"
      | "order_not_eligible"
      | "statement_invalid"
  ) {
    super("Refund candidate could not be created");
    this.name = "RefundCandidateError";
  }
}

/**
 * A client dispute is evidence for an internal review, not a provider refund and not a wallet
 * mutation. The monetary decision is owned by the separately authorized admin workflow.
 */
export function createClientRefundCandidate(input: Readonly<{
  candidateId: string;
  clientUserId: string;
  order: Readonly<{ id: string; clientUserId: string; status: string }>;
  statement: string;
  now: string;
}>): ClientRefundCandidate {
  const candidateId = uuid(input.candidateId);
  const clientUserId = uuid(input.clientUserId);
  const orderId = uuid(input.order?.id);
  if (input.order.clientUserId !== clientUserId) fail("order_not_owned");
  if (!refundableOrderStatus(input.order.status)) fail("order_not_eligible");
  const statement = normalizeStatement(input.statement);
  const now = instant(input.now);
  return Object.freeze({
    id: candidateId,
    orderId,
    clientUserId,
    statement,
    status: "submitted" as const,
    version: 1 as const,
    submittedAt: now,
    resolvedRefundCaseId: null,
    resolvedAt: null,
    updatedAt: now
  });
}

function refundableOrderStatus(value: unknown): boolean {
  return value === "paid" || value === "fulfilled" || value === "partially_refunded";
}

function normalizeStatement(value: unknown): string {
  if (typeof value !== "string") fail("statement_invalid");
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 2_000 ||
    hasAsciiControlCharacter(normalized)
  ) {
    fail("statement_invalid");
  }
  return normalized;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  ) {
    fail("invalid_input");
  }
  return value;
}

function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) ||
    Number.isNaN(new Date(value).getTime())
  ) {
    fail("invalid_input");
  }
  return value;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function fail(reason: RefundCandidateError["reason"]): never {
  throw new RefundCandidateError(reason);
}
