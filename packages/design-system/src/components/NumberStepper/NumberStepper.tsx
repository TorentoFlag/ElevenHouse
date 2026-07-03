import { classNames } from "../../helpers/classNames.js";
import type { NumberStepperProps } from "./types.js";

export function NumberStepper({
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  suffix,
  decrementLabel,
  incrementLabel,
  className,
  onValueChange
}: NumberStepperProps) {
  const decrement = () => onValueChange(clamp(value - step, min, max));
  const increment = () => onValueChange(clamp(value + step, min, max));

  return (
    <div className={classNames("ehNumberStepper", className)}>
      <button
        className="ehNumberStepper__button"
        type="button"
        aria-label={decrementLabel}
        onClick={decrement}
      >
        -
      </button>
      <span className="ehNumberStepper__value">
        {value}
        {suffix ?? ""}
      </span>
      <button
        className="ehNumberStepper__button"
        type="button"
        aria-label={incrementLabel}
        onClick={increment}
      >
        +
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
