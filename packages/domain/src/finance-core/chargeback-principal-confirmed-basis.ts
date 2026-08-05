import type { FinanceAuthorizationPayloadHash } from "../finance-authorization/canonical-command-payload";
import type { Money } from "../money";
import {
  createProviderAccountIdentityBinding,
  type ProviderAccountIdentityBinding
} from "./provider-account-binding";
import {
  exactDataRecord,
  identifier,
  instant,
  money,
  positiveVersion
} from "./source-lot-validation";

export type ChargebackPrincipalConfirmedBasis = Readonly<{
  restrictionId: string;
  restrictionVersion: number;
  confirmationAuthorityId: string;
  confirmationAuthorityVersion: number;
  confirmationId: string;
  confirmationAuthorityDigest: FinanceAuthorizationPayloadHash;
  canonicalEvidenceId: string;
  providerAccount: ProviderAccountIdentityBinding;
  providerPaymentId: string;
  cumulativeDisputedAmount: Money;
  confirmedAt: string;
}>;

export class ChargebackPrincipalConfirmedBasisIntegrityError extends Error {
  readonly code = "chargeback_principal_confirmed_basis_integrity_violation";

  constructor() {
    super("Chargeback principal confirmed basis is invalid");
    this.name = "ChargebackPrincipalConfirmedBasisIntegrityError";
  }
}

const basisKeys = [
  "restrictionId",
  "restrictionVersion",
  "confirmationAuthorityId",
  "confirmationAuthorityVersion",
  "confirmationId",
  "confirmationAuthorityDigest",
  "canonicalEvidenceId",
  "providerAccount",
  "providerPaymentId",
  "cumulativeDisputedAmount",
  "confirmedAt"
] as const;

/** One strict codec shared by source-lot and posting projections. */
export function readChargebackPrincipalConfirmedBasis(
  input: unknown
): ChargebackPrincipalConfirmedBasis {
  try {
    const fields = exactDataRecord(input, basisKeys);
    return Object.freeze({
      restrictionId: identifier(fields.restrictionId),
      restrictionVersion: positiveVersion(fields.restrictionVersion, "invalid_field"),
      confirmationAuthorityId: identifier(fields.confirmationAuthorityId),
      confirmationAuthorityVersion: positiveVersion(
        fields.confirmationAuthorityVersion,
        "invalid_field"
      ),
      confirmationId: identifier(fields.confirmationId),
      confirmationAuthorityDigest: authorizationPayloadHash(fields.confirmationAuthorityDigest),
      canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
      providerAccount: createProviderAccountIdentityBinding(fields.providerAccount),
      providerPaymentId: identifier(fields.providerPaymentId),
      cumulativeDisputedAmount: money(fields.cumulativeDisputedAmount, true, "invalid_field"),
      confirmedAt: instant(fields.confirmedAt)
    });
  } catch (error) {
    if (error instanceof ChargebackPrincipalConfirmedBasisIntegrityError) throw error;
    throw new ChargebackPrincipalConfirmedBasisIntegrityError();
  }
}

function authorizationPayloadHash(value: unknown): FinanceAuthorizationPayloadHash {
  if (!isAuthorizationPayloadHash(value)) {
    throw new ChargebackPrincipalConfirmedBasisIntegrityError();
  }
  return value;
}

function isAuthorizationPayloadHash(value: unknown): value is FinanceAuthorizationPayloadHash {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
