import { describe, expect, it } from "vitest";
import { rehydrateFinanceJournalLinkProof } from "./journal-link-proof";
import { assertFinanceJournalLinkProofMatchesOperationReceipt } from "./payable-lot-posting-link";
import { FinancePostingIntegrityError } from "./posting-codec";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import * as postingIntegrityFacade from "./posting-integrity";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import { createUnverifiedFinanceNoPostingRecipe } from "./posting-recipe";
import { normalizeFinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { readFinanceNoPostingEventKey } from "./finance-no-posting-event-key";

describe("posting-integrity compatibility facade", () => {
  it("preserves the established common posting imports", () => {
    expect(postingIntegrityFacade.FinancePostingIntegrityError).toBe(FinancePostingIntegrityError);
    expect(postingIntegrityFacade.readFinanceJournalPostingContext).toBe(
      readFinanceJournalPostingContext
    );
    expect(postingIntegrityFacade.createUnverifiedFinanceJournalPostingRecipe).toBe(
      createUnverifiedFinanceJournalPostingRecipe
    );
    expect(postingIntegrityFacade.createUnverifiedFinanceNoPostingRecipe).toBe(
      createUnverifiedFinanceNoPostingRecipe
    );
    expect(postingIntegrityFacade.normalizeFinancePostingDecoderEnvelope).toBe(
      normalizeFinancePostingDecoderEnvelope
    );
    expect(postingIntegrityFacade.readFinanceNoPostingEventKey).toBe(readFinanceNoPostingEventKey);
    expect(postingIntegrityFacade.rehydrateFinanceJournalLinkProof).toBe(
      rehydrateFinanceJournalLinkProof
    );
    expect(postingIntegrityFacade.assertFinanceJournalLinkProofMatchesOperationReceipt).toBe(
      assertFinanceJournalLinkProofMatchesOperationReceipt
    );
  });
});
