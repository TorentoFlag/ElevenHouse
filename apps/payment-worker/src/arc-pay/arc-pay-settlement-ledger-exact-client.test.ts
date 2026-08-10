import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  createSettlementCursorKey,
  createSettlementPageCheckpointKey,
  type FinancePrivateObjectStoragePort,
  type SettlementProviderReadPort
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import {
  ArcPayExactSettlementLedgerError,
  createArcPayExactSettlementClient,
  createArcPayExactSettlementLedgerClient
} from "./arc-pay-settlement-ledger-exact-client";

const providerAccount = Object.freeze({
  seriesId: "arc-pay-company-merchant",
  providerAccountId: "019f8fc9-0524-71ea-963b-23017a596034",
  identityVersion: 1
});

describe("createArcPayExactSettlementLedgerClient", () => {
  it("seals and losslessly decodes one documented ledger page", async () => {
    const responseBody = `{"entries":[{"entry_id":"entry-1","amount":9007199254740993,"currency":"RUB","direction":"credit","entry_type":"payment","reference_type":"payment","reference_id":"payment-1","occurred_at":"2026-08-08T08:00:00.000Z","organization_id":"${providerAccount.providerAccountId}","terminal_id":"terminal-1","bank_terminal_id":"bank-terminal-1","settlement_status":"pending","balance_after":9007199254740994},{"entry_id":"entry-2","amount":50000,"currency":"RUB","direction":"credit","entry_type":"payment","reference_type":"payment","reference_id":"payment-2","occurred_at":"2026-08-08T08:01:00.000Z","organization_id":"${providerAccount.providerAccountId}","terminal_id":"terminal-1","bank_terminal_id":"bank-terminal-1","bank_code":"bank-1","settlement_status":"pending"}],"total_count":2}`;
    const bytes = new TextEncoder().encode(responseBody);
    const digest = sha256(bytes);
    const writeImmutable = vi.fn(async () => ({
      privateObjectKey: "finance/settlement/entry-1",
      privateObjectVersion: "1",
      envelopeKeyVersion: "local-v1",
      sha256Digest: digest,
      byteLength: bytes.byteLength,
      contentType: "application/json"
    }));
    const registerSealedArtifact = vi.fn(async () => ({
      artifactId: `arc-settlement-ledger:${providerAccount.providerAccountId}:${digest.slice(7)}`,
      sha256Digest: digest,
      byteLength: bytes.byteLength
    }));
    const fetchImpl = vi.fn(async () => new Response(bytes, { status: 200 }));
    const client = createArcPayExactSettlementLedgerClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret",
      privateObjectStorage: { writeImmutable } as Pick<
        FinancePrivateObjectStoragePort,
        "writeImmutable"
      >,
      artifactRegistry: { registerSealedArtifact } as Pick<
        FinanceArtifactRegistry,
        "registerSealedArtifact"
      >,
      retention: { policyId: "provider-settlement-page", policyVersion: "1" },
      fetchImpl,
      now: () => new Date("2026-08-08T10:00:00.000Z")
    });

    const result = await client.fetchVerifiedPage(command());

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api.arcpay.space/v1/settlement/ledger?from=2026-08-08T00%3A00%3A00.000Z&to=2026-08-08T10%3A00%3A00.000Z&limit=100&currency=RUB"
      }),
      { headers: { authorization: "Bearer test-secret" } }
    );
    expect(writeImmutable).toHaveBeenCalledWith({
      artifactId: `arc-settlement-ledger:${providerAccount.providerAccountId}:${digest.slice(7)}`,
      contentType: "application/json",
      bytes,
      expectedSha256Digest: digest
    });
    expect(registerSealedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactClass: "provider_settlement_page",
        binding: { kind: "provider", providerAccount },
        retentionPolicyId: "provider-settlement-page",
        retentionPolicyVersion: "1"
      })
    );
    expect(result).toMatchObject({
      stream: "settlement_ledger",
      rawArtifact: { sha256Digest: digest, byteLength: bytes.byteLength },
      normalizedEntries: {
        returnedCount: 2,
        nextCursor: null,
        rows: [
          {
            amountMinor: "9007199254740993",
            balanceAfterMinor: "9007199254740994",
            organizationId: providerAccount.providerAccountId,
            key: { providerAccount, providerEntryId: "entry-1" }
          },
          {
            amountMinor: "50000",
            balanceAfterMinor: null,
            bankCode: "bank-1",
            key: { providerAccount, providerEntryId: "entry-2" }
          }
        ]
      }
    });
  });

  it("rejects a page from another merchant before writing an artifact", async () => {
    const writeImmutable = vi.fn();
    const client = createArcPayExactSettlementLedgerClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret",
      privateObjectStorage: { writeImmutable } as never,
      artifactRegistry: { registerSealedArtifact: vi.fn() } as never,
      retention: { policyId: "provider-settlement-page", policyVersion: "1" },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            entries: [{ ...ledgerEntry(), organization_id: "another-merchant" }],
            next_cursor: null,
            total_count: 1
          }),
          { status: 200 }
        )
    });

    await expect(client.fetchVerifiedPage(command())).rejects.toMatchObject({
      code: "ARC_PAY_EXACT_SETTLEMENT_LEDGER_ERROR",
      reason: "invalid_response"
    } satisfies Partial<ArcPayExactSettlementLedgerError>);
    expect(writeImmutable).not.toHaveBeenCalled();
  });

  it("seals and losslessly decodes a payout page on the payout stream", async () => {
    const responseBody = JSON.stringify({
      payouts: [
        {
          payout_id: "payout-1",
          amount: 125000,
          currency: "RUB",
          status: "completed",
          payout_method: "bank_transfer",
          bank_payout_id: "bank-payout-1",
          completed_at: "2026-08-08T08:00:00.000Z"
        }
      ],
      next_cursor: null
    });
    const bytes = new TextEncoder().encode(responseBody);
    const digest = sha256(bytes);
    const fetchImpl = vi.fn(async () => new Response(bytes, { status: 200 }));
    const client = createArcPayExactSettlementClient({
      stream: "settlement_payouts",
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret",
      privateObjectStorage: {
        writeImmutable: vi.fn(async () => ({
          privateObjectKey: "finance/settlement/payout-1",
          privateObjectVersion: "1",
          envelopeKeyVersion: "local-v1",
          sha256Digest: digest,
          byteLength: bytes.byteLength,
          contentType: "application/json"
        }))
      } as never,
      artifactRegistry: {
        registerSealedArtifact: vi.fn(async () => ({
          artifactId: `arc-settlement-payouts:${providerAccount.providerAccountId}:${digest.slice(7)}`,
          sha256Digest: digest,
          byteLength: bytes.byteLength
        }))
      } as never,
      retention: { policyId: "provider-settlement-page", policyVersion: "1" },
      fetchImpl,
      now: () => new Date("2026-08-08T10:00:00.000Z")
    });

    const result = await client.fetchVerifiedPage(command("settlement_payouts"));

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api.arcpay.space/v1/settlement/payouts?limit=100"
      }),
      { headers: { authorization: "Bearer test-secret" } }
    );
    expect(result).toMatchObject({
      stream: "settlement_payouts",
      rawArtifact: { sha256Digest: digest, byteLength: bytes.byteLength },
      normalizedEntries: {
        returnedCount: 1,
        rows: [
          {
            key: { providerAccount, providerPayoutId: "payout-1" },
            amountMinor: "125000",
            currency: "RUB",
            status: "completed",
            providerBankPayoutId: "bank-payout-1"
          }
        ]
      }
    });
  });
});

