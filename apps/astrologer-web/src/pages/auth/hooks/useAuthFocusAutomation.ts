import { isEmailCompleteWithKnownTld, isPopularFirstName } from "@elevenhouse/validation";
import { validateSupportedPhoneNumber } from "@elevenhouse/validation/phone";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  shouldSchedulePhoneFocusForName,
  shouldScheduleSubmitFocusForPhone
} from "../helpers/delayedValidationVisibility";
import type { PhoneInputState } from "../helpers/phoneInputModel";

type AuthFocusAutomationInput = {
  readonly delayMs: number;
  readonly isRegisterMode: boolean;
  readonly emailInputRef: RefObject<HTMLInputElement | null>;
  readonly nameInputRef: RefObject<HTMLInputElement | null>;
  readonly phoneInputRef: RefObject<HTMLInputElement | null>;
  readonly submitButtonRef: RefObject<HTMLButtonElement | null>;
};

export function useAuthFocusAutomation({
  delayMs,
  isRegisterMode,
  emailInputRef,
  nameInputRef,
  phoneInputRef,
  submitButtonRef
}: AuthFocusAutomationInput) {
  const phoneFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSubmitFocusTimeout = useCallback(() => {
    if (submitFocusTimeoutRef.current !== null) {
      clearTimeout(submitFocusTimeoutRef.current);
      submitFocusTimeoutRef.current = null;
    }
  }, []);

  const clearPhoneFocusTimeout = useCallback(() => {
    if (phoneFocusTimeoutRef.current !== null) {
      clearTimeout(phoneFocusTimeoutRef.current);
      phoneFocusTimeoutRef.current = null;
    }
  }, []);

  const schedulePhoneFocus = useCallback(
    (name: string) => {
      clearPhoneFocusTimeout();

      if (
        !shouldSchedulePhoneFocusForName({
          isRegisterMode,
          isPopularFirstName: isPopularFirstName(name),
          name
        })
      ) {
        return;
      }

      phoneFocusTimeoutRef.current = setTimeout(() => {
        const nameInput = nameInputRef.current;
        const phoneInput = phoneInputRef.current;

        if (document.activeElement !== nameInput || !phoneInput) {
          return;
        }

        phoneInput.focus({ preventScroll: true });
      }, delayMs);
    },
    [clearPhoneFocusTimeout, delayMs, isRegisterMode, nameInputRef, phoneInputRef]
  );

  const scheduleSubmitFocus = useCallback(
    (email: string) => {
      clearSubmitFocusTimeout();

      if (!isEmailCompleteWithKnownTld(email)) {
        return;
      }

      submitFocusTimeoutRef.current = setTimeout(() => {
        const emailInput = emailInputRef.current;
        const submitButton = submitButtonRef.current;

        if (document.activeElement !== emailInput || !submitButton || submitButton.disabled) {
          return;
        }

        submitButton.focus({ preventScroll: true });
      }, delayMs);
    },
    [clearSubmitFocusTimeout, delayMs, emailInputRef, submitButtonRef]
  );

  const scheduleSubmitFocusAfterValidPhone = useCallback(
    (nextPhoneInputState: PhoneInputState) => {
      clearSubmitFocusTimeout();

      const nextPhoneValidation = validateSupportedPhoneNumber(
        nextPhoneInputState.normalizedValue,
        nextPhoneInputState.selectedCountry
      );

      if (
        !shouldScheduleSubmitFocusForPhone({
          isValidPhone: nextPhoneValidation.valid,
          phone: nextPhoneInputState.displayValue
        })
      ) {
        return;
      }

      submitFocusTimeoutRef.current = setTimeout(() => {
        const phoneInput = phoneInputRef.current;
        const submitButton = submitButtonRef.current;

        if (document.activeElement !== phoneInput || !submitButton || submitButton.disabled) {
          return;
        }

        submitButton.focus({ preventScroll: true });
      }, delayMs);
    },
    [clearSubmitFocusTimeout, delayMs, phoneInputRef, submitButtonRef]
  );

  useEffect(
    () => () => {
      clearPhoneFocusTimeout();
      clearSubmitFocusTimeout();
    },
    [clearPhoneFocusTimeout, clearSubmitFocusTimeout]
  );

  return {
    schedulePhoneFocus,
    scheduleSubmitFocus,
    scheduleSubmitFocusAfterValidPhone
  };
}
