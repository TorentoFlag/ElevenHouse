import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { CountryCode } from "libphonenumber-js/max";
import {
  getSupportedPhoneCountry,
  isSupportedPhoneCountry,
  supportedPhoneCountries,
  type PhoneCountryIso2
} from "./countries.js";

export interface PhoneFormatResult {
  displayValue: string;
  normalizedValue: string;
  country: PhoneCountryIso2;
}

export interface PhoneValidationResult {
  valid: boolean;
  normalizedValue: string | null;
  country: PhoneCountryIso2 | null;
  reason: "empty" | "unsupported_country" | "invalid_number" | null;
}

export function sanitizePhoneInput(input: string, country?: PhoneCountryIso2): string {
  const trimmedInput = input.trim();
  const digits = trimmedInput.replace(/\D/g, "");

  if (digits.length === 0) {
    return "";
  }

  if (trimmedInput.startsWith("+")) {
    return `+${digits}`;
  }

  if (country === "KZ" && digits.startsWith("7") && digits.length > 1) {
    return digits;
  }

  if (digits.startsWith("7")) {
    return `+${digits}`;
  }

  return digits;
}

export function inferPhoneCountry(input: string, fallbackCountry: PhoneCountryIso2): PhoneCountryIso2 {
  const sanitizedInput = sanitizePhoneInput(input, fallbackCountry);
  const digits = sanitizedInput.replace(/\D/g, "");

  if (digits.length === 0) {
    return fallbackCountry;
  }

  if (digits.startsWith("7")) {
    return fallbackCountry === "KZ" ? "KZ" : "RU";
  }

  const match = supportedPhoneCountries
    .filter((country) => country.callingCode !== "7")
    .sort((left, right) => right.callingCode.length - left.callingCode.length)
    .find((country) => digits.startsWith(country.callingCode));

  return match?.iso2 ?? fallbackCountry;
}

export function formatPhoneInput(input: string, country: PhoneCountryIso2): PhoneFormatResult {
  const sanitizedInput = sanitizePhoneInput(input, country);
  const inferredCountry = inferPhoneCountry(sanitizedInput, country);

  if (sanitizedInput.length === 0) {
    return {
      displayValue: "",
      normalizedValue: "",
      country: inferredCountry
    };
  }

  const formatter = new AsYouType(inferredCountry as CountryCode);
  const displayValue = formatter.input(sanitizedInput);

  return {
    displayValue,
    normalizedValue: sanitizedInput,
    country: inferredCountry
  };
}

export function validateSupportedPhoneNumber(
  input: string,
  country: PhoneCountryIso2
): PhoneValidationResult {
  const sanitizedInput = sanitizePhoneInput(input, country);

  if (sanitizedInput.length === 0) {
    return {
      valid: false,
      normalizedValue: null,
      country,
      reason: "empty"
    };
  }

  const parsedPhoneNumber = parsePhoneNumberFromString(sanitizedInput, {
    defaultCountry: country as CountryCode,
    extract: false
  });

  if (!parsedPhoneNumber) {
    return {
      valid: false,
      normalizedValue: null,
      country: null,
      reason: "invalid_number"
    };
  }

  if (!isSupportedPhoneCountry(parsedPhoneNumber.country)) {
    return {
      valid: false,
      normalizedValue: null,
      country: null,
      reason: "unsupported_country"
    };
  }

  if (parsedPhoneNumber.country !== country || !parsedPhoneNumber.isValid()) {
    return {
      valid: false,
      normalizedValue: null,
      country: parsedPhoneNumber.country,
      reason: "invalid_number"
    };
  }

  return {
    valid: true,
    normalizedValue: parsedPhoneNumber.number,
    country: parsedPhoneNumber.country,
    reason: null
  };
}

export function getPhonePlaceholder(country: PhoneCountryIso2): string {
  return getSupportedPhoneCountry(country).placeholder;
}
