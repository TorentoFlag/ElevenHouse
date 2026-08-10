import { describe, expect, it } from "vitest";
import { financeOperationKindValues } from "@elevenhouse/contracts";
import {
  assertFinanceOperationReady,
  FinanceOperationNotReadyError,
  FinanceReadinessIntegrityError,
  financeReadinessRequirementCodeValues,
  requiredFinanceReadinessRequirementsFor,
  resolveFinanceOperationReadiness,
  type FinanceOperationContext,
  type FinanceReadinessEvidenceReader,
  type FinanceReadinessEvidenceRef
} from "./finance-readiness";

const now = "2026-08-03T09:00:00.000Z";
const digest = (character: string) => `sha256:${character.repeat(64)}`;

class EvidenceReader implements FinanceReadinessEvidenceReader {
  readonly calls: unknown[] = [];

  constructor(readonly evidence: readonly FinanceReadinessEvidenceRef[]) {}

  async listFinanceReadinessEvidence(
    input: Parameters<FinanceReadinessEvidenceReader["listFinanceReadinessEvidence"]>[0]
  ) {
    this.calls.push(input);
    return this.evidence;
  }
}

function evidence(
  requirementCode: FinanceReadinessEvidenceRef["requirementCode"],
  overrides: Partial<FinanceReadinessEvidenceRef> = {}
): FinanceReadinessEvidenceRef {
  return {
    id: `evidence-${requirementCode}`,
    version: 1,
    requirementCode,
    status: "active",
    transactionCategory:
      requirementCode === "legal_accounting_client_purchase"
        ? "client_purchase"
        : requirementCode === "legal_accounting_platform_subscription"
          ? "platform_subscription"
          : null,
    effectiveAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
    safeDigest: digest("a"),
    ...overrides
  };
}

