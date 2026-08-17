import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { chartEngineCopyByLocale } from "./chartEngineCopy";
import {
  getBrowserTimezone,
  getDefaultProgressionTargetDate,
  getDefaultTransitMoment,
  errorMessageFrom,
  getHoraryPlaceReferenceErrorMessage
} from "./chartEngineControllerState";

describe("chartEngineControllerState", () => {
  it("derives default dates from the local civil calendar rather than UTC", () => {
    const localMoment = new Date(2026, 7, 3, 23, 59);

    expect(getDefaultTransitMoment(localMoment)).toEqual({
      date: "2026-08-03",
      time: "23:59"
    });
    expect(getDefaultProgressionTargetDate(localMoment)).toBe("2026-08-03");
  });

  it("does not substitute UTC when the browser timezone is unavailable", () => {
    expect(
      getBrowserTimezone(() => ({ timeZone: "" }) as Intl.ResolvedDateTimeFormatOptions)
    ).toBeNull();
    expect(
      getBrowserTimezone(() => {
        throw new Error("timezone unavailable");
      })
    ).toBeNull();
  });

  it.each([
    [
      429,
      { code: "BIRTH_PLACE_RATE_LIMITED" },
      "The place service has temporarily limited requests. Try again later"
    ],
    [
      404,
      { code: "BIRTH_PLACE_NOT_FOUND" },
      "The question place is no longer available. Choose it again"
    ],
    [
      422,
      { code: "BIRTH_PLACE_REFERENCE_INVALID" },
      "The question place reference is invalid. Choose the place again"
    ],
    [503, null, "Could not restore the question place. Try again later"]
  ])("maps place restore HTTP %s to typed English copy", (status, body, message) => {
    expect(
      getHoraryPlaceReferenceErrorMessage(new HttpError(status, body), chartEngineCopyByLocale.en)
    ).toBe(message);
  });

  it("never exposes a raw HTTP failure in chart workspace copy", () => {
    expect(
      errorMessageFrom(
        new HttpError(404, { message: "calculation record was not found" }),
        "Chart is unavailable"
      )
    ).toBe("Chart is unavailable");
  });

  it("treats transport-like plain errors as user-facing service failures", () => {
    expect(
      errorMessageFrom(new Error("HTTP request failed with status 502"), "Chart is unavailable")
    ).toBe("Chart is unavailable");
  });
});
