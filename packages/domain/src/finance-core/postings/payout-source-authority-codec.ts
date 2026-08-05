import {
  createPayoutNoTransferOutcomeAuthority,
  createPayoutPaidAuthority,
  createPayoutReturnAuthority,
  type PayoutNoTransferOutcomeAuthority,
  type PayoutPaidAuthority,
  type PayoutReturnAuthority
} from "../source-lots";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";

export function readPayoutNoTransferAuthority(input: unknown): PayoutNoTransferOutcomeAuthority {
  return safelyCreate(
    input,
    [
      "kind",
      "authorityId",
      "version",
      "payoutRequestId",
      "outcome",
      "bankInitiation",
      "bankDebit",
      "evidenceId",
      "decidedAt"
    ],
    createPayoutNoTransferOutcomeAuthority
  );
}

export function readPayoutPaidSourceAuthority(input: unknown): PayoutPaidAuthority {
  return safelyCreate(
    input,
    [
      "kind",
      "authorityId",
      "version",
      "payoutRequestId",
      "bankReference",
      "transferredAt",
      "evidenceRef",
      "evidenceHash"
    ],
    createPayoutPaidAuthority
  );
}

export function readPayoutReturnSourceAuthority(input: unknown): PayoutReturnAuthority {
  return safelyCreate(
    input,
    [
      "kind",
      "authorityId",
      "version",
      "payoutRequestId",
      "outcome",
      "bankReference",
      "bankStatementEntryId",
      "bankCreditEvidencePath",
      "suspenseReclassificationId",
      "returnedAt",
      "evidenceId"
    ],
    createPayoutReturnAuthority
  );
}

function safelyCreate<T>(
  input: unknown,
  keys: readonly string[],
  create: (value: unknown) => T
): T {
  const fields = readExactDataRecord(input, keys);
  try {
    return create(fields);
  } catch {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
}
