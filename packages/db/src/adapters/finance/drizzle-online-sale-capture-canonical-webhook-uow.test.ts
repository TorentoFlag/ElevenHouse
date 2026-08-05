import {
  createCapturedProviderPaymentSemanticSourceId,
  type OnlineSaleCapturePersistenceResolver
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork,
  resolveOnlineSaleCapturePersistenceInTransaction
} from "./drizzle-online-sale-capture-canonical-webhook-uow";

describe("canonical online-sale capture webhook composite UoW", () => {
  it("passes the caller-owned transaction to the v2 resolver and returns its concrete v2 receipt", async () => {
    const transaction = { marker: "outer-transaction" } as unknown as FinanceTransaction;
    const command = { receipt: { kind: "online_sale_capture_receipt", schemaVersion: 2 } } as never;
    let receivedTransaction: FinanceTransaction | null = null;
    const resolver: OnlineSaleCapturePersistenceResolver<FinanceTransaction> = {
      async resolveOnlineSaleCapturePersistence(received, input) {
        receivedTransaction = received;
        expect(input).toEqual({ semanticCapture: { receiptId: "semantic-1" }, capture: {} });
        return command;
      }
    };

    await expect(
      resolveOnlineSaleCapturePersistenceInTransaction(resolver, transaction, {
        semanticCapture: { receiptId: "semantic-1" },
        capture: {}
      } as never)
    ).resolves.toBe(command);
    expect(receivedTransaction).toBe(transaction);
  });

  it("rolls back the semantic mutation when the v2 capture writer fails", async () => {
    const calls: string[] = [];
    const transaction = { marker: "outer-transaction" } as unknown as FinanceTransaction;
    const captureFailure = new Error("v2 writer rejected capture");
    const unitOfWork = createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
      workerId: "payment-worker-1",
      database: {
        async transaction(callback: (received: FinanceTransaction) => Promise<unknown>) {
          calls.push("begin");
          try {
            const result = await callback(transaction);
            calls.push("commit");
            return result;
          } catch (error) {
            calls.push("rollback");
            throw error;
          }
        }
      } as never,
      mutationResolver: {
        async resolveOnlineSaleCapturePersistence(received) {
          expect(received).toBe(transaction);
          calls.push("resolve-v2-command");
          return { receipt: { kind: "online_sale_capture_receipt", schemaVersion: 2 } } as never;
        }
      },
      transactionOps: {
        async applySemanticFact(received) {
          expect(received).toBe(transaction);
          calls.push("apply-semantic");
          return semanticReceipt() as never;
        },
        async applyCaptureFact(received, receipt) {
          expect(received).toBe(transaction);
          expect(receipt).toMatchObject({ semanticFactId: "semantic-fact-1" });
          calls.push("apply-capture-fact");
          return "capture:semantic:test";
        },
        async commitOnlineSaleCapture(received, command) {
          expect(received).toBe(transaction);
          expect(command).toMatchObject({
            receipt: { kind: "online_sale_capture_receipt", schemaVersion: 2 }
          });
          calls.push("write-v2-capture");
          throw captureFailure;
        },
        async applyEconomicEffects() {
          throw new Error("economic effects must not run after writer failure");
        }
      }
    });

    await expect(unitOfWork.applyCanonicalOnlineSaleCapture(commandForCapture())).rejects.toBe(
      captureFailure
    );
    expect(calls).toEqual([
      "begin",
      "apply-semantic",
      "apply-capture-fact",
      "resolve-v2-command",
      "write-v2-capture",
      "rollback"
    ]);
  });

  it("returns the canonical semantic receipt together with the concrete v2 capture receipt", async () => {
    const transaction = { marker: "outer-transaction" } as unknown as FinanceTransaction;
    const v2Command = {
      receipt: {
        kind: "online_sale_capture_receipt",
        schemaVersion: 2,
        receiptId: "online-receipt-1"
      }
    } as never;
    const unitOfWork = createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
      workerId: "payment-worker-1",
      database: {
        async transaction(callback: (received: FinanceTransaction) => Promise<unknown>) {
          return callback(transaction);
        }
      } as never,
      mutationResolver: {
        async resolveOnlineSaleCapturePersistence() {
          return v2Command;
        }
      },
      transactionOps: {
        async applySemanticFact() {
          return semanticReceipt() as never;
        },
        async applyCaptureFact() {
          return "capture:semantic:test";
        },
        async commitOnlineSaleCapture() {
          return { kind: "online_sale_capture_commit_receipt", effect: "applied_once" } as never;
        },
        async applyEconomicEffects(received, input) {
          expect(received).toBe(transaction);
          expect(input).toMatchObject({
            captureFactId: "capture:semantic:test",
            captureCommitReceipt: { effect: "applied_once" }
          });
        }
      }
    });

    await expect(
      unitOfWork.applyCanonicalOnlineSaleCapture(commandForCapture())
    ).resolves.toMatchObject({
      kind: "canonical_online_sale_capture_commit_receipt",
      effect: "applied_once",
      semanticCommitReceipt: { receiptId: "semantic-receipt-1" },
      captureReceipt: { receiptId: "online-receipt-1", schemaVersion: 2 }
    });
  });

  it("rolls back instead of applying economic effects when the v2 writer reports a replay", async () => {
    const calls: string[] = [];
    const transaction = { marker: "outer-transaction" } as unknown as FinanceTransaction;
    const unitOfWork = createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork({
      workerId: "payment-worker-1",
      database: {
        async transaction(callback: (received: FinanceTransaction) => Promise<unknown>) {
          calls.push("begin");
          try {
            return await callback(transaction);
          } catch (error) {
            calls.push("rollback");
            throw error;
          }
        }
      } as never,
      mutationResolver: {
        async resolveOnlineSaleCapturePersistence() {
          calls.push("resolve-v2-command");
          return { receipt: { kind: "online_sale_capture_receipt", schemaVersion: 2 } } as never;
        }
      },
      transactionOps: {
        async applySemanticFact() {
          calls.push("apply-semantic");
          return semanticReceipt() as never;
        },
        async applyCaptureFact() {
          calls.push("apply-capture-fact");
          return "capture:semantic:test";
        },
        async commitOnlineSaleCapture() {
          calls.push("write-v2-capture");
          return { kind: "online_sale_capture_commit_receipt", effect: "replayed" } as never;
        },
        async applyEconomicEffects() {
          calls.push("apply-economic-effects");
        }
      }
    });

    await expect(
      unitOfWork.applyCanonicalOnlineSaleCapture(commandForCapture())
    ).rejects.toMatchObject({
      code: "online_sale_capture_canonical_webhook_persistence_error",
      reason: "capture_replay_conflict"
    });
    expect(calls).toEqual([
      "begin",
      "apply-semantic",
      "apply-capture-fact",
      "resolve-v2-command",
      "write-v2-capture",
      "rollback"
    ]);
  });
});

