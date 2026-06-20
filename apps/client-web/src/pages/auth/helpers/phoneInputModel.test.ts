import { describe, expect, it } from "vitest";
import { applyPhoneCountryChange, applyPhoneInputChange, createInitialPhoneInputState } from "./phoneInputModel";

describe("phoneInputModel", () => {
  it("turns a leading seven into +7 and selects Russia", () => {
    expect(applyPhoneInputChange(createInitialPhoneInputState("RU"), "7")).toMatchObject({
      displayValue: "+7",
      normalizedValue: "+7",
      selectedCountry: "RU"
    });
  });

  it("ignores letters when phone value changes", () => {
    const previous = applyPhoneInputChange(createInitialPhoneInputState("RU"), "+7");

    expect(applyPhoneInputChange(previous, "+7abc999")).toMatchObject({
      normalizedValue: "+7999",
      selectedCountry: "RU"
    });
  });

  it("infers Georgia from the typed country code", () => {
    expect(applyPhoneInputChange(createInitialPhoneInputState("RU"), "+995555123456")).toMatchObject({
      normalizedValue: "+995555123456",
      selectedCountry: "GE"
    });
  });

  it("turns a typed supported calling code into an international number and selects its country", () => {
    expect(applyPhoneInputChange(createInitialPhoneInputState("RU"), "994")).toMatchObject({
      displayValue: "+994",
      normalizedValue: "+994",
      selectedCountry: "AZ"
    });
  });

  it("preserves Kazakhstan after manual selection for shared +7 numbers", () => {
    const kazakhstan = applyPhoneCountryChange(createInitialPhoneInputState("RU"), "KZ");

    expect(applyPhoneInputChange(kazakhstan, "7")).toMatchObject({
      normalizedValue: "+7",
      selectedCountry: "KZ"
    });
  });

  it("keeps Kazakhstan selected for local Kazakhstan mobile numbers", () => {
    const kazakhstan = applyPhoneCountryChange(createInitialPhoneInputState("RU"), "KZ");

    expect(applyPhoneInputChange(kazakhstan, "7011234567")).toMatchObject({
      normalizedValue: "7011234567",
      selectedCountry: "KZ"
    });
  });

  it("does not keep more phone digits than the selected country allows", () => {
    const georgia = applyPhoneCountryChange(createInitialPhoneInputState("RU"), "GE");

    expect(applyPhoneInputChange(georgia, "+995555123456789")).toMatchObject({
      normalizedValue: "+995555123456",
      selectedCountry: "GE"
    });
  });

  it("keeps empty input empty when a country is selected manually", () => {
    expect(applyPhoneCountryChange(createInitialPhoneInputState("RU"), "GE")).toEqual({
      displayValue: "",
      normalizedValue: "",
      selectedCountry: "GE"
    });
  });
});
