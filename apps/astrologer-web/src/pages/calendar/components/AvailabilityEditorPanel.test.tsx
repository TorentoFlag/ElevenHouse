import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { isAvailabilityVersionConflict } from "./AvailabilityEditorPanel";

describe("availability editor conflict mapping", () => {
  it("recognizes only optimistic-version conflicts", () => {
    expect(
      isAvailabilityVersionConflict(
        new HttpError(409, { code: "availability_version_conflict", currentVersion: 4 })
      )
    ).toBe(true);
    expect(isAvailabilityVersionConflict(new HttpError(409, { code: "slot_no_longer_available" }))).toBe(false);
    expect(isAvailabilityVersionConflict(new HttpError(500, null))).toBe(false);
  });
});