const contextualRequirementCases = [
  {
    context: { operationKind: "tariff_publish" },
    requirements: ["commercial_tariff", "capability_enforcement", "finance_step_up"]
  },
  {
    context: { operationKind: "fiscal_policy_publish", transactionCategory: "client_purchase" },
    requirements: ["finance_step_up", "legal_accounting_client_purchase"]
  },
  {
    context: {
      operationKind: "fiscal_policy_publish",
      transactionCategory: "platform_subscription"
    },
    requirements: ["finance_step_up", "legal_accounting_platform_subscription"]
  },
  {
    context: { operationKind: "risk_policy_publish" },
    requirements: ["finance_step_up"]
  },
  {
    context: { operationKind: "client_checkout_prepare" },
    requirements: [
      "legal_accounting_client_purchase",
      "risk_policy",
      "product_fulfillment"
    ]
  },
  {
    context: { operationKind: "client_order_capture" },
    requirements: [
      "legal_accounting_client_purchase",
      "risk_policy",
      "product_fulfillment"
    ]
  },
  {
    context: { operationKind: "platform_card_setup_prepare" },
    requirements: []
  },
  {
    context: { operationKind: "platform_card_setup_execute" },
    requirements: []
  },
  {
    context: { operationKind: "platform_card_setup_complete_3ds_method" },
    requirements: []
  },
  {
    context: { operationKind: "platform_invoice_complete_3ds_method" },
    requirements: []
  },
  {
    context: { operationKind: "platform_invoice_charge" },
    requirements: [
      "legal_accounting_platform_subscription",
      "commercial_tariff"
    ]
  },
  {
    context: { operationKind: "platform_renewal_schedule" },
    requirements: [
      "legal_accounting_platform_subscription",
      "commercial_tariff",
      "billing_operations_policy"
    ]
  },
  {
    context: { operationKind: "refund_execute" },
    requirements: [
      "legal_accounting_client_purchase",
      "refund_chargeback_principal_policy",
      "finance_step_up"
    ]
  },
  {
    context: { operationKind: "chargeback_record_provisional" },
    requirements: []
  },
  {
    context: { operationKind: "chargeback_principal_allocate" },
    requirements: ["refund_chargeback_principal_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "chargeback_resolution" },
    requirements: ["refund_chargeback_principal_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "payout_destination_reveal" },
    requirements: ["payout_recipient_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "payout_destination_change" },
    requirements: ["payout_recipient_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "payout_approve" },
    requirements: ["payout_recipient_policy", "bank_liquidity_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "payout_start_processing" },
    requirements: ["payout_recipient_policy", "bank_liquidity_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "payout_confirm_paid" },
    requirements: ["payout_recipient_policy", "bank_liquidity_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "bank_snapshot_attest" },
    requirements: ["bank_liquidity_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "bank_statement_match" },
    requirements: ["bank_liquidity_policy", "finance_step_up"]
  },
  {
    context: { operationKind: "settlement_ingestion" },
    requirements: []
  },
  {
    context: { operationKind: "ledger_correction", sourceTransactionCategory: "client_purchase" },
    requirements: ["finance_step_up", "legal_accounting_client_purchase"]
  },
  {
    context: {
      operationKind: "ledger_correction",
      sourceTransactionCategory: "platform_subscription"
    },
    requirements: ["finance_step_up", "legal_accounting_platform_subscription"]
  }
] as const satisfies readonly {
  readonly context: FinanceOperationContext;
  readonly requirements: readonly FinanceReadinessEvidenceRef["requirementCode"][];
}[];

describe("finance readiness", () => {
  it("defines the exact production readiness evidence vocabulary", () => {
    expect(financeReadinessRequirementCodeValues).toEqual([
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
    ]);
  });

  it("classifies every operation and contextual transaction category exactly once", () => {
    expect(contextualRequirementCases).toHaveLength(26);
    expect([
      ...new Set(contextualRequirementCases.map(({ context }) => context.operationKind))
    ]).toEqual(financeOperationKindValues);
    for (const { context, requirements } of contextualRequirementCases) {
      expect(requiredFinanceReadinessRequirementsFor(context)).toEqual(requirements);
    }
  });

  it("returns the exact matched versioned evidence refs in stable requirement order", async () => {
    const context = { operationKind: "platform_renewal_schedule" } as const;
    const requirements = requiredFinanceReadinessRequirementsFor(context);
    const matchedEvidence = requirements.map((code, index) =>
      evidence(code, {
        id: `approved-${code}`,
        version: index + 1,
        safeDigest: digest(String(index + 1))
      })
    );
    const reader = new EvidenceReader([...matchedEvidence].reverse());

    await expect(resolveFinanceOperationReadiness({ context, reader, now })).resolves.toEqual({
      ready: true,
      operationKind: "platform_renewal_schedule",
      requiredRequirements: requirements,
      missingRequirements: [],
      evidence: matchedEvidence
    });
    expect(reader.calls).toEqual([
      {
        operationKind: "platform_renewal_schedule",
        requirementCodes: requirements,
        transactionCategory: "platform_subscription"
      }
    ]);
  });

  it("projects trusted rows to the safe evidence contract without leaking extra fields", async () => {
    const safeEvidence = evidence("finance_step_up");
    const trustedRow = {
      ...safeEvidence,
      secret: "must-not-leak"
    } as FinanceReadinessEvidenceRef & { readonly secret: string };

    const result = await resolveFinanceOperationReadiness({
      context: { operationKind: "risk_policy_publish" },
      reader: new EvidenceReader([trustedRow]),
      now
    });

    expect(result.evidence).toEqual([safeEvidence]);
    expect(result.evidence[0]).not.toHaveProperty("secret");
  });

  it("returns every absent, revoked, not-yet-effective, and expired requirement in stable order", async () => {
    const context = { operationKind: "platform_renewal_schedule" } as const;
    const reader = new EvidenceReader([
      evidence("legal_accounting_platform_subscription", { status: "revoked" }),
      evidence("commercial_tariff", { effectiveAt: "2026-08-04T00:00:00.000Z" })
    ]);

    await expect(resolveFinanceOperationReadiness({ context, reader, now })).resolves.toEqual({
      ready: false,
      operationKind: "platform_renewal_schedule",
      requiredRequirements: [
        "legal_accounting_platform_subscription",
        "commercial_tariff",
        "billing_operations_policy"
      ],
      missingRequirements: [
        "legal_accounting_platform_subscription",
        "commercial_tariff",
        "billing_operations_policy"
      ],
      evidence: []
    });
  });

  it("treats evidence for the wrong transaction category as missing", async () => {
    const fiscal = {
      operationKind: "fiscal_policy_publish",
      transactionCategory: "client_purchase"
    } as const;
    const fiscalReader = new EvidenceReader([
      evidence("finance_step_up"),
      evidence("legal_accounting_client_purchase", {
        transactionCategory: "platform_subscription"
      })
    ]);
    expect(
      (await resolveFinanceOperationReadiness({ context: fiscal, reader: fiscalReader, now }))
        .missingRequirements
    ).toEqual(["legal_accounting_client_purchase"]);
  });

  it("rejects duplicate evidence for the same requirement and scope", async () => {
    const context = { operationKind: "risk_policy_publish" } as const;
    const reader = new EvidenceReader([
      evidence("finance_step_up", { id: "first" }),
      evidence("finance_step_up", { id: "second", version: 2 })
    ]);

    await expect(resolveFinanceOperationReadiness({ context, reader, now })).rejects.toMatchObject({
      name: "FinanceReadinessIntegrityError",
      code: "FINANCE_READINESS_INTEGRITY_ERROR"
    });
  });

  it.each([
    { effectiveAt: "not-an-instant" },
    { expiresAt: "not-an-instant" },
    { safeDigest: "plaintext-policy" },
    { version: 0 },
    { version: Number.MAX_SAFE_INTEGER + 1 }
  ])("rejects malformed trusted evidence as an integrity failure: %o", async (overrides) => {
    const context = { operationKind: "risk_policy_publish" } as const;
    const reader = new EvidenceReader([evidence("finance_step_up", overrides)]);

    await expect(resolveFinanceOperationReadiness({ context, reader, now })).rejects.toBeInstanceOf(
      FinanceReadinessIntegrityError
    );
  });

  it("rejects an invalid supplied clock instant", async () => {
    const context = { operationKind: "risk_policy_publish" } as const;
    await expect(
      resolveFinanceOperationReadiness({
        context,
        reader: new EvidenceReader([evidence("finance_step_up")]),
        now: "not-an-instant"
      })
    ).rejects.toBeInstanceOf(FinanceReadinessIntegrityError);
  });

  it.each([
    { operationKind: "fiscal_policy_publish" },
    { operationKind: "ledger_correction" },
    { operationKind: "unknown_operation" }
  ])("rejects malformed operation context as an integrity failure: %o", async (context) => {
    await expect(
      resolveFinanceOperationReadiness({
        context: context as FinanceOperationContext,
        reader: new EvidenceReader([]),
        now
      })
    ).rejects.toBeInstanceOf(FinanceReadinessIntegrityError);
  });

  it.each([
    { operationKind: "risk_policy_publish", environment: "live" },
    {
      operationKind: "client_checkout_prepare",
      environment: "live",
      transactionCategory: "client_purchase"
    },
    {
      operationKind: "fiscal_policy_publish",
      transactionCategory: "client_purchase",
      environment: "live"
    },
    {
      operationKind: "ledger_correction",
      sourceTransactionCategory: "client_purchase",
      transactionCategory: "client_purchase"
    }
  ])("rejects irrelevant operation context fields fail closed: %o", async (context) => {
    await expect(
      resolveFinanceOperationReadiness({
        context: context as unknown as FinanceOperationContext,
        reader: new EvidenceReader([]),
        now
      })
    ).rejects.toBeInstanceOf(FinanceReadinessIntegrityError);
  });

  it("throws a typed not-ready error containing only safe operation and missing-code facts", async () => {
    const context = { operationKind: "tariff_publish" } as const;
    const secretLookingId = "private-policy-document-id";
    const reader = new EvidenceReader([
      evidence("commercial_tariff", { id: secretLookingId, safeDigest: digest("f") })
    ]);

    const rejection = await assertFinanceOperationReady({ context, reader, now }).catch(
      (error: unknown) => error
    );
    expect(rejection).toBeInstanceOf(FinanceOperationNotReadyError);
    expect(rejection).toMatchObject({
      code: "FINANCE_OPERATION_NOT_READY",
      operationKind: "tariff_publish",
      missingRequirements: ["capability_enforcement", "finance_step_up"]
    });
    expect(JSON.stringify(rejection)).not.toContain(secretLookingId);
    expect(JSON.stringify(rejection)).not.toContain(digest("f"));
  });
});
