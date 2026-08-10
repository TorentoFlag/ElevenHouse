import { Temporal } from "@js-temporal/polyfill";
import {
  financeTransactionCategoryValues,
  financeOperationKindValues,
  type FinanceOperationKind,
  type FinanceTransactionCategory
} from "@elevenhouse/contracts";

export const financeReadinessRequirementCodeValues = [
  "legal_accounting_client_purchase",
  "legal_accounting_platform_subscription",
  "commercial_tariff",
  "capability_enforcement",
  "billing_operations_policy",
  "risk_policy",
  "product_fulfillment",
  "refund_chargeback_principal_policy",
  "finance_step_up",
  "payout_recipient_policy",
  "bank_liquidity_policy"
] as const;
export type FinanceReadinessRequirementCode =
  (typeof financeReadinessRequirementCodeValues)[number];

type ContextlessOperationKind = Exclude<
  FinanceOperationKind,
  "fiscal_policy_publish" | "ledger_correction"
>;

export type FinanceOperationContext =
  | {
      readonly operationKind: "fiscal_policy_publish";
      readonly transactionCategory: FinanceTransactionCategory;
    }
  | {
      readonly operationKind: "ledger_correction";
      readonly sourceTransactionCategory: FinanceTransactionCategory;
    }
  | {
      readonly operationKind: ContextlessOperationKind;
    };

export type FinanceReadinessEvidenceStatus = "active" | "revoked";

export type FinanceReadinessEvidenceRef = {
  readonly id: string;
  readonly version: number;
  readonly requirementCode: FinanceReadinessRequirementCode;
  readonly status: FinanceReadinessEvidenceStatus;
  readonly transactionCategory: FinanceTransactionCategory | null;
  readonly effectiveAt: string;
  readonly expiresAt: string | null;
  readonly safeDigest: string;
};

export type FinanceReadinessEvidenceQuery = {
  readonly operationKind: FinanceOperationKind;
  readonly requirementCodes: readonly FinanceReadinessRequirementCode[];
  readonly transactionCategory: FinanceTransactionCategory | null;
};

export type FinanceReadinessEvidenceReader = {
  readonly listFinanceReadinessEvidence: (
    input: FinanceReadinessEvidenceQuery
  ) => Promise<readonly FinanceReadinessEvidenceRef[]>;
};

export type FinanceOperationReadiness = {
  readonly ready: boolean;
  readonly operationKind: FinanceOperationKind;
  readonly requiredRequirements: readonly FinanceReadinessRequirementCode[];
  readonly missingRequirements: readonly FinanceReadinessRequirementCode[];
  readonly evidence: readonly FinanceReadinessEvidenceRef[];
};

export class FinanceOperationNotReadyError extends Error {
  readonly code = "FINANCE_OPERATION_NOT_READY";

  constructor(
    readonly operationKind: FinanceOperationKind,
    readonly missingRequirements: readonly FinanceReadinessRequirementCode[]
  ) {
    super("Finance operation readiness requirements are not satisfied");
    this.name = "FinanceOperationNotReadyError";
  }
}

export class FinanceReadinessIntegrityError extends Error {
  readonly code = "FINANCE_READINESS_INTEGRITY_ERROR";

  constructor() {
    super("Finance readiness evidence integrity check failed");
    this.name = "FinanceReadinessIntegrityError";
  }
}

