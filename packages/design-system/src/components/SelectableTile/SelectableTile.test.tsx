import { describe, expect, it, vi } from "vitest";
import { SelectableTile } from "./SelectableTile.js";

describe("SelectableTile", () => {
  it("renders an accessible selectable button", () => {
    const onClick = vi.fn();
    const tile = SelectableTile({
      label: "Видео",
      description: "Запись сессии",
      selected: true,
      icon: <span data-icon="video" />,
      onClick
    });

    expect(tile.type).toBe("button");
    expect(tile.props.type).toBe("button");
    expect(tile.props["aria-pressed"]).toBe(true);
    expect(tile.props.className).toContain("ehSelectableTile");
    expect(tile.props.className).toContain("ehSelectableTile--selected");
    expect(JSON.stringify(tile.props.children)).toContain("Видео");
    expect(JSON.stringify(tile.props.children)).toContain("Запись сессии");

    tile.props.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("supports disabled state without calling onClick", () => {
    const onClick = vi.fn();
    const tile = SelectableTile({
      label: "Канал",
      selected: false,
      disabled: true,
      onClick
    });

    expect(tile.props.disabled).toBe(true);
    expect(tile.props["aria-pressed"]).toBe(false);
    tile.props.onClick();
    expect(onClick).not.toHaveBeenCalled();
  });
});
