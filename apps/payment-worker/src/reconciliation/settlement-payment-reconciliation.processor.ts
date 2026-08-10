import {
  digestFinanceCanonicalValueV1,
  resolveFinanceOperationEnvelope,
  type FinanceOperationResourcePolicyReader,
  type FinanceProviderAccountIdentity,
  type ProviderSettlementEntryKey,
  type SettlementBatchIngestionCommitReceiptRef,
  type SettlementPaymentCorrelationRule
} from "@elevenhouse/domain/finance-core";

type ClearingState = "unmatched" | "settlement_seen" | "provider_matched";

export type SettlementPaymentReconciliationCandidate = Readonly<{
  providerEntryKey: ProviderSettlementEntryKey;
  batchIngestion: SettlementBatchIngestionCommitReceiptRef;
  referenceType: string;
  direction: string;
  entryType: string;
  settlementStatus: string | null;
  capture: Readonly<{ economicPaymentIntentId: string }> | null;
  clearing: Readonly<{ state: ClearingState; version: number }> | null;
}>;

export type SettlementPaymentReconciliationResult =
  | Readonly<{ kind: "not_configured" }>
  | Readonly<{
      kind: "reconciled";
      inspected: number;
      providerMatched: number;
      quarantinedMissingCapture: number;
      quarantinedRuleMismatch: number;
      skippedPending: number;
      alreadyMatched: number;
    }>;

export class SettlementPaymentReconciliationProcessorError extends Error {
  readonly code = "settlement_payment_reconciliation_processor_error" as const;

  constructor(readonly reason: "policy_not_published" | "clearing_missing" | "clearing_state_invalid") {
    super("Settlement payment reconciliation could not continue safely");
  }
}

type SettlementPaymentReconciliationInput = Readonly<{
  providerAccounts: Readonly<{
    findActiveProviderAccount(input: Readonly<{ provider: "arc_pay" }>): Promise<FinanceProviderAccountIdentity | null>;
  }>;
  operationPolicies: FinanceOperationResourcePolicyReader;
  candidates: Readonly<{
    listOpenPaymentCandidates(input: Readonly<{
      providerAccount: FinanceProviderAccountIdentity;
      maximumRows: number;
    }>): Promise<readonly SettlementPaymentReconciliationCandidate[]>;
  }>;
  settlementSeen: Readonly<{
    advance(input: Readonly<{
      providerEntryKey: ProviderSettlementEntryKey;
      batchIngestion: SettlementBatchIngestionCommitReceiptRef;
      economicPaymentIntentId: string;
      expectedClearingVersion: number;
    }>): Promise<void>;
  }>;
  createMatcher(providerAccount: FinanceProviderAccountIdentity): Readonly<{
    matchSettlementPayment(input: Readonly<{
      providerEntryKey: ProviderSettlementEntryKey;
      economicPaymentIntentId: string;
      expectedClearingVersion: number;
      batchIngestion: SettlementBatchIngestionCommitReceiptRef;
      correlationRule: SettlementPaymentCorrelationRule;
      operationEnvelope: ReturnType<typeof resolveFinanceOperationEnvelope>;
    }>): Promise<Readonly<{ matchResult: "matched" | "quarantined_no_effect"; ref: Readonly<{ receiptId: string }> }>>;
  }>;
  providerMatched: Readonly<{
    advance(input: Readonly<{
      economicPaymentIntentId: string;
      expectedClearingVersion: number;
      matchReceiptId: string;
    }>): Promise<void>;
  }>;
  quarantine: Readonly<{
    quarantineMissingCapture(input: Readonly<{
      providerEntryKey: ProviderSettlementEntryKey;
      batchIngestion: SettlementBatchIngestionCommitReceiptRef;
    }>): Promise<void>;
  }>;
}>;

/**
 * Drives only provider-side payment matching. It never invents a capture, moves money or treats
 * a pending ArcPay ledger row as settled. Bank matching remains a distinct later reconciliation.
 */
