import { describe, expect, it, vi } from "vitest";
import { NumberStepper } from "./NumberStepper.js";

describe("NumberStepper", () => {
  it("increments and decrements within bounds", () => {
    const onValueChange = vi.fn();
    const stepper = NumberStepper({
      value: 3,
      min: 2,
      max: 5,
      step: 1,
      decrementLabel: "Уменьшить",
      incrementLabel: "Увеличить",
      onValueChange
    });

    const buttons = stepper.props.children.filter((child: { type: string }) => child.type === "button");
    buttons[0].props.onClick();
    buttons[1].props.onClick();

    expect(onValueChange).toHaveBeenNthCalledWith(1, 2);
    expect(onValueChange).toHaveBeenNthCalledWith(2, 4);
  });

  it("clamps values at min and max", () => {
    const onValueChange = vi.fn();
    const minStepper = NumberStepper({
      value: 2,
      min: 2,
      max: 5,
      decrementLabel: "Уменьшить",
      incrementLabel: "Увеличить",
      onValueChange
    });
    const minButtons = minStepper.props.children.filter((child: { type: string }) => child.type === "button");

    minButtons[0].props.onClick();
    expect(onValueChange).toHaveBeenCalledWith(2);

    const maxStepper = NumberStepper({
      value: 5,
      min: 2,
      max: 5,
      decrementLabel: "Уменьшить",
      incrementLabel: "Увеличить",
      onValueChange
    });
    const maxButtons = maxStepper.props.children.filter((child: { type: string }) => child.type === "button");

    maxButtons[1].props.onClick();
    expect(onValueChange).toHaveBeenLastCalledWith(5);
  });
});
