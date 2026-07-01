import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IconButton } from "../../components/IconButton/index.js";
import { NavigationDrawer } from "./NavigationDrawer.js";
import type { ReactNode } from "react";
import type {
  NavigationDrawerItem,
  NavigationDrawerLinkProps,
  NavigationDrawerRenderLink
} from "./types.js";

const navigationDrawerCss = readFileSync(
  fileURLToPath(new URL("./NavigationDrawer.css", import.meta.url)),
  "utf8"
);

// @ts-expect-error NavigationDrawerItem requires an icon.
const navigationDrawerItemWithoutIcon: NavigationDrawerItem = {
  id: "without-icon",
  title: "Без иконки"
};

void navigationDrawerItemWithoutIcon;

describe("NavigationDrawer", () => {
  it("renders branded navigation items with active, badge, and locked states", () => {
    const element = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse",
        subtitle: "ASTROLOGER WORKSPACE"
      },
      items: [
        {
          id: "dashboard",
          title: "Дашборд",
          href: "/dashboard",
          icon: <span data-icon="dashboard" />,
          active: true
        },
        {
          id: "calendar",
          title: "Календарь",
          href: "/calendar",
          icon: <span data-icon="calendar" />,
          badge: "4"
        },
        {
          id: "products",
          title: "Продукты",
          icon: <span data-icon="products" />,
          locked: true
        }
      ],
      footer: (
        <>
          <button type="button" data-footer-item="personal-page">
            Личная страница
          </button>
          <button type="button" data-footer-item="settings">
            Настройки
          </button>
        </>
      ),
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню",
      renderLink: renderTestLink,
      onCollapsedChange: vi.fn()
    });

    const root = element;
    const nav = findElementByType(root, "nav");
    const activeLink = findElementByNavigationItemId(root, "dashboard");
    const calendarLink = findElementByNavigationItemId(root, "calendar");
    const lockedItem = findElementByNavigationItemId(root, "products");
    const badge = findElementByText(root, "4");
    const footer = findElementByClassName(root, "ehNavigationDrawer__footer");
    const personalPage = findElementByProp(root, "data-footer-item", "personal-page");
    const settings = findElementByProp(root, "data-footer-item", "settings");

    expect(root.type).toBe("aside");
    expect(root.props.className).toBe("ehNavigationDrawer");
    expect(nav?.props?.["aria-label"]).toBe("Astrologer workspace");
    expect(JSON.stringify(root.props.children)).toContain("ElevenHouse");
    expect(JSON.stringify(root.props.children)).toContain("ASTROLOGER WORKSPACE");
    expect(activeLink?.props?.className).toContain("ehNavigationDrawer__item--active");
    expect(activeLink?.props?.["aria-current"]).toBe("page");
    expect(calendarLink?.props?.href).toBe("/calendar");
    expect(badge?.props?.className).toBe("ehNavigationDrawer__badge");
    expect(lockedItem?.props?.["aria-disabled"]).toBe(true);
    expect(lockedItem?.props?.className).toContain("ehNavigationDrawer__item--locked");
    expect(footer?.type).toBe("footer");
    expect(footer?.props?.children).toBeDefined();
    expect(personalPage?.type).toBe("button");
    expect(settings?.type).toBe("button");
  });

  it("uses the footer slot as the only bottom composition API", () => {
    const footer = (
      <>
        <button type="button" data-footer-item="personal-page" />
        <button type="button" data-footer-item="settings" />
      </>
    );
    const element = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse"
      },
      items: [],
      footer,
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню",
      renderLink: renderTestLink
    });

    const footerElement = findElementByClassName(element, "ehNavigationDrawer__footer");

    expect(footerElement?.type).toBe("footer");
    expect(footerElement?.props?.children).toBe(footer);
    expect(findElementByClassName(element, "ehNavigationDrawer__spacer")).toBeNull();
    expect(findElementByProp(element, "data-navigation-drawer-personal-page", "true")).toBeNull();
  });

  it("delegates item rendering when renderLink is provided", () => {
    const renderLink = vi.fn(
      (item: NavigationDrawerItem, props: NavigationDrawerLinkProps, children: ReactNode) => (
        <a {...props} data-rendered-id={item.id}>
          {children}
        </a>
      )
    );

    const element = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse"
      },
      items: [
        {
          id: "dashboard",
          title: "Дашборд",
          href: "/dashboard",
          icon: <span data-icon="dashboard" />,
          active: true
        }
      ],
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню",
      renderLink
    });

    const dashboardLink = findElementByNavigationItemId(element, "dashboard");

    expect(renderLink).toHaveBeenCalledTimes(1);
    expect(dashboardLink?.props?.["data-rendered-id"]).toBe("dashboard");
    expect(dashboardLink?.props?.["aria-current"]).toBe("page");
  });

  it("passes normalized item state to renderLink", () => {
    const renderLink = vi.fn(
      (item: NavigationDrawerItem, props: NavigationDrawerLinkProps, children: ReactNode) => (
        <span {...props} data-rendered-id={item.id}>
          {children}
        </span>
      )
    );

    const element = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse"
      },
      items: [
        {
          id: "dashboard",
          title: "Дашборд",
          href: "/dashboard",
          icon: <span data-icon="dashboard" />
        }
      ],
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню",
      renderLink
    });

    expect(findElementByNavigationItemId(element, "dashboard")).not.toBeNull();
    expect(renderLink).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "dashboard",
        href: "/dashboard",
        icon: expect.any(Object),
        badge: null,
        active: false,
        disabled: false,
        locked: false,
        external: false,
        ariaLabel: undefined
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("does not render end adornment content", () => {
    const element = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse"
      },
      items: [
        {
          id: "dashboard",
          title: "Дашборд",
          icon: <span data-icon="dashboard" />,
          endAdornment: <span data-end-adornment="legacy" />
        } as unknown as NavigationDrawerItem
      ],
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню",
      renderLink: renderTestLink
    });

    expect(findElementByProp(element, "data-end-adornment", "legacy")).toBeNull();
    expect(findElementByClassName(element, "ehNavigationDrawer__itemEndAdornment")).toBeNull();
    expect(navigationDrawerCss).not.toContain("ehNavigationDrawer__itemEndAdornment");
  });

  it("does not render a native anchor fallback without renderLink", () => {
    const element = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse"
      },
      items: [
        {
          id: "dashboard",
          title: "Дашборд",
          href: "/dashboard",
          icon: <span data-icon="dashboard" />
        }
      ],
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню"
    } as unknown as Parameters<typeof NavigationDrawer>[0]);

    expect(findElementByType(element, "a")).toBeNull();
    expect(findElementByNavigationItemId(element, "dashboard")?.type).toBe("button");
  });

  it("calls onCollapsedChange with the next collapsed state", () => {
    const onCollapsedChange = vi.fn();
    const element = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse"
      },
      items: [],
      collapsed: false,
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню",
      renderLink: renderTestLink,
      onCollapsedChange
    });

    const collapseButton = findElementByIconButtonLabel(element, "Свернуть меню");

    expect(collapseButton?.type).toBe(IconButton);
    expect(collapseButton?.props?.pressed).toBe(false);
    collapseButton?.props?.onClick?.();

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("renders reference-matched header controls for expanded and collapsed states", () => {
    const expanded = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse"
      },
      items: [],
      collapsed: false,
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню",
      renderLink: renderTestLink
    });
    const collapsed = NavigationDrawer({
      ariaLabel: "Astrologer workspace",
      brand: {
        title: "ElevenHouse"
      },
      items: [],
      collapsed: true,
      collapseLabel: "Свернуть меню",
      expandLabel: "Развернуть меню",
      renderLink: renderTestLink
    });

    const expandedHeaderButton = findElementByIconButtonLabel(expanded, "Свернуть меню");
    const collapsedHeaderButton = findElementByClassName(collapsed, "ehNavigationDrawer__brandRow");
    const collapsedExpandButton = findElementByIconButtonLabel(collapsed, "Развернуть меню");

    expect(expandedHeaderButton?.props?.className).toBe("ehNavigationDrawer__collapseButton");
    expect(expandedHeaderButton?.props?.size).toBe("medium");
    expect(collapsedHeaderButton?.props?.children).not.toContain(collapsedExpandButton);
    expect(collapsedExpandButton?.props?.className).toBe("ehNavigationDrawer__expandButton");
    expect(collapsedExpandButton?.props?.size).toBe("medium");
    expect(collapsedExpandButton?.props?.pressed).toBe(true);
  });

  it("keeps the header dimensions aligned with the reference drawer", () => {
    expect(navigationDrawerCss).toContain("--eh-navigation-drawer-width: 248px;");
    expect(navigationDrawerCss).toContain("--eh-navigation-drawer-collapsed-width: 72px;");
    expect(navigationDrawerCss).toContain(
      "background: linear-gradient(180deg, rgb(17 15 38 / 0.92), rgb(11 11 31 / 0.92));"
    );
    expect(navigationDrawerCss).toContain("padding: 0 0 var(--eh-space-14);");
    expect(navigationDrawerCss).toContain("padding: var(--eh-space-20);");
    expect(navigationDrawerCss).toContain("padding: 0 12px;");
    expect(navigationDrawerCss).toContain(".ehNavigationDrawer__footer > *:not(:last-child)");
    expect(navigationDrawerCss).toContain("width: 30px;");
    expect(navigationDrawerCss).toContain("height: 30px;");
    expect(navigationDrawerCss).toContain("border-radius: 9px;");
    expect(navigationDrawerCss).toContain("margin: 0 auto var(--eh-space-8);");
  });

  it("keeps brand title, subtitle, and drawer toggle visually separated", () => {
    expect(navigationDrawerCss).toContain(".ehNavigationDrawer__brandTitle {\n  display: block;");
    expect(navigationDrawerCss).toContain(".ehNavigationDrawer__brandSubtitle {\n  display: block;");
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer__brandSubtitle {\n  display: block;\n  overflow: hidden;\n  color: var(--eh-color-muted);\n  font-family: var(--eh-font-sans);"
    );
    expect(navigationDrawerCss).toContain("overflow: hidden;");
    expect(navigationDrawerCss).toContain("background: rgb(22 20 47 / 0.82);");
    expect(navigationDrawerCss).toContain("border: 1px solid rgb(216 212 236 / 0.14);");
  });

  it("keeps navigation item height at 40px", () => {
    expect(navigationDrawerCss).toContain("min-height: 40px;");
    expect(navigationDrawerCss).toContain("padding: 10px 12px;");
  });

  it("sets navigation item text size and state weights", () => {
    expect(navigationDrawerCss).toContain(
      "font: 500 14px / var(--eh-line-height-120) var(--eh-font-sans);"
    );
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer__item--active {\n  border-color: var(--eh-navigation-drawer-border-strong);\n  background-color: var(--eh-navigation-drawer-active-bg);\n  color: var(--eh-color-moon-100);\n  font-weight: 600;\n}"
    );
  });

  it("uses design-system motion tokens for drawer transitions", () => {
    expect(navigationDrawerCss).toContain('@import "../../motion/motion.css";');
    expect(navigationDrawerCss).toContain(
      "transition: width var(--eh-motion-duration-panel) var(--eh-motion-ease-fluid);"
    );
    expect(navigationDrawerCss).toContain(
      "--eh-motion-duration-panel: var(--eh-motion-duration-normal, 320ms);"
    );
    expect(navigationDrawerCss).toContain(
      "--eh-motion-ease-fluid: var(--eh-motion-ease-standard, cubic-bezier(0.16, 1, 0.3, 1));"
    );
    expect(navigationDrawerCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(navigationDrawerCss).toContain("transition: none;");
  });

  it("softly hides drawer copy during collapse without display none", () => {
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer__brandText,\n.ehNavigationDrawer__itemTitle {"
    );
    expect(navigationDrawerCss).toContain(
      "opacity var(--eh-motion-duration-state) var(--eh-motion-ease-fluid)"
    );
    expect(navigationDrawerCss).toContain(
      "transform var(--eh-motion-duration-state) var(--eh-motion-ease-fluid)"
    );
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer--collapsed .ehNavigationDrawer__brandText,\n.ehNavigationDrawer--collapsed .ehNavigationDrawer__itemTitle {\n  max-width: 0;\n  opacity: 0;\n  pointer-events: none;\n  position: absolute;\n  transform: translateX(-6px);\n}"
    );
    expect(navigationDrawerCss).not.toContain(
      ".ehNavigationDrawer--collapsed .ehNavigationDrawer__brandText,\n.ehNavigationDrawer--collapsed .ehNavigationDrawer__itemTitle {\n  display: none;\n}"
    );
  });

  it("animates drawer layout spacing through motion tokens", () => {
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer__brandRow {\n  display: flex;"
    );
    expect(navigationDrawerCss).toContain(
      "gap var(--eh-motion-duration-panel) var(--eh-motion-ease-fluid)"
    );
    expect(navigationDrawerCss).toContain(
      "padding var(--eh-motion-duration-panel) var(--eh-motion-ease-fluid)"
    );
    expect(navigationDrawerCss).toContain(
      "margin var(--eh-motion-duration-panel) var(--eh-motion-ease-fluid)"
    );
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer--collapsed .ehNavigationDrawer__item {\n  gap: 0;"
    );
  });

  it("colors only the active item icon with the active icon token", () => {
    expect(navigationDrawerCss).toContain(
      "--eh-navigation-drawer-active-icon: rgb(246 210 102);"
    );
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer__item--active .ehNavigationDrawer__itemIcon {\n  color: var(--eh-navigation-drawer-active-icon);\n}"
    );
  });

  it("keeps the active item border visible", () => {
    expect(navigationDrawerCss).toContain(
      "--eh-navigation-drawer-border-strong: rgb(244 196 48 / 0.42);"
    );
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer__item--active {\n  border-color: var(--eh-navigation-drawer-border-strong);"
    );
  });

  it("uses the active background color token for the selected item", () => {
    expect(navigationDrawerCss).toContain(
      "--eh-navigation-drawer-active-bg: rgb(244 196 48 / 0.14);"
    );
    expect(navigationDrawerCss).toContain(
      ".ehNavigationDrawer__item--active {\n  border-color: var(--eh-navigation-drawer-border-strong);\n  background-color: var(--eh-navigation-drawer-active-bg);"
    );
  });
});

