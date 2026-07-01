import { isValidElement, type ReactElement } from "react";
import { Reference } from "@elevenhouse/design-system/icons/Reference";
import { describe, expect, it, vi } from "vitest";
import { ReferenceCategoryButton } from "./ReferenceCategoryButton";
import styles from "../ReferencePage.module.css";

describe("ReferenceCategoryButton", () => {
  it("renders category label, count, icon and selection state", () => {
    const onClick = vi.fn();
    const button = ReferenceCategoryButton({
      id: "all",
      label: "Все трактовки",
      count: 14,
      icon: <Reference width={16} height={16} />,
      isActive: true,
      onClick
    });

    expect(button.type).toBe("button");
    expect(button.props.type).toBe("button");
    expect(button.props["data-reference-category-id"]).toBe("all");
    expect(button.props.className).toBe(
      `${styles.categoryButton} ${styles.categoryButtonActive}`
    );
    expect(JSON.stringify(button.props.children)).toContain("Все трактовки");
    expect(JSON.stringify(button.props.children)).toContain("14");
    expect(findFirstElementType(button.props.children)).toBe(Reference);

    button.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders inactive category button without the active class", () => {
    const button = ReferenceCategoryButton({
      id: "category_planets",
      label: "Планеты в знаках",
      count: 4,
      icon: <Reference width={16} height={16} />,
      isActive: false,
      onClick: vi.fn()
    });

    expect(button.props.className).toBe(styles.categoryButton);
  });
});

function findFirstElementType(root: unknown) {
  if (!Array.isArray(root)) {
    return null;
  }

  for (const child of root) {
    if (!isValidElement<{ children?: unknown }>(child)) {
      continue;
    }

    if (child.props.children && isValidElement(child.props.children)) {
      return (child.props.children as ReactElement).type;
    }
  }

  return null;
}
