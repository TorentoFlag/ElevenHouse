import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Children, isValidElement, type JSXElementConstructor, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { AstrologerNavigationDrawer } from "../AstrologerNavigationDrawer";
import { AstrologerMobileNavigation } from "../AstrologerMobileNavigation";
import { AstrologerAppLayout } from "./AstrologerAppLayout";
import styles from "./AstrologerAppLayout.module.css";

const appLayoutCss = readFileSync(
  fileURLToPath(new URL("./AstrologerAppLayout.module.css", import.meta.url)),
  "utf8"
);

describe("AstrologerAppLayout", () => {
  it("provides a desktop shell with persistent navigation and workspace regions", () => {
    const layout = AstrologerAppLayout();

    expect(layout.type).toBe("div");
    expect(layout.props.className).toBe(styles.shell);

    const [navigationDrawer, workspace] = Children.toArray(layout.props.children);

    expect(isValidElement(navigationDrawer) && navigationDrawer.type).toBe("div");
    if (!isValidElement(navigationDrawer)) {
      throw new Error("Expected desktop navigation region");
    }
    const desktopNavigationElement = navigationDrawer as ReactElement<{
      className: string;
      children: ReactElement;
    }>;
    expect(desktopNavigationElement.props.className).toBe(styles.desktopNavigation);
    expect(getElementTypeName(desktopNavigationElement.props.children)).toBe(
      "AstrologerNavigationDrawer"
    );
    expect(isValidElement(workspace) && workspace.type).toBe("div");
    if (!isValidElement(workspace)) {
      throw new Error("Expected app shell workspace region");
    }
    const workspaceElement = workspace as ReactElement<{
      className: string;
      children: ReactElement[];
    }>;
    expect(workspaceElement.props.className).toBe(styles.workspace);

    const [header, main, mobileNavigation] = Children.toArray(workspaceElement.props.children);

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
    expect(getElementTypeName(mainElement.props.children)).toBe("AstrologerRouteOutlet");
    expect(isValidElement(mobileNavigation) && mobileNavigation.type).toBe("div");
    if (!isValidElement(mobileNavigation)) {
      throw new Error("Expected mobile navigation region");
    }
    const mobileNavigationElement = mobileNavigation as ReactElement<{
      className: string;
      children: ReactElement;
    }>;
    expect(mobileNavigationElement.props.className).toBe(styles.mobileNavigation);
    expect(getElementTypeName(mobileNavigationElement.props.children)).toBe(
      "AstrologerMobileNavigation"
    );
  });

  it("keeps the application shell within the viewport while main content scrolls", () => {
    expect(appLayoutCss).toContain("height: 100dvh;");
    expect(appLayoutCss).toContain(".shell {\n  display: grid;");
    expect(appLayoutCss).toContain(".workspace {\n  display: grid;");
    expect(appLayoutCss).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(appLayoutCss).toContain(
      "grid-template-rows: var(--astrologer-app-header-height) minmax(0, 1fr);"
    );
    expect(appLayoutCss).toContain("overflow: hidden;");
    expect(appLayoutCss).toContain(".main {\n  min-height: 0;");
    expect(appLayoutCss).toMatch(/\.main\s*\{[^}]*min-width:\s*0/s);
    expect(appLayoutCss).toContain("overflow: auto;");
    expect(appLayoutCss).toContain('@import "@elevenhouse/design-system/motion.css";');
    expect(appLayoutCss).not.toContain("min-height: 100dvh;");
  });

  it("replaces the desktop rail with a full-width workspace and bottom navigation on mobile", () => {
    expect(appLayoutCss).toContain("@media (max-width: 700px)");
    expect(appLayoutCss).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(appLayoutCss).toContain("grid-template-rows: 60px minmax(0, 1fr) auto;");
    expect(appLayoutCss).toContain(".desktopNavigation {\n    display: none;");
    expect(appLayoutCss).toContain(".mobileNavigation {\n    display: block;");
    expect(appLayoutCss).toContain("padding: 16px 14px calc(76px + env(safe-area-inset-bottom));");
  });
});

function getElementTypeName(element: ReactElement) {
  if (typeof element.type === "string") {
    return element.type;
  }

  return (element.type as JSXElementConstructor<unknown>).name;
}
