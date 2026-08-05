import {
  assertPayableLotReferenceStateIntegrity,
  chargebackRestrictionArray,
  chargebackRestrictionHistoryArray,
  freezePayableLotReferenceState,
  lotArray,
  payableLotHistoryArray,
  payableLotStateKeys,
  rubCurrency
} from "./source-lot-integrity";
import { type PayableLotReferenceState } from "./source-lot-types";
import { exactDataRecord, fail, identifier, positiveVersion } from "./source-lot-validation";
export function createEmptyPayableLotReferenceState(input: unknown): PayableLotReferenceState {
  const fields = exactDataRecord(input, ["astrologerUserId", "currency"]);
  if (fields.currency !== "RUB") fail("owner_currency_mismatch");
  return freezePayableLotReferenceState({
    version: 1,
    astrologerUserId: identifier(fields.astrologerUserId),
    currency: "RUB",
    lots: [],
    history: [],
    chargebackRestrictions: [],
    restrictionHistory: []
  });
}

export function rebuildPayableLotReferenceState(input: unknown): PayableLotReferenceState {
  const fields = exactDataRecord(input, payableLotStateKeys);
  const state = freezePayableLotReferenceState({
    version: positiveVersion(fields.version, "invalid_field"),
    astrologerUserId: identifier(fields.astrologerUserId),
    currency: rubCurrency(fields.currency),
    lots: lotArray(fields.lots),
    history: payableLotHistoryArray(fields.history),
    chargebackRestrictions: chargebackRestrictionArray(fields.chargebackRestrictions),
    restrictionHistory: chargebackRestrictionHistoryArray(fields.restrictionHistory)
  });
  assertPayableLotReferenceStateIntegrity(state);
  if (fields.stateDigest !== state.stateDigest) fail("state_digest_mismatch");
  return state;
}

/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export const createEmptyPayableLotState = createEmptyPayableLotReferenceState;
/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export const createPayableLotState = rebuildPayableLotReferenceState;
