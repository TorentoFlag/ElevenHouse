import { useEffect, useRef, useState } from "react";
import {
  createDelayedValidationVisibilityController,
  type DelayedValidationVisibilityController
} from "../helpers/delayedValidationVisibility";

export function useDelayedValidationVisibility(input: {
  delayMs: number;
  resetKey: string;
  shouldShow: boolean;
}): boolean {
  const [isVisible, setIsVisible] = useState(false);
  const controllerRef = useRef<DelayedValidationVisibilityController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = createDelayedValidationVisibilityController({
      delayMs: input.delayMs,
      onVisibleChange: setIsVisible
    });
  }

  useEffect(
    () => () => {
      controllerRef.current?.clear();
    },
    []
  );

  useEffect(() => {
    controllerRef.current?.schedule(input.shouldShow);
  }, [input.resetKey, input.shouldShow]);

  return isVisible;
}
