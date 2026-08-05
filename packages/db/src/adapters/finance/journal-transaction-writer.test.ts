import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  issueJournalPersistenceAuthority,
  JournalTransactionWriterIntegrityError,
  mapDatabaseIssuedJournalCommitReceipt
} from "./journal-transaction-writer";

describe("journal transaction DB authority", () => {
  it("maps a DB-issued exact row to the nominal journal commit receipt", () => {
    const receipt = mapDatabaseIssuedJournalCommitReceipt(validRow());

    expect(receipt).toEqual({
      ref: {
        kind: "verified_finance_journal_commit_receipt",
        receiptId: "11111111-1111-4111-8111-111111111111",
        version: 1,
        canonicalDigest: sha("a")
      },
      kind: "verified_finance_journal_commit_receipt",
      journalTransactionId: "journal-1",
      journalTransactionDigest: sha("b"),
      journalLinkProofId: "proof-1",
      journalLinkProofVersion: 1,
      journalLinkProofDigest: sha("c"),
      persistenceTransactionBoundaryRef: "postgres-xid:8192",
      issuedAt: "2026-08-03T10:00:00.000Z"
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.ref)).toBe(true);
  });

  it.each([
    ["receiptId", "caller-id"],
    ["receiptVersion", 2],
    ["canonicalDigest", sha("A")],
    ["journalTransactionDigest", "sha256:short"],
    ["journalLinkProofVersion", 0],
    ["persistenceTransactionBoundaryRef", "caller-boundary"],
    ["issuedAt", new Date("invalid")]
  ] as const)("rejects a forged DB receipt %s", (field, value) => {
    expect(() => mapDatabaseIssuedJournalCommitReceipt({ ...validRow(), [field]: value })).toThrow(
      JournalTransactionWriterIntegrityError
    );
  });

  it("issues UUID and transaction boundary together from PostgreSQL", async () => {
    const executed: SQL[] = [];
    const transaction = {
      async execute(query: SQL) {
        executed.push(query);
        return {
          rows: [
            {
              receiptId: "11111111-1111-4111-8111-111111111111",
              persistenceTransactionBoundaryRef: "postgres-xid:8192"
            }
          ]
        };
      }
    } as unknown as FinanceTransaction;

    await expect(issueJournalPersistenceAuthority(transaction)).resolves.toEqual({
      receiptId: "11111111-1111-4111-8111-111111111111",
      persistenceTransactionBoundaryRef: "postgres-xid:8192"
    });
    const query = new PgDialect().sqlToQuery(executed[0] ?? sql`select 0`);
    expect(query.sql).toContain("gen_random_uuid()::text");
    expect(query.sql).toContain("txid_current()::text");
  });
});

function validRow() {
  return {
    receiptId: "11111111-1111-4111-8111-111111111111",
    receiptVersion: 1,
    canonicalDigest: sha("a"),
    journalTransactionId: "journal-1",
    journalTransactionDigest: sha("b"),
    journalLinkProofId: "proof-1",
    journalLinkProofVersion: 1,
    journalLinkProofDigest: sha("c"),
    persistenceTransactionBoundaryRef: "postgres-xid:8192",
    issuedAt: new Date("2026-08-03T10:00:00.000Z")
  };
}

function sha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
