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

  it("defaults shared +7 input to Russia unless Kazakhstan is selected", () => {
    expect(inferPhoneCountry("+7", "RU")).toBe("RU");
    expect(inferPhoneCountry("+7", "KZ")).toBe("KZ");
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
