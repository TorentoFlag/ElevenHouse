import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { toAstroDiaryActionError } from "./astroDiaryErrorModel";

describe("toAstroDiaryActionError", () => {
  it("maps typed server conflicts without exposing operational response text", () => {
    expect(toAstroDiaryActionError(new HttpError(409, { code: "stale_version" }))).toBe("stale");
    expect(toAstroDiaryActionError(new HttpError(409, { code: "idempotency_conflict" }))).toBe(
      "idempotency"
    );
    expect(toAstroDiaryActionError(new HttpError(409, { code: "allowance_exhausted" }))).toBe(
      "allowance"
    );
    expect(toAstroDiaryActionError(new HttpError(403, { code: "paid_access_ended" }))).toBe(
      "read_only"
    );
    expect(
      toAstroDiaryActionError(new HttpError(409, { code: "no_open_response_obligation" }))
    ).toBe("no_obligation");
  });

  it("falls back to a retryable generic state for untyped transport failures", () => {
    expect(toAstroDiaryActionError(new Error("network"))).toBe("generic");
  });
});