const readinessRequirementCodes = new Set<string>(financeReadinessRequirementCodeValues);
const operationKinds = new Set<string>(financeOperationKindValues);
const transactionCategories = new Set<string>(financeTransactionCategoryValues);
const evidenceStatuses = new Set<string>(["active", "revoked"]);
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function requiredFinanceReadinessRequirementsFor(
  context: FinanceOperationContext
): readonly FinanceReadinessRequirementCode[] {
  assertValidOperationContext(context);
  switch (context.operationKind) {
    case "tariff_publish":
      return ["commercial_tariff", "capability_enforcement", "finance_step_up"];
    case "fiscal_policy_publish":
      return ["finance_step_up", legalRequirementFor(context.transactionCategory)];
    case "risk_policy_publish":
      return ["finance_step_up"];
    case "client_checkout_prepare":
    case "client_order_capture":
      return [
        "legal_accounting_client_purchase",
        "risk_policy",
        "product_fulfillment"
      ];
    case "platform_card_setup_prepare":
    case "platform_card_setup_execute":
    case "platform_card_setup_complete_3ds_method":
    case "platform_invoice_complete_3ds_method":
      return [];
    case "platform_invoice_charge":
      return ["legal_accounting_platform_subscription", "commercial_tariff"];
    case "platform_renewal_schedule":
      return [
        "legal_accounting_platform_subscription",
        "commercial_tariff",
        "billing_operations_policy"
      ];
    case "refund_execute":
      return [
        "legal_accounting_client_purchase",
        "refund_chargeback_principal_policy",
        "finance_step_up"
      ];
    case "chargeback_record_provisional":
      return [];
    case "chargeback_principal_allocate":
      return ["refund_chargeback_principal_policy", "finance_step_up"];
    case "chargeback_resolution":
      return ["refund_chargeback_principal_policy", "finance_step_up"];
    case "payout_destination_reveal":
    case "payout_destination_change":
      return ["payout_recipient_policy", "finance_step_up"];
    case "payout_approve":
    case "payout_start_processing":
    case "payout_confirm_paid":
      return ["payout_recipient_policy", "bank_liquidity_policy", "finance_step_up"];
    case "bank_snapshot_attest":
    case "bank_statement_match":
      return ["bank_liquidity_policy", "finance_step_up"];
    case "settlement_ingestion":
      return [];
    case "ledger_correction":
      return ["finance_step_up", legalRequirementFor(context.sourceTransactionCategory)];
  }
}

export async function resolveFinanceOperationReadiness(input: {
  readonly context: FinanceOperationContext;
  readonly reader: FinanceReadinessEvidenceReader;
  readonly now: string;
}): Promise<FinanceOperationReadiness> {
  const now = parseInstant(input.now);
  const requiredRequirements = requiredFinanceReadinessRequirementsFor(input.context);
  const transactionCategory = transactionCategoryFor(input.context);
  const evidence = await input.reader.listFinanceReadinessEvidence({
    operationKind: input.context.operationKind,
    requirementCodes: requiredRequirements,
    transactionCategory
  });

  for (const item of evidence) {
    assertValidEvidence(item, requiredRequirements);
  }
  assertNoDuplicateEvidence(evidence);

  const matchedEvidence = requiredRequirements.flatMap((requirementCode) => {
    const match = evidence.find(
      (item) =>
        item.requirementCode === requirementCode &&
        evidenceScopeMatches(item, requirementCode, transactionCategory) &&
        evidenceIsEffective(item, now)
    );
    return match ? [toSafeEvidenceRef(match)] : [];
  });
  const matchedRequirementCodes = new Set(matchedEvidence.map((item) => item.requirementCode));
  const missingRequirements = requiredRequirements.filter(
    (requirementCode) => !matchedRequirementCodes.has(requirementCode)
  );

  return {
    ready: missingRequirements.length === 0,
    operationKind: input.context.operationKind,
    requiredRequirements,
    missingRequirements,
    evidence: matchedEvidence
  };
}

export async function assertFinanceOperationReady(input: {
  readonly context: FinanceOperationContext;
  readonly reader: FinanceReadinessEvidenceReader;
  readonly now: string;
}): Promise<FinanceOperationReadiness> {
  const readiness = await resolveFinanceOperationReadiness(input);
  if (!readiness.ready) {
    throw new FinanceOperationNotReadyError(readiness.operationKind, readiness.missingRequirements);
  }
  return readiness;
}

function legalRequirementFor(
  category: FinanceTransactionCategory
): FinanceReadinessRequirementCode {
  return category === "client_purchase"
    ? "legal_accounting_client_purchase"
    : "legal_accounting_platform_subscription";
}

function transactionCategoryFor(
  context: FinanceOperationContext
): FinanceTransactionCategory | null {
  if (context.operationKind === "fiscal_policy_publish") return context.transactionCategory;
  if (context.operationKind === "ledger_correction") return context.sourceTransactionCategory;
  if (
    context.operationKind === "client_checkout_prepare" ||
    context.operationKind === "client_order_capture" ||
    context.operationKind === "refund_execute"
  ) {
    return "client_purchase";
  }
  if (
    context.operationKind === "platform_invoice_charge" ||
    context.operationKind === "platform_renewal_schedule"
  ) {
    return "platform_subscription";
  }
  return null;
}

