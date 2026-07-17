import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { getNumerologyActionErrorMessage } from "./numerologyActionErrorModel";

describe("Numerology action errors", () => {
  it("turns the timezone conflict into an actionable profile instruction", () => {
    expect(
      getNumerologyActionErrorMessage(
        new HttpError(409, {
          statusCode: 409,
          error: "ASTROLOGER_TIMEZONE_REQUIRED",
          code: "ASTROLOGER_TIMEZONE_REQUIRED",
          message: "A valid astrologer timezone is required for current-year periods"
        }),
        "Не удалось сохранить расчёт"
      )
    ).toBe("Укажите часовой пояс в настройках профиля и повторите расчёт");
  });

  it("does not expose raw HTTP errors for unknown failures", () => {
    expect(
      getNumerologyActionErrorMessage(new HttpError(500, null), "Не удалось сохранить расчёт")
    ).toBe("Не удалось сохранить расчёт");
  });
});
