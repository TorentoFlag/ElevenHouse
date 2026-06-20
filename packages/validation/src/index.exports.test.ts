import { describe, expect, it } from "vitest";
import * as validation from "./index";

describe("validation root exports", () => {
  it("keeps heavy phone validation out of the root barrel", () => {
    expect("formatPhoneInput" in validation).toBe(false);
    expect("validateSupportedPhoneNumber" in validation).toBe(false);
    expect("supportedPhoneCountries" in validation).toBe(false);
  });
});
