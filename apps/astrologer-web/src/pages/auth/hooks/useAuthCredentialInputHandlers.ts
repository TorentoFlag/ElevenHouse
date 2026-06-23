import type { OtpAuthFormValues } from "@elevenhouse/design-system/components/OtpAuthForm";
import { isSupportedPhoneCountry } from "@elevenhouse/validation/phone";
import { useCallback, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import {
  applyPhoneCountryChange,
  applyPhoneInputBackspace,
  applyPhoneInputChange,
  type PhoneInputState
} from "../helpers/phoneInputModel";

export function useAuthCredentialInputHandlers(input: {
  readonly values: OtpAuthFormValues;
  readonly phoneInputState: PhoneInputState;
  readonly schedulePhoneFocus: (name: string) => void;
  readonly scheduleSubmitFocus: (email: string) => void;
  readonly scheduleSubmitFocusAfterValidPhone: (phoneInputState: PhoneInputState) => void;
  readonly setAuthValues: Dispatch<SetStateAction<OtpAuthFormValues>>;
  readonly setEmailTouched: Dispatch<SetStateAction<boolean>>;
  readonly setNameTouched: Dispatch<SetStateAction<boolean>>;
  readonly setPhoneInputState: Dispatch<SetStateAction<PhoneInputState>>;
  readonly setPhoneTouched: Dispatch<SetStateAction<boolean>>;
}) {
  const handlePhoneCountryChange = useCallback(
    (nextCountry: string) => {
      if (!isSupportedPhoneCountry(nextCountry)) {
        return;
      }

      const nextPhoneInputState = applyPhoneCountryChange(input.phoneInputState, nextCountry);

      input.setPhoneInputState(nextPhoneInputState);
      input.setAuthValues((currentValues) => ({
        ...currentValues,
        phone: nextPhoneInputState.displayValue
      }));
    },
    [input]
  );

  const handleValuesChange = useCallback(
    (values: OtpAuthFormValues) => {
      let nextValues = values;

      if (values.email !== input.values.email) {
        input.setEmailTouched(true);
        input.scheduleSubmitFocus(values.email);
      }
      if (values.name !== input.values.name) {
        input.setNameTouched(true);
        input.schedulePhoneFocus(values.name);
      }
      if (values.phone !== input.values.phone) {
        input.setPhoneTouched(true);
        const nextPhoneInputState = applyPhoneInputChange(input.phoneInputState, values.phone);
        input.setPhoneInputState(nextPhoneInputState);
        input.scheduleSubmitFocusAfterValidPhone(nextPhoneInputState);
        nextValues = {
          ...values,
          phone: nextPhoneInputState.displayValue
        };
      }

      input.setAuthValues(nextValues);
    },
    [input]
  );

  const handlePhoneInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Backspace") {
        return;
      }

      const selectionStart = event.currentTarget.selectionStart;
      const selectionEnd = event.currentTarget.selectionEnd;

      if (selectionStart === null || selectionEnd === null) {
        return;
      }

      const nextPhoneInputState = applyPhoneInputBackspace(
        input.phoneInputState,
        event.currentTarget.value,
        selectionStart,
        selectionEnd
      );

      if (nextPhoneInputState.normalizedValue === input.phoneInputState.normalizedValue) {
        return;
      }

      event.preventDefault();
      input.setPhoneTouched(true);
      input.setPhoneInputState(nextPhoneInputState);
      input.setAuthValues((currentValues) => ({
        ...currentValues,
        phone: nextPhoneInputState.displayValue
      }));
      input.scheduleSubmitFocusAfterValidPhone(nextPhoneInputState);
    },
    [input]
  );

  return {
    handlePhoneCountryChange,
    handlePhoneInputKeyDown,
    handleValuesChange
  };
}
