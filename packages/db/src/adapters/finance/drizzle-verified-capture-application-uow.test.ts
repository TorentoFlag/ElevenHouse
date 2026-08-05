import type { ApplyVerifiedCaptureCommand } from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeProviderOperationResultCommitReceipts } from "../../schema/finance/provider-operations.schema";
import {
  createDrizzleVerifiedCaptureApplicationUnitOfWork,
  deriveVerifiedCapturePersistenceIds,
  normalizeVerifiedCaptureApplicationCommand,
  rehydratePersistedProviderCaptureAuthority,
  verifiedCaptureApplicationWriteBoundaryValues,
  VerifiedCaptureApplicationPersistenceError
} from "./drizzle-verified-capture-application-uow";

describe("verified capture application persistence boundary", () => {
  it("exposes every top-level and delegated atomic write boundary for rollback injection", () => {
    expect(verifiedCaptureApplicationWriteBoundaryValues).toEqual([
      "capture_transition_fact",
      "capture_fact",
      "economic_session_head",
      "economic_intent_head",
      "clearing_head",
      "sealed_journal",
      "wallet_head",
      "operation_receipt",
      "payable_lots",
      "authority_bindings",
      "effects",
      "lineage",
      "component_slots",
      "lot_transitions",
      "wallet_history",
      "commit_binding",
      "lot_state_snapshot",
      "lot_commitment_chain",
      "application_receipt_and_outbox"
    ]);
  });

  it.each([
    ["40001", false],
    ["40P01", true]
  ])("maps retryable PostgreSQL conflict %s to one typed reason", async (code, nested) => {
    const postgresError = Object.assign(new Error("retry transaction"), { code });
    const thrown = nested ? new Error("driver wrapper", { cause: postgresError }) : postgresError;
    const database = {
      async transaction() {
        throw thrown;
      }
    } as unknown as ElevenHouseDatabase;
    const unitOfWork = createDrizzleVerifiedCaptureApplicationUnitOfWork({ database });

    const result = unitOfWork.applyVerifiedCapture(cardSetupCommand());

    await expect(result).rejects.toBeInstanceOf(VerifiedCaptureApplicationPersistenceError);
    await expect(result).rejects.toMatchObject({
      code: "verified_capture_application_persistence_error",
      reason: "retryable_concurrency_conflict"
    });
  });

  it("rejects malformed input before opening a PostgreSQL transaction", async () => {
    let transactions = 0;
    const database = {
      async transaction() {
        transactions += 1;
        throw new Error("must not open");
      }
    } as unknown as ElevenHouseDatabase;
    const unitOfWork = createDrizzleVerifiedCaptureApplicationUnitOfWork({ database });

    await expect(
      unitOfWork.applyVerifiedCapture({} as ApplyVerifiedCaptureCommand)
    ).rejects.toMatchObject({ reason: "invalid_command" });
    expect(transactions).toBe(0);
  });

  it("accepts the exact zero-RUB card-setup capture branch", () => {
    const command = cardSetupCommand();

    const normalized = normalizeVerifiedCaptureApplicationCommand(command);

    expect(normalized).toMatchObject({
      economicPaymentIntentId: "economic-card-setup-1",
      expectedEconomicPaymentVersion: 2,
      providerOperationIntentId: "provider-operation-card-setup-1",
      expectedProviderOperationIntentVersion: 1,
      financialMutation: {
        kind: "no_posting",
        reason: "zero_amount_platform_card_setup"
      },
      providerResult: {
        purpose: "platform_card_setup",
        operationKind: "card_setup",
        amountMinor: "0",
        currency: "RUB"
      }
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.providerResult)).toBe(true);
  });

  it("rejects a client order from the provider-result path before opening a transaction", () => {
    const command = cardSetupCommand();
    const clientOrderAttempt = {
      ...command,
      providerResult: { ...command.providerResult, purpose: "client_order" }
    } as ApplyVerifiedCaptureCommand;

    expect(() => normalizeVerifiedCaptureApplicationCommand(clientOrderAttempt)).toThrow(
      VerifiedCaptureApplicationPersistenceError
    );
  });

  it("derives bounded transition and capture identities from the immutable provider result", () => {
    expect(deriveVerifiedCapturePersistenceIds("provider-result-card-setup-1")).toEqual({
      transitionFactId:
        "capture-transition:efbcc43a59f6b407f120a4eae8b4666e6917ca43d9af0626175180198b840e52",
      captureFactId: "capture:efbcc43a59f6b407f120a4eae8b4666e6917ca43d9af0626175180198b840e52"
    });
    expect(() => deriveVerifiedCapturePersistenceIds(" provider-result ")).toThrow(
      VerifiedCaptureApplicationPersistenceError
    );
  });

  it("rehydrates only the exact persisted provider-result receipt named by the command", () => {
    const command = normalizeVerifiedCaptureApplicationCommand(cardSetupCommand());
    const row = providerResultReceiptRow();

    expect(rehydratePersistedProviderCaptureAuthority(row, command.providerResult)).toMatchObject({
      providerResultReceiptId: "11111111-1111-4111-8111-111111111111",
      providerResultReceiptDigest: sha("d"),
      providerOperationResultId: "provider-result-card-setup-1",
      providerOperationIntentId: "provider-operation-card-setup-1",
      providerOperationIntentVersion: 1,
      providerPaymentId: "arc-payment-card-setup-1",
      amountMinor: "0",
      currency: "RUB"
    });
    for (const drifted of [
      { ...row, canonicalRequestDigest: sha("e") },
      { ...row, providerAccountId: "arc-account-other" },
      { ...row, observedAt: new Date("2026-08-04T01:00:00.001Z") }
    ]) {
      expect(() =>
        rehydratePersistedProviderCaptureAuthority(drifted, command.providerResult)
      ).toThrow(VerifiedCaptureApplicationPersistenceError);
    }
  });

  it.each([
    [
      "economic intent",
      (command: Record<string, unknown>): void => {
        command.economicPaymentIntentId = "other";
      }
    ],
    [
      "provider operation",
      (command: Record<string, unknown>): void => {
        command.providerOperationIntentId = "other";
      }
    ],
    [
      "economic version",
      (command: Record<string, unknown>): void => {
        command.expectedEconomicPaymentVersion = 3;
      }
    ],
    [
      "provider version",
      (command: Record<string, unknown>): void => {
        command.expectedProviderOperationIntentVersion = 2;
      }
    ],
    [
      "purpose matrix",
      (command: Record<string, unknown>) => {
        const result = command.providerResult as Record<string, unknown>;
        result.purpose = "platform_invoice";
      }
    ],
    [
      "amount matrix",
      (command: Record<string, unknown>) => {
        const result = command.providerResult as Record<string, unknown>;
        result.amountMinor = "1";
      }
    ],
    [
      "non-canonical provider instant",
      (command: Record<string, unknown>) => {
        const result = command.providerResult as Record<string, unknown>;
        result.observedAt = "2026-08-04T01:00:00.000001Z";
      }
    ],
    [
      "unknown field",
      (command: Record<string, unknown>): void => {
        command.untrustedScope = {};
      }
    ]
  ] as const)("rejects %s drift before opening a transaction", (_label, mutate) => {
    const command = structuredClone(cardSetupCommand()) as unknown as Record<string, unknown>;
    mutate(command);

    expect(() => normalizeVerifiedCaptureApplicationCommand(command as never)).toThrow(
      VerifiedCaptureApplicationPersistenceError
    );
  });
});

