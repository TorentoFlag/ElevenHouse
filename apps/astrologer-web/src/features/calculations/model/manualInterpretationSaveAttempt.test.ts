import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import {
  getManualInterpretationSaveAttempt,
  shouldRetainManualInterpretationSaveAttempt
} from "./manualInterpretationSaveAttempt";

const firstKey = "11111111-1111-4111-8111-111111111111";
const secondKey = "22222222-2222-4222-8222-222222222222";

describe("manual interpretation save attempt", () => {
  it("reuses only an exact calculation/checksum/text identity", () => {
    const first = getManualInterpretationSaveAttempt(null, {
      calculationId: "calculation-a",
      resultChecksum: "checksum-a",
      text: "Canonical text",
      createId: () => firstKey
    });

    expect(
      getManualInterpretationSaveAttempt(first, {
        calculationId: "calculation-a",
        resultChecksum: "checksum-a",
        text: "Canonical text",
        createId: () => secondKey
      })
    ).toBe(first);
    for (const changed of [
      { calculationId: "calculation-b", resultChecksum: "checksum-a", text: "Canonical text" },
      { calculationId: "calculation-a", resultChecksum: "checksum-b", text: "Canonical text" },
      { calculationId: "calculation-a", resultChecksum: "checksum-a", text: "Changed text" }
    ]) {
      expect(
        getManualInterpretationSaveAttempt(first, { ...changed, createId: () => secondKey })
          .idempotencyKey
      ).toBe(secondKey);
    }
  });

  it.each([
    [new Error("transport"), true],
    [new HttpError(500, null), true],
    [new HttpError(503, null), true],
    [new HttpError(409, { code: "CALCULATION_INTERPRETATION_SAVE_IN_PROGRESS" }), true],
    [new HttpError(503, { code: "CALCULATION_INTERPRETATION_SAVE_OUTCOME_UNKNOWN" }), true],
    [new HttpError(409, { code: "CALCULATION_INTERPRETATION_IDEMPOTENCY_CONFLICT" }), false],
    [new HttpError(409, null), false],
    [new HttpError(400, null), false]
  ])("classifies retry authority for %o", (error, expected) => {
    expect(shouldRetainManualInterpretationSaveAttempt(error)).toBe(expected);
  });
});
