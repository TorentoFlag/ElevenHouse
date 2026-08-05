import { expectTypeOf, it } from "vitest";

import type {
  SealedJournalMutationCommand,
  VerifiedFinanceJournalCommitReceipt,
  VerifiedFinanceJournalCommitReceiptRef
} from "./journal-commit-port";

it("keeps a journal-only mutation explicit and persistence receipt nominal", () => {
  expectTypeOf<keyof SealedJournalMutationCommand>().toEqualTypeOf<
    "operationId" | "postingRecipe" | "journalLinkProof" | "operationEnvelope"
  >();
  expectTypeOf<
    VerifiedFinanceJournalCommitReceipt["ref"]
  >().toEqualTypeOf<VerifiedFinanceJournalCommitReceiptRef>();
  expectTypeOf<
    VerifiedFinanceJournalCommitReceipt["kind"]
  >().toEqualTypeOf<"verified_finance_journal_commit_receipt">();
});
