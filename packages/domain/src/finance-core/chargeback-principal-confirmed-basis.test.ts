import { describe, expect, it } from "vitest";
import {
  ChargebackPrincipalConfirmedBasisIntegrityError,
  readChargebackPrincipalConfirmedBasis,
  type ChargebackPrincipalConfirmedBasis
} from "./chargeback-principal-confirmed-basis";

const digest = `sha256:${"a".repeat(64)}` as const;

describe("chargeback principal confirmed basis leaf codec", () => {
  it("decodes one strict immutable shape with full provider identity and typed digest", () => {
    const basis = readChargebackPrincipalConfirmedBasis(validBasis());
    const typed: ChargebackPrincipalConfirmedBasis = basis;

    expect(typed.providerAccount).toEqual({
      seriesId: "arc-series-live",
      providerAccountId: "arc-account-live",
      identityVersion: 3
    });
    expect(typed.confirmationAuthorityDigest).toBe(digest);
    expect(Object.isFrozen(typed)).toBe(true);
    expect(Object.isFrozen(typed.providerAccount)).toBe(true);
  });

  it.each([
    ["missing series", { providerAccountId: "arc-account-live", identityVersion: 3 }],
    [
      "unknown identity field",
      {
        seriesId: "arc-series-live",
        providerAccountId: "arc-account-live",
        identityVersion: 3,
        environment: "live"
      }
    ],
    [
      "invalid identity version",
      {
        seriesId: "arc-series-live",
        providerAccountId: "arc-account-live",
        identityVersion: 0
      }
    ]
  ])("rejects %s", (_label, providerAccount) => {
    expect(() =>
      readChargebackPrincipalConfirmedBasis({ ...validBasis(), providerAccount })
    ).toThrow(ChargebackPrincipalConfirmedBasisIntegrityError);
  });

  it("rejects an untyped or malformed authority digest", () => {
    expect(() =>
      readChargebackPrincipalConfirmedBasis({
        ...validBasis(),
        confirmationAuthorityDigest: "digest-without-sha256-prefix"
      })
    ).toThrow(ChargebackPrincipalConfirmedBasisIntegrityError);
  });

  it("rejects a Proxy before executing reflective traps", () => {
    let trapCalls = 0;
    const input = new Proxy(validBasis(), {
      ownKeys(target) {
        trapCalls += 1;
        return Reflect.ownKeys(target);
      }
    });

    expect(() => readChargebackPrincipalConfirmedBasis(input)).toThrow(
      ChargebackPrincipalConfirmedBasisIntegrityError
    );
    expect(trapCalls).toBe(0);
  });
});

function validBasis() {
  return {
    restrictionId: "chargeback-restriction-1",
    restrictionVersion: 2,
    confirmationAuthorityId: "chargeback-confirmed-authority-2",
    confirmationAuthorityVersion: 2,
    confirmationId: "chargeback-confirmation-2",
    confirmationAuthorityDigest: digest,
    canonicalEvidenceId: "chargeback-evidence-2",
    providerAccount: {
      seriesId: "arc-series-live",
      providerAccountId: "arc-account-live",
      identityVersion: 3
    },
    providerPaymentId: "provider-payment-1",
    cumulativeDisputedAmount: { amountMinor: 6_000, currency: "RUB" },
    confirmedAt: "2026-08-05T00:00:00Z"
  };
}
