import { describe, expect, it } from "vitest";
import { registerCustomerAccount } from "./index";

describe("identity account-registration use case exports", () => {
  it("exposes account registration use cases from the identity module", () => {
    expect(registerCustomerAccount).toBeTypeOf("function");
  });
});
