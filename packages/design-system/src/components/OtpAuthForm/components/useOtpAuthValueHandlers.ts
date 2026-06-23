import { useCallback, type ChangeEvent } from "react";
import type { OtpAuthFormValues } from "../types.js";

export type UseOtpAuthValueHandlersParams = {
  readonly values: OtpAuthFormValues;
  readonly onValuesChange: (values: OtpAuthFormValues) => void;
};

export function useOtpAuthValueHandlers({
  values,
  onValuesChange
}: UseOtpAuthValueHandlersParams) {
  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onValuesChange({
        ...values,
        name: event.currentTarget.value
      });
    },
    [onValuesChange, values]
  );

  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onValuesChange({
        ...values,
        email: event.currentTarget.value
      });
    },
    [onValuesChange, values]
  );

  const handlePhoneChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onValuesChange({
        ...values,
        phone: event.currentTarget.value
      });
    },
    [onValuesChange, values]
  );

  return {
    handleEmailChange,
    handleNameChange,
    handlePhoneChange
  };
}
