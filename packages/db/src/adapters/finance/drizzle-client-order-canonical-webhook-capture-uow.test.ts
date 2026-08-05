import type { ClientOrderCanonicalCaptureMutationResolver } from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  resolveClientOrderCanonicalCaptureMutationInTransaction,
  type TransactionalClientOrderCanonicalCaptureMutationResolver
} from "./drizzle-client-order-canonical-webhook-capture-uow";

describe("canonical client-order webhook capture mutation resolution", () => {
  it("passes the caller-owned transaction to the database mutation resolver", async () => {
    const transaction = { marker: "caller-transaction" } as unknown as FinanceTransaction;
    const mutation = { kind: "journal_only", command: {} } as never;
    let receivedTransaction: FinanceTransaction | null = null;
    const resolver: TransactionalClientOrderCanonicalCaptureMutationResolver = {
      async resolveClientOrderCanonicalCaptureMutation(received, input) {
        receivedTransaction = received;
        expect(input).toEqual({ semanticCapture: { receiptId: "semantic-1" }, capture: {} });
        return mutation;
      }
    };

    await expect(
      resolveClientOrderCanonicalCaptureMutationInTransaction(resolver, transaction, {
        semanticCapture: { receiptId: "semantic-1" },
        capture: {}
      } as Parameters<
        ClientOrderCanonicalCaptureMutationResolver["resolveClientOrderCanonicalCaptureMutation"]
      >[0])
    ).resolves.toBe(mutation);
    expect(receivedTransaction).toBe(transaction);
  });
});