function commandForCapture() {
  const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  return {
    semanticFact: {
      inboxItemId: "inbox-1",
      expectedInboxVersion: 2,
      expectedCheckpointSequence: 1,
      processorVersion: 1,
      semanticEvidence: {
        kind: "verified_webhook_semantic_evidence",
        providerAccount: {
          seriesId: "arc-sandbox",
          providerAccountId: "merchant-sandbox",
          identityVersion: 1
        },
        webhookId: "webhook-1",
        semanticSourceKind: "payment_transition",
        semanticSourceId: createCapturedProviderPaymentSemanticSourceId("payment-1"),
        economicPaymentIntentId: "economic-intent-1",
        economicPaymentSessionId: "economic-session-1",
        providerPaymentId: "payment-1",
        amountMinor: "50000",
        currency: "RUB",
        purpose: "client_order",
        canonicalFactDigest: digest,
        artifact: { artifactId: "artifact-1", sha256Digest: digest, byteLength: 10 },
        observedAt: "2026-08-05T12:00:00.000Z"
      },
      operationEnvelope: operationEnvelope(digest)
    },
    capture: {
      economicPaymentIntentId: "economic-intent-1",
      expectedEconomicPaymentVersion: 3,
      operationEnvelope: operationEnvelope(digest)
    }
  } as never;
}

function semanticReceipt() {
  return {
    kind: "webhook_semantic_commit_receipt",
    receiptId: "semantic-receipt-1",
    inboxItemId: "inbox-1",
    inboxVersion: 2,
    committedCheckpointSequence: 1,
    semanticFactId: "semantic-fact-1",
    semanticSourceKind: "payment_transition",
    semanticSourceId: createCapturedProviderPaymentSemanticSourceId("payment-1"),
    economicPaymentIntentId: "economic-intent-1",
    economicPaymentSessionId: "economic-session-1",
    purpose: "client_order",
    providerPaymentId: "payment-1",
    amountMinor: "50000",
    currency: "RUB",
    businessEffect: "applied_once"
  };
}

function operationEnvelope(digest: `sha256:${string}`) {
  return {
    kind: "resolved_finance_operation_envelope",
    policyId: "client_order_capture",
    policyVersion: 1,
    policyDigest: digest,
    maximumRows: 20,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 4096
  };
}
