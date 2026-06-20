import { formatPhoneInput, type PhoneCountryIso2 } from "@elevenhouse/validation/phone";

export interface PhoneInputState {
  displayValue: string;
  selectedCountry: PhoneCountryIso2;
  normalizedValue: string;
}

export function createInitialPhoneInputState(selectedCountry: PhoneCountryIso2 = "RU"): PhoneInputState {
  return {
    displayValue: "",
    normalizedValue: "",
    selectedCountry
  };
}

export function applyPhoneInputChange(
  previous: PhoneInputState,
  nextRawValue: string
): PhoneInputState {
  const formattedPhone = formatPhoneInput(nextRawValue, previous.selectedCountry);

  return {
    displayValue: formattedPhone.displayValue,
    normalizedValue: formattedPhone.normalizedValue,
    selectedCountry: formattedPhone.country
  };
}

export function applyPhoneCountryChange(
  previous: PhoneInputState,
  nextCountry: PhoneCountryIso2
): PhoneInputState {
  if (previous.normalizedValue.length === 0) {
    return {
      displayValue: "",
      normalizedValue: "",
      selectedCountry: nextCountry
    };
  }

  const formattedPhone = formatPhoneInput(previous.normalizedValue, nextCountry);

  return {
    displayValue: formattedPhone.displayValue,
    normalizedValue: formattedPhone.normalizedValue,
    selectedCountry: nextCountry
  };
}