function cardSetupCommand(): ApplyVerifiedCaptureCommand {
  return {
    economicPaymentIntentId: "economic-card-setup-1",
    expectedEconomicPaymentVersion: 2,
    providerOperationIntentId: "provider-operation-card-setup-1",
    expectedProviderOperationIntentVersion: 1,
    financialMutation: {
      kind: "no_posting",
      reason: "zero_amount_platform_card_setup"
    },
    providerResult: {
      kind: "provider_operation_result_commit_receipt",
      providerOperationResultId: "provider-result-card-setup-1",
      providerOperationIntentId: "provider-operation-card-setup-1",
      providerOperationIntentVersion: 1,
      providerOperationId: "arc-operation-card-setup-1",
      operationKind: "card_setup",
      economicPaymentIntentId: "economic-card-setup-1",
      correlatedEconomicPaymentVersion: 2,
      economicPaymentSessionId: "economic-session-card-setup-1",
      sourceId: "card-setup-1",
      purpose: "platform_card_setup",
      providerAccount: {
        seriesId: "arc-series-main",
        providerAccountId: "arc-account-main",
        identityVersion: 1
      },
      outcome: "succeeded",
      providerPaymentId: "arc-payment-card-setup-1",
      amountMinor: "0",
      currency: "RUB",
      evidenceArtifactId: "artifact-card-setup-1",
      evidenceArtifactDigest: sha("a"),
      canonicalRequestDigest: sha("b"),
      observedAt: "2026-08-04T01:00:00.000Z",
      persistenceTransactionBoundaryRef: "postgres-xid:101",
      committedAt: "2026-08-04T01:00:01.000Z"
    } as ApplyVerifiedCaptureCommand["providerResult"],
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "capture-resource-policy",
      policyVersion: 1,
      policyDigest: sha("c"),
      maximumRows: 128,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2_097_152
    } as ApplyVerifiedCaptureCommand["operationEnvelope"]
  };
}

function sha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function providerResultReceiptRow(): typeof financeProviderOperationResultCommitReceipts.$inferSelect {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    providerOperationResultId: "provider-result-card-setup-1",
    providerOperationIntentId: "provider-operation-card-setup-1",
    providerOperationIntentVersion: "1",
    economicPaymentIntentId: "economic-card-setup-1",
    correlatedEconomicPaymentVersion: "2",
    economicPaymentSessionId: "economic-session-card-setup-1",
    seriesId: "arc-series-main",
    providerAccountId: "arc-account-main",
    providerIdentityVersion: 1,
    purpose: "platform_card_setup",
    sourceId: "card-setup-1",
    operationKind: "card_setup",
    outcome: "succeeded",
    providerOperationId: "arc-operation-card-setup-1",
    providerPaymentId: "arc-payment-card-setup-1",
    amountMinor: "0",
    currency: "RUB",
    canonicalRequestDigest: sha("b"),
    idempotencyKey: "finance:card-setup:1",
    evidenceArtifactId: "artifact-card-setup-1",
    evidenceArtifactDigest: sha("a"),
    observedAt: new Date("2026-08-04T01:00:00.000Z"),
    resultCommittedAt: new Date("2026-08-04T01:00:00.500Z"),
    canonicalPreimage: "provider-result-receipt-preimage",
    canonicalDigest: sha("d"),
    persistenceTransactionBoundaryRef: "postgres-xid:101",
    committedAt: new Date("2026-08-04T01:00:01.000Z")
  };
}
