import { describe, expect, it } from "vitest";
import {
  formatPhoneInput,
  getPhonePlaceholder,
  inferPhoneCountry,
  sanitizePhoneInput,
  validateSupportedPhoneNumber
} from "./index";

describe("phone validation", () => {
  it("ignores letters and keeps only dialable phone characters", () => {
    expect(sanitizePhoneInput("abc+7 (999) test")).toBe("+7999");
    expect(sanitizePhoneInput("+7+999-12a")).toBe("+799912");
  });

  it("turns a leading seven into a Russian dial prefix", () => {
    expect(sanitizePhoneInput("7")).toBe("+7");
    expect(formatPhoneInput("7", "RU")).toMatchObject({
      country: "RU",
      normalizedValue: "+7"
    });
  });

  it("turns a leading Russian trunk eight into a Russian dial prefix", () => {
    expect(sanitizePhoneInput("89050334945")).toBe("+79050334945");
    expect(formatPhoneInput("8 905 033 49 45", "RU")).toMatchObject({
      country: "RU",
      normalizedValue: "+79050334945"
    });
  });

  it("defaults shared +7 input to Russia unless Kazakhstan is selected", () => {
    expect(inferPhoneCountry("+7", "RU")).toBe("RU");
    expect(inferPhoneCountry("+7", "KZ")).toBe("KZ");
  });

  it("infers Russia and Kazakhstan from full shared +7 numbering ranges", () => {
    expect(formatPhoneInput("+7 705 943 4343", "RU")).toMatchObject({
      normalizedValue: "+77059434343",
      country: "KZ"
    });
    expect(formatPhoneInput("+7 999 123 45 67", "KZ")).toMatchObject({
      normalizedValue: "+79991234567",
      country: "RU"
    });
  });

  it("formats typed supported calling codes as international numbers and switches country", () => {
    expect(formatPhoneInput("994", "RU")).toMatchObject({
      displayValue: "+994",
      normalizedValue: "+994",
      country: "AZ"
    });
    expect(formatPhoneInput("995555123456", "RU")).toMatchObject({
      normalizedValue: "+995555123456",
      country: "GE"
    });
  });

  it("validates a Russian phone number and returns E.164", () => {
    expect(validateSupportedPhoneNumber("+7 999 123-45-67", "RU")).toEqual({
      valid: true,
      normalizedValue: "+79991234567",
      country: "RU",
      reason: null
    });
  });

  it("validates a Kazakhstan phone number on the shared +7 country code", () => {
    expect(validateSupportedPhoneNumber("+7 701 123 45 67", "KZ")).toEqual({
      valid: true,
      normalizedValue: "+77011234567",
      country: "KZ",
      reason: null
    });
  });

  it("validates a Kazakhstan local mobile number after Kazakhstan is selected", () => {
    expect(validateSupportedPhoneNumber("7011234567", "KZ")).toEqual({
      valid: true,
      normalizedValue: "+77011234567",
      country: "KZ",
      reason: null
    });
  });

  it("validates a Georgian phone number and returns E.164", () => {
    expect(validateSupportedPhoneNumber("+995 555 12 34 56", "GE")).toEqual({
      valid: true,
      normalizedValue: "+995555123456",
      country: "GE",
      reason: null
    });
  });

  it("limits formatted input to the selected country's maximum national digits", () => {
    expect(formatPhoneInput("+995 555 12 34 56 789", "GE")).toMatchObject({
      normalizedValue: "+995555123456",
      country: "GE"
    });
    expect(formatPhoneInput("+7 999 123-45-67 89", "RU")).toMatchObject({
      normalizedValue: "+79991234567",
      country: "RU"
    });
    expect(formatPhoneInput("701123456789", "KZ")).toMatchObject({
      normalizedValue: "7011234567",
      country: "KZ"
    });
  });

  it("rejects short invalid numbers", () => {
    expect(validateSupportedPhoneNumber("+7 999", "RU")).toEqual({
      valid: false,
      normalizedValue: null,
      country: "RU",
      reason: "invalid_number"
    });
  });

  it("rejects unsupported country prefixes", () => {
    expect(validateSupportedPhoneNumber("+44 20 7946 0958", "RU")).toEqual({
      valid: false,
      normalizedValue: null,
      country: null,
      reason: "unsupported_country"
    });
  });

  it("does not support Ukraine phone numbers", () => {
    expect(validateSupportedPhoneNumber("+380 50 123 45 67", "RU")).toEqual({
      valid: false,
      normalizedValue: null,
      country: null,
      reason: "unsupported_country"
    });
  });

  it("returns country-specific placeholders", () => {
    expect(getPhonePlaceholder("RU")).toBe("+7 999 123-45-67");
    expect(getPhonePlaceholder("GE")).toBe("+995 555 12 34 56");
  });
});