function evidenceScopeMatches(
  evidence: FinanceReadinessEvidenceRef,
  requirementCode: FinanceReadinessRequirementCode,
  transactionCategory: FinanceTransactionCategory | null
): boolean {
  if (
    requirementCode === "legal_accounting_client_purchase" ||
    requirementCode === "legal_accounting_platform_subscription"
  ) {
    return evidence.transactionCategory === transactionCategory;
  }
  return evidence.transactionCategory === null;
}

function evidenceIsEffective(
  evidence: FinanceReadinessEvidenceRef,
  now: Temporal.Instant
): boolean {
  if (evidence.status !== "active") return false;
  const effectiveAt = parseInstant(evidence.effectiveAt);
  if (Temporal.Instant.compare(effectiveAt, now) > 0) return false;
  return (
    evidence.expiresAt === null ||
    Temporal.Instant.compare(parseInstant(evidence.expiresAt), now) > 0
  );
}

function toSafeEvidenceRef(evidence: FinanceReadinessEvidenceRef): FinanceReadinessEvidenceRef {
  return {
    id: evidence.id,
    version: evidence.version,
    requirementCode: evidence.requirementCode,
    status: evidence.status,
    transactionCategory: evidence.transactionCategory,
    effectiveAt: evidence.effectiveAt,
    expiresAt: evidence.expiresAt,
    safeDigest: evidence.safeDigest
  };
}

function assertNoDuplicateEvidence(evidence: readonly FinanceReadinessEvidenceRef[]): void {
  const scopes = new Set<string>();
  for (const item of evidence) {
    const key = [
      item.requirementCode,
      item.transactionCategory ?? "global-category"
    ].join("|");
    if (scopes.has(key)) throw new FinanceReadinessIntegrityError();
    scopes.add(key);
  }
}

function assertValidEvidence(
  evidence: FinanceReadinessEvidenceRef,
  requiredRequirements: readonly FinanceReadinessRequirementCode[]
): void {
  if (
    !evidence ||
    typeof evidence !== "object" ||
    typeof evidence.id !== "string" ||
    evidence.id.length === 0 ||
    !Number.isSafeInteger(evidence.version) ||
    evidence.version <= 0 ||
    !readinessRequirementCodes.has(evidence.requirementCode) ||
    !requiredRequirements.includes(evidence.requirementCode) ||
    !evidenceStatuses.has(evidence.status) ||
    (evidence.transactionCategory !== null &&
      !transactionCategories.has(evidence.transactionCategory)) ||
    typeof evidence.safeDigest !== "string" ||
    !digestPattern.test(evidence.safeDigest)
  ) {
    throw new FinanceReadinessIntegrityError();
  }
  const effectiveAt = parseInstant(evidence.effectiveAt);
  if (evidence.expiresAt !== null) {
    const expiresAt = parseInstant(evidence.expiresAt);
    if (Temporal.Instant.compare(expiresAt, effectiveAt) <= 0) {
      throw new FinanceReadinessIntegrityError();
    }
  }
}

function assertValidOperationContext(context: FinanceOperationContext): void {
  if (
    !isPlainRecord(context) ||
    !operationKinds.has((context as { readonly operationKind?: unknown }).operationKind as string)
  ) {
    throw new FinanceReadinessIntegrityError();
  }
  if (context.operationKind === "fiscal_policy_publish") {
    if (
      !hasExactOwnKeys(context, ["operationKind", "transactionCategory"]) ||
      !transactionCategories.has(context.transactionCategory)
    ) {
      throw new FinanceReadinessIntegrityError();
    }
    return;
  }
  if (context.operationKind === "ledger_correction") {
    if (
      !hasExactOwnKeys(context, ["operationKind", "sourceTransactionCategory"]) ||
      !transactionCategories.has(context.sourceTransactionCategory)
    ) {
      throw new FinanceReadinessIntegrityError();
    }
    return;
  }
  if (!hasExactOwnKeys(context, ["operationKind"])) throw new FinanceReadinessIntegrityError();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactOwnKeys(value: object, expectedKeys: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string") || keys.length !== expectedKeys.length) {
    return false;
  }
  const expected = new Set(expectedKeys);
  return keys.every((key) => typeof key === "string" && expected.has(key));
}

function parseInstant(value: string): Temporal.Instant {
  try {
    if (typeof value !== "string") throw new TypeError();
    return Temporal.Instant.from(value);
  } catch {
    throw new FinanceReadinessIntegrityError();
  }
}
