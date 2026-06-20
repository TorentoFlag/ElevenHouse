export type DelayedValidationVisibilityController = {
  schedule: (shouldShow: boolean) => void;
  clear: () => void;
};

type DelayedValidationVisibilityControllerOptions = {
  delayMs: number;
  onVisibleChange: (visible: boolean) => void;
};

export function createDelayedValidationVisibilityController({
  delayMs,
  onVisibleChange
}: DelayedValidationVisibilityControllerOptions): DelayedValidationVisibilityController {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  function clear() {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  }

  return {
    schedule(shouldShow) {
      clear();

      if (!shouldShow) {
        onVisibleChange(false);
        return;
      }

      timeout = setTimeout(() => {
        timeout = null;
        onVisibleChange(true);
      }, delayMs);
    },
    clear
  };
}

export function isNameErrorCandidate(input: {
  isRegisterMode: boolean;
  isTouched: boolean;
  isValidName: boolean;
}): boolean {
  return input.isRegisterMode && input.isTouched && !input.isValidName;
}

export function shouldSchedulePhoneFocusForName(input: {
  isRegisterMode: boolean;
  isPopularFirstName: boolean;
  name: string;
}): boolean {
  return input.isRegisterMode && input.name === input.name.trim() && input.isPopularFirstName;
}
