import type { Money } from "../../money";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion
} from "./posting-codec";
import type { RefundPostingAuthorityRef } from "./refund-posting-types";

export function readRefundPostingAuthorityRef<const Kind extends string>(
  input: unknown,
  expectedKinds: readonly Kind[]
): RefundPostingAuthorityRef<Kind> {
  const fields = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  if (typeof fields.kind !== "string" || !expectedKinds.includes(fields.kind as Kind)) {
    fail("authority_mismatch");
  }
  return Object.freeze({
    kind: fields.kind as Kind,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readRefundPostingMoney(input: unknown, positive: boolean): Money {
  const fields = readExactDataRecord(input, ["amountMinor", "currency"]);
  if (
    fields.currency !== "RUB" ||
    !Number.isSafeInteger(fields.amountMinor) ||
    (fields.amountMinor as number) < (positive ? 1 : 0)
  ) {
    fail("invalid_money");
  }
  return Object.freeze({ amountMinor: fields.amountMinor as number, currency: "RUB" });
}

export function readRefundProviderAccount(input: unknown) {
  const fields = readExactDataRecord(input, [
    "providerAccountId",
    "identityVersion",
    "provider",
    "merchantTenantId",
    "terminalScope",
    "settlementScope"
  ]);
  if (fields.provider !== "arc_pay") {
    fail("scope_mismatch");
  }
  return Object.freeze({
    providerAccountId: readFinancePostingIdentifier(fields.providerAccountId),
    identityVersion: readFinancePostingVersion(fields.identityVersion),
    provider: "arc_pay" as const,
    merchantTenantId: readFinancePostingIdentifier(fields.merchantTenantId),
    terminalScope: readFinancePostingIdentifier(fields.terminalScope),
    settlementScope: readFinancePostingIdentifier(fields.settlementScope)
  });
}

export function readOrderEconomics(input: unknown) {
  const fields = readExactDataRecord(input, [
    "orderId",
    "astrologerUserId",
    "planId",
    "planVersionId",
    "gross",
    "commission",
    "payable",
    "commissionBps",
    "allocationRevision"
  ]);
  if (
    !Number.isSafeInteger(fields.commissionBps) ||
    (fields.commissionBps as number) < 0 ||
    (fields.commissionBps as number) > 10_000 ||
    fields.allocationRevision !== "bps_half_up_v1"
  ) {
    fail("authority_mismatch");
  }
  return Object.freeze({
    orderId: readFinancePostingIdentifier(fields.orderId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    planId: readFinancePostingIdentifier(fields.planId),
    planVersionId: readFinancePostingIdentifier(fields.planVersionId),
    gross: readRefundPostingMoney(fields.gross, false),
    commission: readRefundPostingMoney(fields.commission, false),
    payable: readRefundPostingMoney(fields.payable, false),
    commissionBps: fields.commissionBps as number,
    allocationRevision: "bps_half_up_v1" as const
  });
}

function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
