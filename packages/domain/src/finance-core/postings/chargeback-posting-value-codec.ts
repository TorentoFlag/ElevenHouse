import type { Money } from "../../money";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";

export function readChargebackUnsignedMoney(input: unknown): Money {
  const fields = readExactDataRecord(input, ["amountMinor", "currency"]);
  if (
    fields.currency !== "RUB" ||
    !Number.isSafeInteger(fields.amountMinor) ||
    (fields.amountMinor as number) < 0
  ) {
    throw new FinancePostingIntegrityError("invalid_money");
  }
  return Object.freeze({ amountMinor: fields.amountMinor as number, currency: "RUB" });
}
