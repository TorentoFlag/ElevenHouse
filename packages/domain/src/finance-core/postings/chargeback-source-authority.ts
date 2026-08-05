import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { readChargebackPrincipalConfirmedBasis } from "../chargeback-principal-confirmed-basis";
import {
  createChargebackConfirmedAuthority,
  createChargebackPrincipalAllocationAuthority
} from "../source-lot-codec-authority";
import type {
  ChargebackConfirmedAuthority,
  ChargebackLostAuthority,
  ChargebackPrincipalAllocationAuthority,
  ChargebackRecoveryCollectionAuthority,
  ChargebackWonAuthority
} from "../source-lot-types";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingVersion,
  readOwnDataDiscriminator
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import {
  readChargebackLostSourceAuthority,
  readChargebackRecoverySourceAuthority,
  readChargebackWonSourceAuthority
} from "./chargeback-source-resolution-authority";

export { FinancePostingIntegrityError } from "./posting-codec";

export type ChargebackSourceAuthority =
  | ChargebackConfirmedAuthority
  | ChargebackPrincipalAllocationAuthority
  | ChargebackRecoveryCollectionAuthority
  | ChargebackWonAuthority
  | ChargebackLostAuthority;

export type DecodedChargebackSourceAuthority = Readonly<{
  authority: ChargebackSourceAuthority;
  canonicalDigest: ReturnType<typeof hashFinanceCommandPayload>;
}>;

const chargebackAuthorityKinds = [
  "chargeback_confirmed",
  "chargeback_principal_allocation",
  "chargeback_recovery_collection",
  "chargeback_won",
  "chargeback_lost"
] as const;

export function readChargebackSourceAuthority(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): DecodedChargebackSourceAuthority;
export function readChargebackSourceAuthority(
  input: unknown,
  decoderEnvelopeInput: unknown
): DecodedChargebackSourceAuthority {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const kind = readOwnDataDiscriminator(input, "kind", chargebackAuthorityKinds);
  try {
    const authority = readAuthorityByKind(input, kind);
    return Object.freeze({ authority, canonicalDigest: hashFinanceCommandPayload(authority) });
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
}

function readAuthorityByKind(
  input: unknown,
  kind: (typeof chargebackAuthorityKinds)[number]
): ChargebackSourceAuthority {
  switch (kind) {
    case "chargeback_confirmed":
      return readConfirmed(input);
    case "chargeback_principal_allocation":
      return readPrincipalAllocation(input);
    case "chargeback_recovery_collection":
      return readChargebackRecoverySourceAuthority(input);
    case "chargeback_won":
      return readChargebackWonSourceAuthority(input);
    case "chargeback_lost":
      return readChargebackLostSourceAuthority(input);
  }
}

function readConfirmed(input: unknown): ChargebackConfirmedAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "confirmationId",
    "restrictionId",
    "confirmationKind",
    "amountBasis",
    "priorRestrictionVersion",
    "chargebackCaseId",
    "orderId",
    "astrologerUserId",
    "providerAccount",
    "providerPaymentId",
    "priorCumulativeDisputedAmount",
    "nextCumulativeDisputedAmount",
    "disputedDelta",
    "canonicalEvidenceId",
    "confirmedAt"
  ]);
  return createChargebackConfirmedAuthority({
    kind: "chargeback_confirmed",
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    confirmationId: readFinancePostingIdentifier(fields.confirmationId),
    restrictionId: readFinancePostingIdentifier(fields.restrictionId),
    confirmationKind: fields.confirmationKind,
    amountBasis: fields.amountBasis,
    priorRestrictionVersion:
      fields.priorRestrictionVersion === null
        ? null
        : readFinancePostingVersion(fields.priorRestrictionVersion),
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    orderId: readFinancePostingIdentifier(fields.orderId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    providerAccount: fields.providerAccount,
    providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId),
    priorCumulativeDisputedAmount: readChargebackUnsignedMoney(
      fields.priorCumulativeDisputedAmount
    ),
    nextCumulativeDisputedAmount: readChargebackUnsignedMoney(fields.nextCumulativeDisputedAmount),
    disputedDelta: readChargebackUnsignedMoney(fields.disputedDelta),
    canonicalEvidenceId: readFinancePostingIdentifier(fields.canonicalEvidenceId),
    confirmedAt: readFinancePostingInstant(fields.confirmedAt)
  });
}

function readPrincipalAllocation(input: unknown): ChargebackPrincipalAllocationAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "chargebackCaseId",
    "orderId",
    "astrologerUserId",
    "payableAmount",
    "accountingAllocationId",
    "accountingAllocationRevisionId",
    "accountingAllocationVersion",
    "allocationStatus",
    "confirmedBasis"
  ]);
  return createChargebackPrincipalAllocationAuthority({
    kind: "chargeback_principal_allocation",
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    orderId: readFinancePostingIdentifier(fields.orderId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    payableAmount: readChargebackUnsignedMoney(fields.payableAmount),
    accountingAllocationId: readFinancePostingIdentifier(fields.accountingAllocationId),
    accountingAllocationRevisionId: readFinancePostingIdentifier(
      fields.accountingAllocationRevisionId
    ),
    accountingAllocationVersion: readFinancePostingVersion(fields.accountingAllocationVersion),
    allocationStatus: fields.allocationStatus,
    confirmedBasis: readChargebackPrincipalConfirmedBasis(fields.confirmedBasis)
  });
}
