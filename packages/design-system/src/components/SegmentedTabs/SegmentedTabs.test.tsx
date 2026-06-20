import { describe, expect, it, vi } from "vitest";
import { SegmentedTabs } from "./SegmentedTabs.js";

describe("SegmentedTabs", () => {
  it("renders controlled tabs with an active segmented indicator", () => {
    const tabs = SegmentedTabs({
      value: "login",
      ariaLabel: "Auth mode",
      options: [
        { value: "register", label: "Регистрация" },
        { value: "login", label: "Вход" }
      ],
      onValueChange: vi.fn()
    });

    const serializedTabs = JSON.stringify(tabs.props.children);
    const indicator = findElementByProp(tabs, "activeIndex", 1);
    const loginTab = findElementByText(tabs, "Вход");

    expect(tabs.type).toBe("div");
    expect(tabs.props.role).toBe("tablist");
    expect(tabs.props["aria-label"]).toBe("Auth mode");
    expect(tabs.props.className).toBe("ehSegmentedTabs");
    expect(indicator?.props?.itemCount).toBe(2);
    expect(loginTab?.props?.role).toBe("tab");
    expect(loginTab?.props?.className).toBe("ehSegmentedTabs__tab ehSegmentedTabs__tab--active");
    expect(loginTab?.props?.["aria-selected"]).toBe(true);
    expect(serializedTabs).toContain("Регистрация");
  });

  it("calls onValueChange only for inactive tabs", () => {
    const onValueChange = vi.fn();
    const tabs = SegmentedTabs({
      value: "register",
      ariaLabel: "Auth mode",
      options: [
        { value: "register", label: "Регистрация" },
        { value: "login", label: "Вход" }
      ],
      onValueChange
    });

    findElementByText(tabs, "Регистрация")?.props?.onClick?.();
    findElementByText(tabs, "Вход")?.props?.onClick?.();

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("login");
  });
});

type TestElement = {
  type?: unknown;
  props?: {
    children?: unknown;
    className?: string;
    onClick?: () => void;
    [key: string]: unknown;
  };
};

function findElementByProp(node: unknown, propName: string, value: unknown): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByProp(child, propName, value);
      if (match) {
        return match;
      }
    }
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as TestElement;
  if (element.props?.[propName] === value) {
    return element;
  }

  return findInChildren(element, (child) => findElementByProp(child, propName, value));
}

function findElementByText(node: unknown, text: string): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByText(child, text);
      if (match) {
        return match;
      }
    }
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as TestElement;
  if (element.props?.children === text) {
    return element;
  }

  return findInChildren(element, (child) => findElementByText(child, text));
}

function findInChildren(
  element: TestElement,
  findMatch: (child: unknown) => TestElement | null
): TestElement | null {
  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    const match = findMatch(child);
    if (match) {
      return match;
    }
  }

  return null;
}
