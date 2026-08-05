import { describe, expect, it } from "vitest";

import type { ApplyCanonicalClientOrderCaptureCommand } from "@elevenhouse/domain/finance-core";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  ClientOrderCanonicalCapturePersistenceError,
  createDrizzleClientOrderCanonicalCaptureUnitOfWork,
  normalizeCanonicalClientOrderCaptureCommand
} from "./drizzle-client-order-canonical-capture-uow";

describe("canonical client-order capture persistence boundary", () => {
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

    await expect(
      createDrizzleClientOrderCanonicalCaptureUnitOfWork({
        database
      }).applyCanonicalClientOrderCapture(command())
    ).rejects.toMatchObject({
      code: "client_order_canonical_capture_persistence_error",
      reason: "retryable_concurrency_conflict"
    });
  });

  it("rejects a non-semantic, non-capture command before opening PostgreSQL", () => {
    expect(() => normalizeCanonicalClientOrderCaptureCommand({})).toThrow(
      ClientOrderCanonicalCapturePersistenceError
    );
  });

  it("requires the payment-transition semantic receipt to bind exact money and session fields", () => {
    const invalid = structuredClone(command()) as Record<string, unknown>;
    const semantic = invalid.semanticCapture as Record<string, unknown>;
    semantic.amountMinor = "0";

    expect(() => normalizeCanonicalClientOrderCaptureCommand(invalid)).toThrow(
      ClientOrderCanonicalCapturePersistenceError
    );
  });

  it("normalizes a complete semantic capture envelope without accepting an untrusted provider result", () => {
    expect(normalizeCanonicalClientOrderCaptureCommand(command())).toMatchObject({
      economicPaymentIntentId: "economic-client-1",
      semanticCapture: {
        semanticFactId: "semantic-capture-1",
        semanticSourceKind: "payment_transition",
        businessEffect: "applied_once"
      }
    });
  });
});

function command(): ApplyCanonicalClientOrderCaptureCommand {
  // The runtime boundary test exercises malformed input and retry classification only; branded
  // persistence receipts cannot be manufactured by a caller and are deliberately not faked here.
  return {
    economicPaymentIntentId: "economic-client-1",
    expectedEconomicPaymentVersion: 2,
    semanticCapture: {
      kind: "webhook_semantic_commit_receipt",
      receiptId: "11111111-1111-4111-8111-111111111111",
      inboxItemId: "webhook-inbox-1",
      inboxVersion: 2,
      committedCheckpointSequence: 1,
      semanticFactId: "semantic-capture-1",
      semanticSourceKind: "payment_transition",
      semanticSourceId: "arc-payment-1",
      providerAccount: {
        seriesId: "arc-series-1",
        providerAccountId: "arc-account-1",
        identityVersion: 1
      },
      economicPaymentIntentId: "economic-client-1",
      economicPaymentSessionId: "economic-session-1",
      purpose: "client_order",
      providerPaymentId: "arc-payment-1",
      amountMinor: "10000",
      currency: "RUB",
      canonicalFactDigest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      evidenceArtifactId: "artifact-1",
      evidenceArtifactDigest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      observedAt: "2026-08-05T12:00:00.000Z",
      businessEffect: "applied_once",
      walletJournalCommitReceipt: null,
      persistenceTransactionBoundaryRef: "postgres-xid:1",
      committedAt: "2026-08-05T12:00:01.000Z"
    },
    financialMutation: { kind: "journal_only", command: {} },
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "finance-policy-1",
      policyVersion: 1,
      policyDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      maximumRows: 100,
      maximumDecimalDigits: 20,
      maximumArtifactBytes: 1000
    }
  } as unknown as ApplyCanonicalClientOrderCaptureCommand;
}
