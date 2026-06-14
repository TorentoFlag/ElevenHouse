import { describe, expect, it } from "vitest";
import { isUserAccountStatus, userAccountStatusValues } from "./index";

describe("accounts module exports", () => {
  it("exposes account status primitives from its barrel", () => {
    expect(userAccountStatusValues).toEqual(["active", "suspended", "deleted"]);
    expect(isUserAccountStatus("active")).toBe(true);
    expect(isUserAccountStatus("archived")).toBe(false);
  });
});