function command(
  stream: "settlement_ledger" | "settlement_payouts" = "settlement_ledger"
): Parameters<SettlementProviderReadPort["fetchVerifiedPage"]>[0] {
  const cursorKey = createSettlementCursorKey({ providerAccount, stream });
  return {
    cursorKey,
    checkpointIdentity: createSettlementPageCheckpointKey({
      cursorKey,
      windowGeneration: 1,
      providerPageCursor: null
    }),
    windowStart: "2026-08-08T00:00:00.000Z",
    windowEnd: "2026-08-08T10:00:00.000Z",
    lease: {
      kind: "settlement_cursor_lease_receipt",
      cursorKey,
      cursorVersion: 2,
      leaseOwnerId: "worker-a",
      leaseToken: "lease-token-a",
      fencingToken: 1,
      databaseClaimedAt: "2026-08-08T09:59:00.000Z",
      databaseExpiresAt: "2026-08-08T10:10:00.000Z",
      state: "active"
    } as never,
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "settlement-ingestion-v1",
      policyVersion: 1,
      policyDigest: `sha256:${"a".repeat(64)}`,
      maximumRows: 100,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2 * 1024 * 1024
    } as never
  };
}

function ledgerEntry() {
  return {
    entry_id: "entry-1",
    amount: 1000,
    currency: "RUB",
    direction: "credit",
    entry_type: "payment",
    reference_type: "payment",
    reference_id: "payment-1",
    occurred_at: "2026-08-08T08:00:00.000Z",
    organization_id: providerAccount.providerAccountId,
    terminal_id: "terminal-1",
    bank_terminal_id: "bank-terminal-1",
    settlement_status: "pending",
    balance_after: 1000
  };
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
