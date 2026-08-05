import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { FinancePostingIntegrityError } from "./posting-codec";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import { buildStandardRefundOperationFixture } from "./refund-posting-builder-test-fixtures";
import { readAndAssertRefundOriginalPlatformJournals } from "./refund-original-platform-journal";
import { refundPostingDecoderEnvelope, withAllocationDigest } from "./refund-posting-test-fixtures";

describe("refund original platform journals", () => {
  it("rehydrates the exact source entry with order scope and chronology", () => {
    const fixture = buildStandardRefundOperationFixture("refund_confirmed");
    const terminal = fixture.terminalAuthority;
    if (terminal?.kind !== "refund_confirmed") {
      throw new Error("missing confirmed authority fixture");
    }
    expect(() =>
      readAndAssertRefundOriginalPlatformJournals(
        fixture.originalPlatformJournals,
        fixture.allocation,
        terminal.confirmedAt,
        refundPostingDecoderEnvelope
      )
    ).not.toThrow();

    const wrongOrder = structuredClone(fixture.originalPlatformJournals) as unknown[];
    asRecord(asRecord(wrongOrder[0]).sourceKey).sourceId = "other-order";
    expectReason(
      () =>
        readAndAssertRefundOriginalPlatformJournals(
          wrongOrder,
          fixture.allocation,
          terminal.confirmedAt,
          refundPostingDecoderEnvelope
        ),
      "proof_transaction_mismatch"
    );

    const future = structuredClone(fixture.originalPlatformJournals) as unknown[];
    asRecord(future[0]).occurredAt = "2026-08-06T00:00:00Z";
    asRecord(future[0]).postedAt = "2026-08-06T00:00:00Z";
    expectReason(
      () =>
        readAndAssertRefundOriginalPlatformJournals(
          future,
          fixture.allocation,
          terminal.confirmedAt,
          refundPostingDecoderEnvelope
        ),
      "proof_transaction_mismatch"
    );
  });

  it("rejects a re-signed source entry whose journal capacity is insufficient", () => {
    const fixture = buildStandardRefundOperationFixture("refund_confirmed");
    const terminal = fixture.terminalAuthority;
    if (terminal?.kind !== "refund_confirmed") {
      throw new Error("missing confirmed authority fixture");
    }
    const journals = structuredClone(fixture.originalPlatformJournals) as unknown[];
    const transaction = asRecord(journals[0]);
    const entries = transaction.entries as Record<string, unknown>[];
    asRecord(entries[0]).amount = money(69);
    asRecord(entries[1]).amount = money(69);
    transaction.totalDebitMinor = "69";
    transaction.totalCreditMinor = "69";
    const allocationInput = structuredClone(fixture.allocation) as Record<string, unknown>;
    const components = allocationInput.platformCommissionComponents as Record<string, unknown>[];
    components[0]!.sourceEntryDigest = hashFinanceCommandPayload(entries[0]);
    const allocation = readRefundPostingAllocationAuthority(
      withAllocationDigest(allocationInput),
      refundPostingDecoderEnvelope
    );

    expectReason(
      () =>
        readAndAssertRefundOriginalPlatformJournals(
          journals,
          allocation,
          terminal.confirmedAt,
          refundPostingDecoderEnvelope
        ),
      "proof_transaction_mismatch"
    );
  });

  it("rejects a hostile journal array before invoking its traps", () => {
    const fixture = buildStandardRefundOperationFixture("refund_confirmed");
    const terminal = fixture.terminalAuthority;
    if (terminal?.kind !== "refund_confirmed") {
      throw new Error("missing confirmed authority fixture");
    }
    let traps = 0;
    const journals = new Proxy(fixture.originalPlatformJournals, {
      getPrototypeOf() {
        traps += 1;
        throw new Error("must not execute");
      },
      ownKeys() {
        traps += 1;
        throw new Error("must not execute");
      }
    });
    expectReason(
      () =>
        readAndAssertRefundOriginalPlatformJournals(
          journals,
          fixture.allocation,
          terminal.confirmedAt,
          refundPostingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(traps).toBe(0);
  });
});

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("expected test record");
  return value as Record<string, unknown>;
}

function money(amountMinor: number) {
  return { amountMinor, currency: "RUB" as const };
}

function expectReason(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected finance posting error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}
