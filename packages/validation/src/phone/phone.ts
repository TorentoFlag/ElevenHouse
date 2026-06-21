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

  if (digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
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
    const parsedSharedZoneCountry = inferSharedSevenCountry(sanitizedInput);

    if (parsedSharedZoneCountry) {
      return parsedSharedZoneCountry;
    }

    return fallbackCountry === "KZ" ? "KZ" : "RU";
  }

  const match = supportedPhoneCountries
    .filter((country) => country.callingCode !== "7")
    .sort((left, right) => right.callingCode.length - left.callingCode.length)
    .find((country) => digits.startsWith(country.callingCode));

  return match?.iso2 ?? fallbackCountry;
}

function inferSharedSevenCountry(input: string): PhoneCountryIso2 | null {
  const digits = input.replace(/\D/g, "");

  if (digits.length < 11) {
    return null;
  }

  const parsedPhoneNumber = parsePhoneNumberFromString(input, {
    extract: false
  });

  return isSupportedPhoneCountry(parsedPhoneNumber?.country) ? parsedPhoneNumber.country : null;
}

export function formatPhoneInput(input: string, country: PhoneCountryIso2): PhoneFormatResult {
  const sanitizedInput = sanitizePhoneInput(input, country);
  const inferredCountry = inferPhoneCountry(sanitizedInput, country);
  const internationalInput = normalizeInferredInternationalInput(sanitizedInput, inferredCountry, country);
  const limitedInput = limitPhoneInputToCountryLength(internationalInput, inferredCountry);

  if (limitedInput.length === 0) {
    return {
      displayValue: "",
      normalizedValue: "",
      country: inferredCountry
    };
  }

  const formatter = new AsYouType(inferredCountry as CountryCode);
  const displayValue = formatter.input(limitedInput);

  return {
    displayValue,
    normalizedValue: limitedInput,
    country: inferredCountry
  };
}

function normalizeInferredInternationalInput(
  input: string,
  inferredCountry: PhoneCountryIso2,
  fallbackCountry: PhoneCountryIso2
): string {
  if (input.length === 0 || input.startsWith("+") || inferredCountry === fallbackCountry) {
    return input;
  }

  const supportedCountry = getSupportedPhoneCountry(inferredCountry);
  const digits = input.replace(/\D/g, "");

  if (!digits.startsWith(supportedCountry.callingCode)) {
    return input;
  }

  return `+${digits}`;
}

function limitPhoneInputToCountryLength(input: string, country: PhoneCountryIso2): string {
  const supportedCountry = getSupportedPhoneCountry(country);
  const maxNationalDigits = getMaxNationalPhoneDigits(country);
  const digits = input.replace(/\D/g, "");

  if (digits.length === 0) {
    return "";
  }

  if (input.startsWith("+")) {
    if (!digits.startsWith(supportedCountry.callingCode)) {
      return input;
    }

    return `+${digits.slice(0, supportedCountry.callingCode.length + maxNationalDigits)}`;
  }

  return digits.slice(0, maxNationalDigits);
}

function getMaxNationalPhoneDigits(country: PhoneCountryIso2): number {
  const supportedCountry = getSupportedPhoneCountry(country);
  const placeholderDigits = supportedCountry.placeholder.replace(/\D/g, "");

  if (placeholderDigits.startsWith(supportedCountry.callingCode)) {
    return placeholderDigits.length - supportedCountry.callingCode.length;
  }

  return placeholderDigits.length;
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
