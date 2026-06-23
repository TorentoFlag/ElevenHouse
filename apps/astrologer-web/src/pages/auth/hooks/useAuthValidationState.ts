import type {
  OtpAuthFormMode,
  OtpAuthFormValues
} from "@elevenhouse/design-system/components/OtpAuthForm";
import { isValidDisplayName, isValidEmail } from "@elevenhouse/validation";
import { validateSupportedPhoneNumber } from "@elevenhouse/validation/phone";
import { isNameErrorCandidate } from "../helpers/delayedValidationVisibility";
import { resolveAuthCredentialState, resolveAuthSubmitState } from "../helpers/authFlowModel";
import type { PhoneInputState } from "../helpers/phoneInputModel";
import { useDelayedValidationVisibility } from "./useDelayedValidationVisibility";

type AuthValidationCopy = {
  readonly validation: {
    readonly email: string;
    readonly name: string;
    readonly phone: string;
  };
};

type AuthTouchedState = {
  readonly email: boolean;
  readonly name: boolean;
  readonly phone: boolean;
};

export function useAuthValidationState(input: {
  readonly mode: OtpAuthFormMode;
  readonly values: OtpAuthFormValues;
  readonly phoneInputState: PhoneInputState;
  readonly touched: AuthTouchedState;
  readonly copy: AuthValidationCopy;
  readonly nameErrorDelayMs: number;
}) {
  const emailError =
    input.touched.email && input.values.email.length > 0 && !isValidEmail(input.values.email)
      ? input.copy.validation.email
      : null;
  const hasNameValidationError = isNameErrorCandidate({
    isRegisterMode: input.mode === "register",
    isTouched: input.touched.name,
    isValidName: isValidDisplayName(input.values.name)
  });
  const showNameError = useDelayedValidationVisibility({
    delayMs: input.nameErrorDelayMs,
    resetKey: input.values.name,
    shouldShow: hasNameValidationError
  });
  const nameError = showNameError && hasNameValidationError ? input.copy.validation.name : null;
  const phoneValidation = validateSupportedPhoneNumber(
    input.phoneInputState.normalizedValue,
    input.phoneInputState.selectedCountry
  );
  const hasPhoneValidationError = input.values.phone.length > 0 && !phoneValidation.valid;
  const phoneError =
    input.touched.phone && hasPhoneValidationError ? input.copy.validation.phone : null;
  const credentialValues = {
    name: input.values.name,
    email: input.values.email,
    phone: input.values.phone,
    normalizedPhone: phoneValidation.normalizedValue ?? input.phoneInputState.normalizedValue,
    isPhoneValid: phoneValidation.valid
  };
  const credentialState = resolveAuthCredentialState(credentialValues);
  const submitState = resolveAuthSubmitState({
    mode: input.mode,
    values: credentialValues
  });

  return {
    emailError,
    hasNameValidationError,
    nameError,
    phoneValidation,
    hasPhoneValidationError,
    phoneError,
    credentialValues,
    credentialState,
    submitState
  };
}
