import {
  addWalletBalanceDiscrepancies,
  projectWalletJournalBalances
} from "./wallet-reference-balances";
import { invalidWalletProjection, WalletProjectionIntegrityError } from "./wallet-reference-errors";
import { hydrateWalletReferenceInput } from "./wallet-reference-hydration";
import { addSourceLotJournalEdgeDiscrepancies } from "./wallet-reference-journal-edges";
import {
  addDuplicateJournalDiscrepancies,
  addJournalReversalDiscrepancies
} from "./wallet-reference-journal-integrity";
import { addJournalScopeAndRecoveryDiscrepancies } from "./wallet-reference-journal-scope";
import { addSourceLotReceiptDiscrepancies } from "./wallet-reference-receipt-consistency";
import type {
  AstrologerWalletProjection,
  WalletProjectionDiscrepancy
} from "./wallet-reference-types";

export { WalletProjectionIntegrityError } from "./wallet-reference-errors";
export type {
  AstrologerWalletProjection,
  StoredWalletSnapshot,
  WalletBalanceProjection,
  WalletProjectionDiscrepancy
} from "./wallet-reference-types";

/**
 * Full-history reconciliation/reference oracle. It intentionally accepts an
 * astrologer's complete journal and source-lot history and must never run in a
 * request-path wallet mutation; the bounded online comparator lives in
 * `wallet-operation-projection.ts`.
 *
 * `integrityStatus="unverified"` is permanent here: matching self-hashed
 * receipts, journal rows and a stored read model detects drift but does not
 * prove authority or one-transaction persistence.
 */
export function rebuildAstrologerWalletProjection(
  input: unknown,
  receiptDecoderEnvelopeInput: unknown
): AstrologerWalletProjection {
  try {
    const hydrated = hydrateWalletReferenceInput(input, receiptDecoderEnvelopeInput);
    const discrepancies: WalletProjectionDiscrepancy[] = [];

    addSourceLotReceiptDiscrepancies(
      hydrated.sourceLotState,
      hydrated.sourceOperationReceipts,
      discrepancies
    );
    addDuplicateJournalDiscrepancies(hydrated.journalTransactions, discrepancies);
    addJournalReversalDiscrepancies(hydrated.journalTransactions, discrepancies);
    addJournalScopeAndRecoveryDiscrepancies(
      hydrated.journalTransactions,
      hydrated.astrologerUserId,
      discrepancies
    );
    addSourceLotJournalEdgeDiscrepancies(
      hydrated.journalTransactions,
      hydrated.sourceOperationReceipts,
      hydrated.astrologerUserId,
      discrepancies
    );
    const journalBalances = projectWalletJournalBalances(
      hydrated.astrologerUserId,
      hydrated.journalTransactions,
      discrepancies
    );
    addWalletBalanceDiscrepancies(
      journalBalances,
      hydrated.lotBalances,
      hydrated.storedWallet,
      discrepancies
    );

    return Object.freeze({
      status: discrepancies.length === 0 ? "consistent" : "discrepant",
      integrityStatus: "unverified",
      sourceReceiptCoverage: "payable_lot_history_only",
      astrologerUserId: hydrated.astrologerUserId,
      currency: "RUB",
      journalBalances,
      lotBalances: hydrated.lotBalances,
      storedBalances: hydrated.storedWallet.balances,
      discrepancies: Object.freeze(discrepancies)
    });
  } catch (error) {
    if (error instanceof WalletProjectionIntegrityError) throw error;
    return invalidWalletProjection();
  }
}