const renderTestLink: NavigationDrawerRenderLink = (item, props, children) => (
  <span {...props} data-rendered-id={item.id}>
    {children}
  </span>
);

type TestElement = {
  type?: unknown;
  props?: {
    children?: unknown;
    className?: string;
    href?: string;
    target?: string;
    rel?: string;
    onClick?: () => void;
    [key: string]: unknown;
  };
};

function findElementByType(node: unknown, type: string): TestElement | null {
  return findElement(node, (element) => element.type === type);
}

function findElementByText(node: unknown, text: string): TestElement | null {
  return findElement(node, (element) => element.props?.children === text);
}

function findElementByIconButtonLabel(node: unknown, label: string): TestElement | null {
  return findElement(
    node,
    (element) => element.type === IconButton && element.props?.label === label
  );
}

function findElementByNavigationItemId(node: unknown, itemId: string): TestElement | null {
  return findElement(
    node,
    (element) => element.props?.["data-navigation-drawer-item-id"] === itemId
  );
}

function findElementByClassName(node: unknown, className: string): TestElement | null {
  return findElement(
    node,
    (element) => typeof element.props?.className === "string" && element.props.className === className
  );
}

function findElementByProp(node: unknown, propName: string, value: unknown): TestElement | null {
  return findElement(node, (element) => element.props?.[propName] === value);
}

function findElement(
  node: unknown,
  matches: (element: TestElement) => boolean
): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, matches);
      if (match) {
        return match;
      }
    }
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as TestElement;
  if (matches(element)) {
    return element;
  }

  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    const match = findElement(child, matches);
    if (match) {
      return match;
    }
  }

  if (typeof element.type === "function" && element.type !== IconButton) {
    return findElement(element.type(element.props), matches);
  }

  return null;
}
