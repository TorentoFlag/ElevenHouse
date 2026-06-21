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

export function applyPhoneInputBackspace(
  previous: PhoneInputState,
  currentDisplayValue: string,
  selectionStart: number,
  selectionEnd: number = selectionStart
): PhoneInputState {
  const normalizedDigits = previous.normalizedValue.replace(/\D/g, "");
  const digitsBeforeSelection = countDigitsBeforeIndex(currentDisplayValue, selectionStart);
  const digitsAfterSelection = countDigitsBeforeIndex(currentDisplayValue, selectionEnd);
  const deleteStart = selectionStart === selectionEnd ? digitsBeforeSelection - 1 : digitsBeforeSelection;
  const deleteEnd = selectionStart === selectionEnd ? digitsBeforeSelection : digitsAfterSelection;

  if (deleteStart < 0 || deleteEnd <= deleteStart) {
    return previous;
  }

  const nextDigits = `${normalizedDigits.slice(0, deleteStart)}${normalizedDigits.slice(deleteEnd)}`;
  const nextRawValue = previous.normalizedValue.startsWith("+") && nextDigits.length > 0 ? `+${nextDigits}` : nextDigits;

  return applyPhoneInputChange(previous, nextRawValue);
}

function countDigitsBeforeIndex(value: string, index: number): number {
  return value.slice(0, Math.max(0, index)).replace(/\D/g, "").length;
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
