import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton.js";

describe("IconButton", () => {
  it("renders an accessible icon-only button without visible title requirements", () => {
    const element = IconButton({
      label: "Свернуть меню",
      icon: <span data-icon="collapse" />,
      variant: "drawer",
      size: "medium",
      pressed: true,
      className: "custom-control"
    });

    expect(element.type).toBe("button");
    expect(element.props.type).toBe("button");
    expect(element.props["aria-label"]).toBe("Свернуть меню");
    expect(element.props["aria-pressed"]).toBe(true);
    expect(element.props.className).toBe(
      "ehIconButton ehIconButton--medium ehIconButton--drawer ehIconButton--pressed custom-control"
    );
    expect(element.props.children.props.className).toBe("ehIconButton__icon");
    expect(element.props.children.props.children.props["data-icon"]).toBe("collapse");
  });

  it("forwards native button props and click handlers", () => {
    const onClick = vi.fn();
    const element = IconButton({
      label: "Открыть уведомления",
      icon: <span data-icon="bell" />,
      disabled: true,
      onClick
    });

    expect(element.props.disabled).toBe(true);

    element.props.onClick();

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
