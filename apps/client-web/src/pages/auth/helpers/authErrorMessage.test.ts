import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { resolveAuthErrorMessage } from "./authErrorMessage";

const copy = {
  errors: {
    invalidCode: "Invalid code",
    identityExists: "Identity exists",
    rateLimited: "Rate limited",
    generic: "Generic error"
  }
};

describe("resolveAuthErrorMessage", () => {
  it("maps known auth HTTP statuses to user-facing copy", () => {
    expect(resolveAuthErrorMessage(new HttpError(401, null), copy)).toBe("Invalid code");
    expect(resolveAuthErrorMessage(new HttpError(409, null), copy)).toBe("Identity exists");
    expect(resolveAuthErrorMessage(new HttpError(429, null), copy)).toBe("Rate limited");
  });

  it("uses generic copy for unknown errors", () => {
    expect(resolveAuthErrorMessage(new HttpError(500, null), copy)).toBe("Generic error");
    expect(resolveAuthErrorMessage(new Error("Network failed"), copy)).toBe("Generic error");
  });
});
