import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingUnsignedDecimal,
  readFinancePostingVersion
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type { ChargebackRecoveryTranche } from "./chargeback-recovery-posting-types";

export function readChargebackRecoveryTranche(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): ChargebackRecoveryTranche {
  const fields = readExactDataRecord(input, [
    "exposureId",
    "allocationAuthorityId",
    "allocationAuthorityVersion",
    "accountingAllocationRevisionId",
    "positionTransitionBindingId",
    "positionTransitionVersion",
    "originalJournalEntry",
    "amount"
  ]);
  const journal = readExactDataRecord(fields.originalJournalEntry, [
    "transactionId",
    "entryIndex",
    "canonicalDigest"
  ]);
  if (
    !Number.isSafeInteger(journal.entryIndex) ||
    (journal.entryIndex as number) < 0 ||
    (journal.entryIndex as number) >= envelope.maxJournalEntries
  ) {
    throw new FinancePostingIntegrityError("decoder_envelope_exceeded");
  }
  return Object.freeze({
    exposureId: readFinancePostingIdentifier(fields.exposureId),
    allocationAuthorityId: readFinancePostingIdentifier(fields.allocationAuthorityId),
    allocationAuthorityVersion: readFinancePostingVersion(fields.allocationAuthorityVersion),
    accountingAllocationRevisionId: readFinancePostingIdentifier(
      fields.accountingAllocationRevisionId
    ),
    positionTransitionBindingId: readFinancePostingIdentifier(fields.positionTransitionBindingId),
    positionTransitionVersion: readFinancePostingUnsignedDecimal(
      fields.positionTransitionVersion,
      envelope.maxDecimalDigits
    ),
    originalJournalEntry: Object.freeze({
      transactionId: readFinancePostingIdentifier(journal.transactionId),
      entryIndex: journal.entryIndex as number,
      canonicalDigest: readFinancePostingDigest(journal.canonicalDigest)
    }),
    amount: readChargebackUnsignedMoney(fields.amount)
  });
}
