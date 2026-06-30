import { Children, isValidElement, type JSXElementConstructor, type ReactElement } from "react";
import { Outlet } from "react-router";
import { describe, expect, it } from "vitest";
import { AstrologerNavigationDrawer } from "../AstrologerNavigationDrawer";
import { AstrologerAppLayout } from "./AstrologerAppLayout";
import styles from "./AstrologerAppLayout.module.css";

describe("AstrologerAppLayout", () => {
  it("provides a desktop shell with persistent navigation and workspace regions", () => {
    const layout = AstrologerAppLayout();

    expect(layout.type).toBe("div");
    expect(layout.props.className).toBe(styles.shell);

    const [navigationDrawer, workspace] = Children.toArray(layout.props.children);

    expect(isValidElement(navigationDrawer) && navigationDrawer.type).toBe(AstrologerNavigationDrawer);
    expect(isValidElement(workspace) && workspace.type).toBe("div");
    if (!isValidElement(workspace)) {
      throw new Error("Expected app shell workspace region");
    }
    const workspaceElement = workspace as ReactElement<{
      className: string;
      children: ReactElement[];
    }>;
    expect(workspaceElement.props.className).toBe(styles.workspace);

    const [header, main] = Children.toArray(workspaceElement.props.children);

    expect(isValidElement(header) && getElementTypeName(header)).toBe("AstrologerHeader");

    expect(isValidElement(main) && main.type).toBe("main");
    if (!isValidElement(main)) {
      throw new Error("Expected app shell main region");
    }
    const mainElement = main as ReactElement<{
      className: string;
      "aria-label": string;
      children: ReactElement;
    }>;

    expect(mainElement.props.className).toBe(styles.main);
    expect(mainElement.props["aria-label"]).toBe("Astrologer workspace");
    expect(mainElement.props.children.type).toBe(Outlet);
  });
});

function getElementTypeName(element: ReactElement) {
  if (typeof element.type === "string") {
    return element.type;
  }

  return (element.type as JSXElementConstructor<unknown>).name;
}
