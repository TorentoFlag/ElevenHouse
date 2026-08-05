import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { chargebackRestrictionHistoryArray } from "../source-lot-codec-history";
import { rebuildPayableLotReferenceState } from "../source-lot-reference";
import type { ChargebackLostAuthority } from "../source-lot-types";
import type { ChargebackLostClosureTransitionRef } from "./chargeback-lost-closure-types";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion,
  sameCanonicalFinancePostingValue
} from "./posting-codec";

export function readChargebackLostClosureTransition(input: unknown): Readonly<{
  ref: ChargebackLostClosureTransitionRef;
  sourceAuthority: ChargebackLostAuthority;
}> {
  const fields = readExactDataRecord(input, [
    "kind",
    "operationId",
    "operationKey",
    "previousVersion",
    "nextVersion",
    "previousStateDigest",
    "nextStateDigest",
    "record",
    "state"
  ]);
  const operation = readOperationKey(fields.operationKey);
  let record: ReturnType<typeof chargebackRestrictionHistoryArray>[number] | undefined;
  let state: ReturnType<typeof rebuildPayableLotReferenceState>;
  try {
    record = chargebackRestrictionHistoryArray([fields.record])[0];
    state = rebuildPayableLotReferenceState(fields.state);
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    mismatch("authority_mismatch");
  }
  const operationId = readFinancePostingIdentifier(fields.operationId);
  const previousVersion = readFinancePostingVersion(fields.previousVersion);
  const nextVersion = readFinancePostingVersion(fields.nextVersion);
  const previousStateDigest = readFinancePostingDigest(fields.previousStateDigest);
  const nextStateDigest = readFinancePostingDigest(fields.nextStateDigest);
  if (
    fields.kind !== "chargeback_lost_allocation_closed" ||
    !record ||
    record.kind !== "chargeback_lost_allocation_closed" ||
    operation.operation !== "lost_allocation_closed" ||
    operationId !== record.operationId ||
    !sameCanonicalFinancePostingValue(operation, record.operationKey) ||
    previousVersion !== record.previousVersion ||
    nextVersion !== record.nextVersion ||
    nextVersion !== previousVersion + 1 ||
    record.occurredAt !== record.authority.lostAt ||
    record.authority.unallocatedSuspense.amountMinor !== 0 ||
    state.version !== nextVersion ||
    state.stateDigest !== nextStateDigest ||
    !sameCanonicalFinancePostingValue(state.restrictionHistory.at(-1), record)
  ) {
    mismatch("authority_mismatch");
  }
  const restriction = state.chargebackRestrictions.find(
    (row) => row.restrictionId === operation.restrictionId
  );
  if (
    !restriction ||
    restriction.status !== "closed_lost" ||
    restriction.chargebackCaseId !== record.authority.chargebackCaseId ||
    restriction.closedAt !== record.occurredAt
  ) {
    mismatch("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "chargeback_lost_allocation_closure_transition" as const,
    operationId,
    restrictionId: operation.restrictionId,
    previousVersion,
    nextVersion,
    previousStateDigest,
    nextStateDigest,
    sourceAuthorityDigest: hashFinanceCommandPayload(record.authority),
    occurredAt: record.occurredAt
  });
  return Object.freeze({
    ref: Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) }),
    sourceAuthority: record.authority
  });
}

function readOperationKey(input: unknown) {
  const fields = readExactDataRecord(input, ["kind", "restrictionId", "operation"]);
  if (
    fields.kind !== "chargeback_restriction" ||
    (fields.operation !== "lost_final" && fields.operation !== "lost_allocation_closed")
  ) {
    mismatch("authority_mismatch");
  }
  return Object.freeze({
    kind: "chargeback_restriction" as const,
    restrictionId: readFinancePostingIdentifier(fields.restrictionId),
    operation: fields.operation
  });
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
