import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { resolveCurrentAccountRouteAccess } from "./currentAccountRouteAccess";

describe("resolveCurrentAccountRouteAccess", () => {
  it("waits while the current account query is pending", () => {
    expect(
      resolveCurrentAccountRouteAccess({
        isPending: true,
        isError: false,
        isSuccess: false,
        data: undefined,
        error: null
      })
    ).toEqual({ state: "pending" });
  });

  it("redirects guests to auth when the current account request is unauthorized", () => {
    expect(
      resolveCurrentAccountRouteAccess({
        isPending: false,
        isError: true,
        isSuccess: false,
        data: undefined,
        error: new HttpError(401, { message: "Valid public session is required" })
      })
    ).toEqual({ state: "redirect", to: "/auth" });
  });

  it("renders protected content when the current account query succeeds", () => {
    expect(
      resolveCurrentAccountRouteAccess({
        isPending: false,
        isError: false,
        isSuccess: true,
        data: {
          account: {
            id: "8e14390f-3db1-4d1c-9344-55679c778427",
            status: "active",
            roles: ["client"]
          }
        },
        error: null
      })
    ).toEqual({ state: "allowed" });
  });

  it("throws non-authentication errors to the route error boundary", () => {
    const error = new Error("network failed");

    expect(
      resolveCurrentAccountRouteAccess({
        isPending: false,
        isError: true,
        isSuccess: false,
        data: undefined,
        error
      })
    ).toEqual({ state: "error", error });
  });
});
