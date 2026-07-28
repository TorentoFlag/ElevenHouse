// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./ActionMenu.js";

const actionMenuCss = readFileSync(
  join(process.cwd(), "packages/design-system/src/components/ActionMenu/ActionMenu.css"),
  "utf8"
);

afterEach(() => {
  cleanup();
});

describe("ActionMenu", () => {
  it("renders an accessible closed menu button shell", () => {
    const markup = renderToStaticMarkup(
      <ActionMenu
        label="Действия продукта"
        items={[
          { id: "edit", label: "Изменить", onSelect: vi.fn() },
          { id: "archive", label: "В архив", tone: "danger", onSelect: vi.fn() }
        ]}
      />
    );

    expect(markup).toContain('class="ehActionMenu"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Действия продукта");
    expect(markup).not.toContain('role="menu"');
  });

  it("defines trigger, popover, item and danger item styles", () => {
    expect(actionMenuCss).toContain(".ehActionMenu");
    expect(actionMenuCss).toContain(".ehActionMenu__trigger");
    expect(actionMenuCss).toContain(".ehActionMenu__popover");
    expect(actionMenuCss).toContain(".ehActionMenu__item");
    expect(actionMenuCss).toContain(".ehActionMenu__item--danger");
  });

  it("supports an icon-only trigger with an explicit accessible label", () => {
    const markup = renderToStaticMarkup(
      <ActionMenu
        label={<span aria-hidden="true">...</span>}
        triggerAriaLabel="Статус продукта"
        showChevron={false}
        items={[{ id: "edit", label: "Изменить", onSelect: vi.fn() }]}
      />
    );

    expect(markup).toContain('aria-label="Статус продукта"');
    expect(markup).toContain("...");
    expect(markup).not.toContain("ehActionMenu__triggerChevron");
  });

  it("can be controlled by the owning surface", () => {
    const markup = renderToStaticMarkup(
      <ActionMenu
        label="Действия"
        open
        onOpenChange={vi.fn()}
        items={[{ id: "edit", label: "Изменить", onSelect: vi.fn() }]}
      />
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('role="menu"');
    expect(markup).toContain("Изменить");
  });

  it("uses the latest controlled open-change handler when outside click closes the menu", () => {
    const initialOnOpenChange = vi.fn();
    const nextOnOpenChange = vi.fn();
    const items = [{ id: "edit", label: "Изменить", onSelect: vi.fn() }];
    const { rerender } = render(
      <ActionMenu label="Действия" open onOpenChange={initialOnOpenChange} items={items} />
    );

    rerender(<ActionMenu label="Действия" open onOpenChange={nextOnOpenChange} items={items} />);
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.mouseDown(document.body);

    expect(initialOnOpenChange).not.toHaveBeenCalled();
    expect(nextOnOpenChange).toHaveBeenCalledWith(false);
  });
});