export function createSettlementPaymentReconciliationProcessor(
  input: SettlementPaymentReconciliationInput
): Readonly<{ tick(): Promise<SettlementPaymentReconciliationResult> }> {
  return Object.freeze({
    async tick() {
      const providerAccount = await input.providerAccounts.findActiveProviderAccount({ provider: "arc_pay" });
      if (!providerAccount) return Object.freeze({ kind: "not_configured" as const });
      const policy = await input.operationPolicies.findPublishedForOperation({
        operationKind: "settlement_ingestion"
      });
      if (!policy) fail("policy_not_published");
      const operationEnvelope = resolveFinanceOperationEnvelope({
        policy,
        operationKind: "settlement_ingestion"
      });
      const candidates = await input.candidates.listOpenPaymentCandidates({
        providerAccount,
        maximumRows: operationEnvelope.maximumRows
      });
      const result = {
        inspected: candidates.length,
        providerMatched: 0,
        quarantinedMissingCapture: 0,
        quarantinedRuleMismatch: 0,
        skippedPending: 0,
        alreadyMatched: 0
      };
      const rule = createArcPayAvailablePaymentCreditRule(providerAccount);
      const matcher = input.createMatcher(providerAccount);
      for (const candidate of candidates) {
        if (candidate.settlementStatus === "pending") {
          result.skippedPending += 1;
          continue;
        }
        if (!isArcPayAvailablePaymentCredit(candidate)) continue;
        if (!candidate.capture) {
          await input.quarantine.quarantineMissingCapture({
            providerEntryKey: candidate.providerEntryKey,
            batchIngestion: candidate.batchIngestion
          });
          result.quarantinedMissingCapture += 1;
          continue;
        }
        if (!candidate.clearing) fail("clearing_missing");
        if (candidate.clearing.state === "provider_matched") {
          result.alreadyMatched += 1;
          continue;
        }
        let clearingVersion = candidate.clearing.version;
        if (candidate.clearing.state === "unmatched") {
          await input.settlementSeen.advance({
            providerEntryKey: candidate.providerEntryKey,
            batchIngestion: candidate.batchIngestion,
            economicPaymentIntentId: candidate.capture.economicPaymentIntentId,
            expectedClearingVersion: clearingVersion
          });
          clearingVersion += 1;
        } else if (candidate.clearing.state !== "settlement_seen") {
          fail("clearing_state_invalid");
        }
        const match = await matcher.matchSettlementPayment({
          providerEntryKey: candidate.providerEntryKey,
          economicPaymentIntentId: candidate.capture.economicPaymentIntentId,
          expectedClearingVersion: clearingVersion,
          batchIngestion: candidate.batchIngestion,
          correlationRule: rule,
          operationEnvelope
        });
        if (match.matchResult === "quarantined_no_effect") {
          result.quarantinedRuleMismatch += 1;
          continue;
        }
        await input.providerMatched.advance({
          economicPaymentIntentId: candidate.capture.economicPaymentIntentId,
          expectedClearingVersion: clearingVersion,
          matchReceiptId: match.ref.receiptId
        });
        result.providerMatched += 1;
      }
      return Object.freeze({ kind: "reconciled" as const, ...result });
    }
  });
}

export function createArcPayAvailablePaymentCreditRule(
  providerAccount: FinanceProviderAccountIdentity
): SettlementPaymentCorrelationRule {
  const semantics = {
    referenceType: "payment",
    direction: "credit",
    entryType: "payment_credit",
    settlementStatus: "available",
    amountRelation: "same_minor"
  } as const;
  const identity = {
    kind: "settlement_payment_correlation_rule" as const,
    ruleId: "arc-pay-available-payment-credit-v1",
    ruleVersion: 1,
    providerAccount
  };
  return Object.freeze({
    ...identity,
    ruleDigest: digestFinanceCanonicalValueV1({ ...identity, semantics })
  }) as SettlementPaymentCorrelationRule;
}

export function startSettlementPaymentReconciliationInterval(input: Readonly<{
  processor: Readonly<{ tick(): Promise<SettlementPaymentReconciliationResult> }>;
  intervalMs: number;
  onResult?(result: SettlementPaymentReconciliationResult): void;
  onError(error: unknown): void;
}>): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs <= 0) return () => undefined;
  const run = async () => {
    try {
      input.onResult?.(await input.processor.tick());
    } catch (error) {
      input.onError(error);
    }
  };
  const timer = setInterval(() => void run(), input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}

function isArcPayAvailablePaymentCredit(candidate: SettlementPaymentReconciliationCandidate): boolean {
  return (
    candidate.referenceType === "payment" &&
    candidate.direction === "credit" &&
    candidate.entryType === "payment_credit" &&
    candidate.settlementStatus === "available"
  );
}

function fail(reason: SettlementPaymentReconciliationProcessorError["reason"]): never {
  throw new SettlementPaymentReconciliationProcessorError(reason);
}
